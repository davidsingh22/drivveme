import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" };
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY"); if (!stripeKey) throw new Error("Stripe secret key not configured");
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!, supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const authHeader = req.headers.get("Authorization"); if (!authHeader) throw new Error("Missing authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");
    const { rideId, tipAmount, adminCharge } = await req.json();
    if (!rideId || !tipAmount || tipAmount <= 0) throw new Error("Missing or invalid rideId/tipAmount");
    let riderId: string;
    if (adminCharge) {
      const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: user.id });
      if (!isAdmin) throw new Error("Only admins can charge tips");
      const { data: ride } = await supabase.from("rides").select("id, rider_id, status, tip_status").eq("id", rideId).single();
      if (!ride || ride.status !== "completed" || ride.tip_status === "charged" || !ride.rider_id) throw new Error("Invalid ride for tip");
      riderId = ride.rider_id;
    } else {
      const { data: ride } = await supabase.from("rides").select("id, rider_id, status, tip_status").eq("id", rideId).eq("rider_id", user.id).single();
      if (!ride || ride.status !== "completed" || ride.tip_status === "charged") throw new Error("Invalid ride for tip");
      riderId = user.id;
    }
    const { data: rideData } = await supabase.from("rides").select("driver_id").eq("id", rideId).single();
    let cardToCharge;
    const { data: defaultCard } = await supabase.from("saved_cards").select("*").eq("user_id", riderId).eq("is_default", true).single();
    cardToCharge = defaultCard;
    if (!cardToCharge) { const { data: anyCard } = await supabase.from("saved_cards").select("*").eq("user_id", riderId).order("created_at", { ascending: false }).limit(1).single(); cardToCharge = anyCard; }
    if (!cardToCharge) throw new Error("No saved card found for this rider.");
    const paymentMethod = await stripe.paymentMethods.retrieve(cardToCharge.stripe_payment_method_id);
    if (!paymentMethod.customer) throw new Error("Payment method not attached to a Stripe customer");
    const paymentIntent = await stripe.paymentIntents.create({ amount: Math.round(tipAmount * 100), currency: "cad", customer: paymentMethod.customer as string, payment_method: cardToCharge.stripe_payment_method_id, off_session: true, confirm: true, description: `Drivveme Tip - Ride ${rideId.substring(0, 8)}`, metadata: { ride_id: rideId, rider_id: riderId, type: "tip", driver_id: rideData?.driver_id || "", charged_by: adminCharge ? "admin" : "rider" } });
    if (paymentIntent.status === "succeeded") {
      await supabase.from("rides").update({ tip_amount: tipAmount, tip_status: "charged" }).eq("id", rideId);
      await supabase.from("payments").insert({ ride_id: rideId, payer_id: riderId, amount: tipAmount, currency: "CAD", payment_type: "tip", status: "succeeded", stripe_payment_intent_id: paymentIntent.id });
      if (rideData?.driver_id) { const { data: dp } = await supabase.from("driver_profiles").select("total_earnings").eq("user_id", rideData.driver_id).single(); if (dp) await supabase.from("driver_profiles").update({ total_earnings: (dp.total_earnings || 0) + tipAmount }).eq("user_id", rideData.driver_id); }
      return new Response(JSON.stringify({ success: true, paymentIntentId: paymentIntent.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    throw new Error(`Payment not successful: ${paymentIntent.status}`);
  } catch (e: any) { return new Response(JSON.stringify({ error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }); }
});
