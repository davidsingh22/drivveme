import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateInput(input: unknown) { if (!input || typeof input !== 'object') return { valid: false, error: 'Invalid' }; const { userId, title, body, data, url } = input as Record<string, unknown>; if (typeof userId !== 'string' || !UUID_REGEX.test(userId)) return { valid: false, error: 'Invalid userId' }; if (typeof title !== 'string' || !title.length) return { valid: false, error: 'Missing title' }; return { valid: true, data: { userId, title, body: typeof body === 'string' ? body : undefined, data: data as Record<string, string> | undefined, url: typeof url === 'string' ? url : undefined } }; }
let cachedAccessToken: string | null = null; let tokenExpiresAt = 0;
async function getAccessToken(): Promise<string> {
  const now = Date.now(); if (cachedAccessToken && tokenExpiresAt > now + 300000) return cachedAccessToken;
  const saJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT"); if (!saJson) throw new Error("FIREBASE_SERVICE_ACCOUNT not configured");
  const sa = JSON.parse(saJson); const nowSec = Math.floor(now / 1000);
  const header = { alg: "RS256", typ: "JWT" }; const payload = { iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: nowSec, exp: nowSec + 3600 };
  const enc = new TextEncoder(); const hB64 = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); const pB64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const signInput = `${hB64}.${pB64}`; const pem = sa.private_key.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, "");
  const binaryKey = Uint8Array.from(atob(pem), c => c.charCodeAt(0)); const cryptoKey = await crypto.subtle.importKey("pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, enc.encode(signInput)); const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${signInput}.${sigB64}`; const tokenRes = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` });
  if (!tokenRes.ok) throw new Error(`Token exchange failed: ${await tokenRes.text()}`); const td = await tokenRes.json(); cachedAccessToken = td.access_token; tokenExpiresAt = now + (td.expires_in || 3600) * 1000; return cachedAccessToken!;
}
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization"), serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, supabaseUrl = Deno.env.get("SUPABASE_URL")!, supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    let isAuthorized = false;
    if (authHeader === `Bearer ${serviceRoleKey}`) isAuthorized = true;
    else if (authHeader?.startsWith('Bearer ')) { const uc = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } }); const token = authHeader.replace('Bearer ', ''); const { data: cd } = await uc.auth.getClaims(token); if (cd?.claims?.sub) { const { data: rd } = await createClient(supabaseUrl, serviceRoleKey).from('user_roles').select('role').eq('user_id', cd.claims.sub as string).eq('role', 'admin').maybeSingle(); if (rd) isAuthorized = true; } }
    if (!isAuthorized) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID");
    let rawInput: unknown; try { rawInput = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
    const v = validateInput(rawInput); if (!v.valid || !v.data) return new Response(JSON.stringify({ error: v.error }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { userId, title, body, data, url } = v.data;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const [subsResult, accessToken] = await Promise.all([supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId), getAccessToken()]);
    const { data: subscriptions } = subsResult;
    if (!subscriptions?.length) return new Response(JSON.stringify({ message: "No subscriptions", sent: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const results = await Promise.all(subscriptions.map(async (sub) => {
      const fcmToken = sub.p256dh; if (!fcmToken || sub.auth !== 'fcm') return { id: sub.id, success: false, reason: "Not FCM" };
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${firebaseProjectId}/messages:send`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ message: { token: fcmToken, notification: { title, body: body || "" }, data: { url: url || "/", ...(data || {}) }, webpush: { notification: { icon: "/favicon.ico", vibrate: [300, 100, 300], requireInteraction: true } } } }) });
      if (res.ok) return { id: sub.id, success: true }; const t = await res.text(); if (res.status === 404 || res.status === 410 || t.includes("UNREGISTERED")) await supabase.from("push_subscriptions").delete().eq("id", sub.id); return { id: sub.id, success: false, reason: t };
    }));
    return new Response(JSON.stringify({ sent: results.filter(r => r.success).length, total: results.length, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) { return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
});
