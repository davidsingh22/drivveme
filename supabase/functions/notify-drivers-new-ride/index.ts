// This is the full notify-drivers-new-ride function - writing complete file

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateInput(input: unknown) {
  if (!input || typeof input !== 'object') return { valid: false, error: 'Invalid JSON body' };
  const { rideId, pickupAddress, dropoffAddress, estimatedFare, pickupLat, pickupLng, maxDistanceKm = 15 } = input as Record<string, unknown>;
  if (typeof rideId !== 'string' || !UUID_REGEX.test(rideId)) return { valid: false, error: 'rideId must be a valid UUID' };
  return { valid: true, data: { rideId, pickupAddress: pickupAddress as string, dropoffAddress: dropoffAddress as string, estimatedFare: estimatedFare as number, pickupLat: pickupLat as number, pickupLng: pickupLng as number, maxDistanceKm: (maxDistanceKm as number) || 15 } };
}

function calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getAccessToken(): Promise<string> {
  const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (!serviceAccountJson) throw new Error("FIREBASE_SERVICE_ACCOUNT not configured");
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 };
  const encoder = new TextEncoder();
  const hB64 = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const pB64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const signInput = `${hB64}.${pB64}`;
  const pem = sa.private_key.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, "");
  const binaryKey = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, encoder.encode(signInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${signInput}.${sigB64}`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` });
  if (!tokenResponse.ok) throw new Error(`Failed to get access token: ${await tokenResponse.text()}`);
  return (await tokenResponse.json()).access_token;
}

async function sendOneSignalDriverAlert(rideId: string, pickupAddress?: string, driverUserIds?: string[]) {
  const apiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
  if (!apiKey) return { success: false, error: "Missing OneSignal API key" };
  const appId = Deno.env.get("ONESIGNAL_APP_ID") || "5a6c4131-8faa-4969-b5c4-5a09033c8e2a";
  const basePayload = { app_id: appId, headings: { en: "New Ride Request! 🚗" }, contents: { en: "A rider is looking for a trip nearby." }, data: { ride_id: rideId, type: "new_ride" }, priority: 10, ttl: 0, ios_sound: "default", android_sound: "default", content_available: true, mutable_content: true };

  const sendPayload = async (targeting: Record<string, unknown>, label: string) => {
    try {
      const res = await fetch("https://onesignal.com/api/v1/notifications", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Basic ${apiKey}` }, body: JSON.stringify({ ...basePayload, ...targeting }) });
      const result = await res.json();
      console.log(`OneSignal ${label}:`, JSON.stringify(result));
      return { success: res.ok, recipients: result?.recipients || 0, error: result?.errors?.[0] };
    } catch (e) { return { success: false, recipients: 0, error: String(e) }; }
  };

  if (driverUserIds?.length) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: profiles } = await supabase.from("profiles").select("user_id, onesignal_player_id").in("user_id", driverUserIds);
    const playerIds = (profiles || []).map(p => p.onesignal_player_id).filter(Boolean) as string[];
    if (playerIds.length > 0) {
      const r1 = await sendPayload({ include_player_ids: playerIds }, "player_ids");
      if (r1.recipients > 0) return { success: true };
    }
  }
  const r2 = await sendPayload({ filters: [{ field: "tag", key: "role", relation: "=", value: "driver" }] }, "tag_broadcast");
  return { success: r2.recipients > 0, error: r2.error };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID");

    let rawInput: unknown;
    try { rawInput = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

    const raw = rawInput as Record<string, unknown>;
    const isTrigger = raw.source === "trigger";
    let rideId: string, pickupAddress: string | undefined, dropoffAddress: string | undefined, estimatedFare: number | undefined, pickupLat: number | undefined, pickupLng: number | undefined, maxDistanceKm = 15;

    if (isTrigger) {
      rideId = raw.ride_id as string;
      pickupAddress = raw.pickup_address as string | undefined;
      dropoffAddress = raw.dropoff_address as string | undefined;
      estimatedFare = raw.estimated_fare as number | undefined;
      pickupLat = raw.pickup_lat as number | undefined;
      pickupLng = raw.pickup_lng as number | undefined;
    } else {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const v = validateInput(rawInput);
      if (!v.valid || !v.data) return new Response(JSON.stringify({ error: v.error }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      ({ rideId, pickupAddress, dropoffAddress, estimatedFare, pickupLat, pickupLng, maxDistanceKm } = v.data);
    }

    console.log("Notifying nearby drivers of new ride:", rideId);
    const supabase = createClient(supabaseUrl, serviceRoleKey!);

    const { data: onlineDrivers, error: driverError } = await supabase.from("driver_profiles").select("user_id, current_lat, current_lng").eq("is_online", true);
    if (driverError) return new Response(JSON.stringify({ error: "Failed to fetch drivers" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (!onlineDrivers?.length) return new Response(JSON.stringify({ message: "No online drivers found", sent: 0, nearbyDrivers: 0, totalOnline: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let nearbyDrivers = onlineDrivers;
    if (pickupLat && pickupLng) {
      nearbyDrivers = onlineDrivers.filter(d => !d.current_lat || !d.current_lng || calculateDistanceKm(pickupLat!, pickupLng!, d.current_lat, d.current_lng) <= maxDistanceKm);
    }
    if (!nearbyDrivers.length) return new Response(JSON.stringify({ message: "No nearby drivers found", sent: 0, nearbyDrivers: 0, totalOnline: onlineDrivers.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const driverUserIds = nearbyDrivers.map(d => d.user_id);

    // In-app notifications
    const inAppNotifications = nearbyDrivers.map(d => ({ user_id: d.user_id, ride_id: rideId, type: "new_ride", title: "🚗 New Ride Request", message: `${pickupAddress || "Pickup"} → ${dropoffAddress || "Dropoff"}${estimatedFare ? ` • $${Number(estimatedFare).toFixed(2)}` : ""}` }));
    const { error: notifError } = await supabase.from("notifications").insert(inAppNotifications);
    if (notifError) console.error("Failed to create in-app notifications:", notifError);
    else console.log(`Created ${inAppNotifications.length} in-app notifications`);

    // FCM push
    const { data: subscriptions } = await supabase.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", driverUserIds);
    const results: Array<{ id: string; success: boolean; reason?: string }> = [];

    if (subscriptions?.length && firebaseProjectId) {
      let accessToken: string;
      try { accessToken = await getAccessToken(); } catch (e) { console.error("FCM auth failed:", e); accessToken = ""; }
      if (accessToken) {
        const fareDisplay = estimatedFare ? `$${Number(estimatedFare).toFixed(2)}` : "";
        const title = "🚗 New Ride Request Nearby";
        const body = `📍 ${pickupAddress || "Pickup"}\n➡️ ${dropoffAddress || "Destination"}${fareDisplay ? `\n💰 Earn ${fareDisplay}` : ""}`;
        const pushResults = await Promise.all(subscriptions.map(async (sub) => {
          const fcmToken = sub.p256dh;
          if (!fcmToken || sub.auth !== 'fcm') return { id: sub.id, success: false, reason: "Not an FCM subscription" };
          const res = await fetch(`https://fcm.googleapis.com/v1/projects/${firebaseProjectId}/messages:send`, {
            method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ message: { token: fcmToken, notification: { title, body }, data: { url: "/driver", rideId, type: "new_ride" }, webpush: { notification: { icon: "/favicon.ico", vibrate: [300, 100, 300], requireInteraction: true, tag: `ride-request-${rideId}` } }, android: { priority: "high" } } })
          });
          if (res.ok) return { id: sub.id, success: true };
          const errorText = await res.text();
          if (res.status === 404 || res.status === 410 || errorText.includes("UNREGISTERED")) { await supabase.from("push_subscriptions").delete().eq("id", sub.id); }
          return { id: sub.id, success: false, reason: errorText };
        }));
        results.push(...pushResults);
      }
    }

    const oneSignalResult = await sendOneSignalDriverAlert(rideId, pickupAddress, driverUserIds);
    const sent = results.filter(r => r.success).length;

    return new Response(JSON.stringify({ sent, total: results.length, nearbyDrivers: nearbyDrivers.length, totalOnline: onlineDrivers.length, inAppNotifications: inAppNotifications.length, oneSignal: oneSignalResult, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in notify-drivers-new-ride:", error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
