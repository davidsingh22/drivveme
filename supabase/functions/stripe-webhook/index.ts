import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY"); if (!stripeKey) throw new Error("Stripe secret key not configured");
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!, supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.text(); const signature = req.headers.get("stripe-signature");
    let event: Stripe.Event;
    if (webhookSecret) { if (!signature) return new Response(JSON.stringify({ error: "Missing stripe-signature" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); try { event = stripe.webhooks.constructEvent(body, signature, webhookSecret); } catch (err) { return new Response(JSON.stringify({ error: "Invalid webhook signature" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); } }
    else { event = JSON.parse(body) as Stripe.Event; }
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { data: updatedPayments } = await supabase.from("payments").update({ status: "succeeded" }).eq("stripe_payment_intent_id", pi.id).select("ride_id");
        const rideId = updatedPayments?.[0]?.ride_id;
        if (rideId) {
          const { data: ride } = await supabase.from("rides").update({ status: "searching" }).eq("id", rideId).eq("status", "pending_payment").select("id, pickup_address, dropoff_address, estimated_fare, pickup_lat, pickup_lng").single();
          if (ride) { try { const r = await fetch(`${supabaseUrl}/functions/v1/notify-drivers-tiered`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` }, body: JSON.stringify({ rideId: ride.id, pickupAddress: ride.pickup_address, dropoffAddress: ride.dropoff_address, estimatedFare: Number(ride.estimated_fare), pickupLat: ride.pickup_lat, pickupLng: ride.pickup_lng, tier: 1, excludeDriverIds: [] }) }); await r.json(); } catch (e) { console.error("Dispatch error:", e); } }
        }
        break;
      }
      case "payment_intent.payment_failed": { const pi = event.data.object as Stripe.PaymentIntent; await supabase.from("payments").update({ status: "failed" }).eq("stripe_payment_intent_id", pi.id); break; }
    }
    return new Response(JSON.stringify({ received: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (e: any) { return new Response(JSON.stringify({ error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }); }
});
