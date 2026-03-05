import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("FIREBASE_API_KEY"), projectId = Deno.env.get("FIREBASE_PROJECT_ID"), messagingSenderId = Deno.env.get("FIREBASE_MESSAGING_SENDER_ID"), appId = Deno.env.get("FIREBASE_APP_ID"), vapidKey = Deno.env.get("FIREBASE_VAPID_KEY");
    if (!apiKey || !projectId || !messagingSenderId || !appId) return new Response(JSON.stringify({ error: "Firebase configuration not complete" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const authDomain = projectId.includes('.firebaseapp.com') ? projectId : `${projectId}.firebaseapp.com`;
    const storageBucket = projectId.includes('.appspot.com') || projectId.includes('.firebasestorage.app') ? projectId : `${projectId}.appspot.com`;
    return new Response(JSON.stringify({ config: { apiKey, authDomain, projectId: projectId.replace('.firebaseapp.com', '').replace('.appspot.com', ''), storageBucket, messagingSenderId, appId }, vapidKey }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) { return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
});
