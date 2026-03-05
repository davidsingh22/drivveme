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
    const { data: driverRole } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "driver").single();
    if (!driverRole) throw new Error("Only drivers can request payouts");
    const { data: driverProfile } = await supabase.from("driver_profiles").select("*").eq("user_id", user.id).single();
    if (!driverProfile) throw new Error("Driver profile not found");
    const { amount } = await req.json();
    if (!amount || amount <= 0) throw new Error("Invalid payout amount");
    const availableBalance = Number(driverProfile.total_earnings) || 0;
    if (amount > availableBalance) throw new Error(`Insufficient balance. Available: $${availableBalance.toFixed(2)}`);
    let stripeAccountId = driverProfile.stripe_account_id;
    if (!stripeAccountId) {
      const { data: profile } = await supabase.from("profiles").select("email, first_name, last_name").eq("user_id", user.id).single();
      const account = await stripe.accounts.create({ type: "express", country: "CA", email: profile?.email || undefined, capabilities: { card_payments: { requested: true }, transfers: { requested: true } }, business_type: "individual" });
      stripeAccountId = account.id;
      await supabase.from("driver_profiles").update({ stripe_account_id: stripeAccountId }).eq("user_id", user.id);
    }
    const account = await stripe.accounts.retrieve(stripeAccountId);
    if (!account.details_submitted) {
      const accountLink = await stripe.accountLinks.create({ account: stripeAccountId, refresh_url: `${req.headers.get("origin")}/earnings`, return_url: `${req.headers.get("origin")}/earnings?onboarded=true`, type: "account_onboarding" });
      return new Response(JSON.stringify({ success: false, needsOnboarding: true, onboardingUrl: accountLink.url }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }
    const transfer = await stripe.transfers.create({ amount: Math.round(amount * 100), currency: "cad", destination: stripeAccountId, description: `Driver payout for ${user.id}` });
    const newBalance = availableBalance - amount;
    await supabase.from("driver_profiles").update({ total_earnings: newBalance }).eq("user_id", user.id);
    return new Response(JSON.stringify({ success: true, transferId: transfer.id, amount, currency: "CAD", newBalance }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (e: any) { return new Response(JSON.stringify({ error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }); }
});
