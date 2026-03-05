import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateInput(input: unknown) { if (!input || typeof input !== 'object') return { valid: false, error: 'Invalid JSON body' }; const { userId, title, body, data, url } = input as Record<string, unknown>; if (typeof userId !== 'string' || !UUID_REGEX.test(userId)) return { valid: false, error: 'userId must be a valid UUID' }; if (typeof title !== 'string' || !title.length || title.length > 100) return { valid: false, error: 'title must be 1-100 characters' }; return { valid: true, data: { userId, title, body: typeof body === 'string' ? body : undefined, data: data as Record<string, string> | undefined, url: typeof url === 'string' ? url : undefined } }; }
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization"), serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    let rawInput: unknown; try { rawInput = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
    const v = validateInput(rawInput); if (!v.valid || !v.data) return new Response(JSON.stringify({ error: v.error }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { userId, title, body, data, url } = v.data;
    const serverKey = Deno.env.get("FCM_SERVER_KEY"); if (!serverKey) throw new Error("FCM_SERVER_KEY not configured");
    const supabase = createClient(supabaseUrl, serviceRoleKey!);
    const { data: subscriptions } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
    if (!subscriptions?.length) return new Response(JSON.stringify({ message: "No subscriptions", sent: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const projectId = Deno.env.get("FIREBASE_PROJECT_ID");
    const results: Array<{ id: string; success: boolean; reason?: string }> = [];
    for (const sub of subscriptions) {
      const fcmToken = sub.endpoint.includes("fcm.googleapis.com") ? sub.endpoint.split("/").pop() : sub.p256dh;
      if (!fcmToken) { results.push({ id: sub.id, success: false, reason: "No FCM token" }); continue; }
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, { method: "POST", headers: { Authorization: `Bearer ${serverKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ message: { token: fcmToken, notification: { title, body: body || "" }, data: { url: url || "/", ...(data || {}) }, webpush: { notification: { icon: "/favicon.ico", vibrate: [300, 100, 300], requireInteraction: true } } } }) });
      if (res.ok) results.push({ id: sub.id, success: true }); else { const t = await res.text(); if (res.status === 404 || res.status === 410 || t.includes("UNREGISTERED")) await supabase.from("push_subscriptions").delete().eq("id", sub.id); results.push({ id: sub.id, success: false, reason: t }); }
    }
    return new Response(JSON.stringify({ sent: results.filter(r => r.success).length, total: results.length, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) { return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
});
