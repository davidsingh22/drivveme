import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
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
    const { paymentId, rideId, reason } = await req.json();
    if (!paymentId && !rideId) throw new Error("Missing paymentId or rideId");
    let query = supabase.from("payments").select("*, rides!inner(rider_id, driver_id, status)").eq("status", "succeeded");
    if (paymentId) query = query.eq("id", paymentId); else if (rideId) query = query.eq("ride_id", rideId);
    const { data: payment } = await query.single();
    if (!payment) throw new Error("Payment not found or already refunded");
    const { data: adminRole } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").single();
    const ride = payment.rides as { rider_id: string; driver_id: string; status: string };
    if (ride.rider_id !== user.id && ride.driver_id !== user.id && !adminRole) throw new Error("Unauthorized");
    if (!payment.stripe_payment_intent_id) throw new Error("No Stripe payment intent found");
    const refund = await stripe.refunds.create({ payment_intent: payment.stripe_payment_intent_id, reason: "requested_by_customer", metadata: { refund_reason: reason || "Customer requested refund", refunded_by: user.id, ride_id: payment.ride_id } });
    await supabase.from("payments").update({ status: "refunded" }).eq("id", payment.id);
    if (ride.status !== "cancelled" && ride.status !== "completed") await supabase.from("rides").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: user.id, cancellation_reason: reason || "Payment refunded" }).eq("id", payment.ride_id);
    return new Response(JSON.stringify({ success: true, refundId: refund.id, amount: refund.amount / 100, currency: refund.currency.toUpperCase() }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (e: any) { return new Response(JSON.stringify({ error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }); }
});
