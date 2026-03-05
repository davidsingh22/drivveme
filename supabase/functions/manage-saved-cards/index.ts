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
    const { action, paymentMethodId, nickname, cardId, rideId, amount } = await req.json();
    const getOrCreateCustomer = async () => {
      const { data: profile } = await supabase.from("profiles").select("stripe_customer_id").eq("user_id", user.id).single();
      if (profile?.stripe_customer_id) return profile.stripe_customer_id;
      const customer = await stripe.customers.create({ email: user.email, metadata: { supabase_user_id: user.id } });
      return customer.id;
    };
    if (action === "list") { const { data: cards } = await supabase.from("saved_cards").select("*").eq("user_id", user.id).order("is_default", { ascending: false }).order("created_at", { ascending: false }); return new Response(JSON.stringify({ cards: cards || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
    if (action === "save") {
      if (!paymentMethodId || !nickname) throw new Error("Missing paymentMethodId or nickname");
      const customerId = await getOrCreateCustomer();
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
      const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
      if (!pm.card) throw new Error("Invalid payment method");
      const { count } = await supabase.from("saved_cards").select("*", { count: "exact", head: true }).eq("user_id", user.id);
      const { data: savedCard, error } = await supabase.from("saved_cards").insert({ user_id: user.id, stripe_payment_method_id: paymentMethodId, nickname, card_brand: pm.card.brand || "unknown", card_last_four: pm.card.last4 || "****", card_exp_month: pm.card.exp_month, card_exp_year: pm.card.exp_year, is_default: (count || 0) === 0 }).select().single();
      if (error) throw error;
      return new Response(JSON.stringify({ card: savedCard }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (action === "delete") {
      if (!cardId) throw new Error("Missing cardId");
      const { data: card } = await supabase.from("saved_cards").select("*").eq("id", cardId).eq("user_id", user.id).single();
      if (!card) throw new Error("Card not found");
      try { await stripe.paymentMethods.detach(card.stripe_payment_method_id); } catch {}
      await supabase.from("saved_cards").delete().eq("id", cardId).eq("user_id", user.id);
      if (card.is_default) { const { data: remaining } = await supabase.from("saved_cards").select("id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1); if (remaining?.length) await supabase.from("saved_cards").update({ is_default: true }).eq("id", remaining[0].id); }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (action === "set_default") {
      if (!cardId) throw new Error("Missing cardId");
      await supabase.from("saved_cards").update({ is_default: false }).eq("user_id", user.id);
      await supabase.from("saved_cards").update({ is_default: true }).eq("id", cardId).eq("user_id", user.id);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (action === "pay_with_saved") {
      if (!cardId || !rideId || !amount) throw new Error("Missing cardId, rideId, or amount");
      const { data: card } = await supabase.from("saved_cards").select("*").eq("id", cardId).eq("user_id", user.id).single();
      if (!card) throw new Error("Card not found");
      const { data: ride } = await supabase.from("rides").select("*").eq("id", rideId).eq("rider_id", user.id).single();
      if (!ride) throw new Error("Ride not found");
      const pm = await stripe.paymentMethods.retrieve(card.stripe_payment_method_id);
      if (!pm.customer) throw new Error("Payment method not attached to customer");
      const pi = await stripe.paymentIntents.create({ amount: Math.round(amount * 100), currency: "cad", customer: pm.customer as string, payment_method: card.stripe_payment_method_id, off_session: true, confirm: true, metadata: { ride_id: rideId, user_id: user.id } });
      await supabase.from("payments").insert({ ride_id: rideId, payer_id: user.id, amount, currency: "CAD", payment_type: "ride_payment", status: pi.status === "succeeded" ? "succeeded" : "pending", stripe_payment_intent_id: pi.id });
      if (pi.status === "succeeded") await supabase.from("rides").update({ status: "searching" }).eq("id", rideId);
      return new Response(JSON.stringify({ success: pi.status === "succeeded", status: pi.status, paymentIntentId: pi.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    throw new Error("Invalid action");
  } catch (e: any) { return new Response(JSON.stringify({ error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }); }
});
