import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID") || "5a6c4131-8faa-4969-b5c4-5a09033c8e2a";

interface RidePayload {
  ride_id: string;
  new_status: string;
  old_status: string;
  rider_id: string | null;
  driver_id: string | null;
}

interface DriverInfo {
  first_name: string;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  license_plate: string | null;
}

function getSupabase() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function getDriverInfo(driverId: string): Promise<DriverInfo> {
  const supabase = getSupabase();
  const [profileRes, driverRes] = await Promise.all([
    supabase.from("profiles").select("first_name").eq("user_id", driverId).single(),
    supabase.from("driver_profiles").select("vehicle_make, vehicle_model, vehicle_color, license_plate, current_lat, current_lng").eq("user_id", driverId).single(),
  ]);
  return {
    first_name: profileRes.data?.first_name || "Your driver",
    vehicle_make: driverRes.data?.vehicle_make || null,
    vehicle_model: driverRes.data?.vehicle_model || null,
    vehicle_color: driverRes.data?.vehicle_color || null,
    license_plate: driverRes.data?.license_plate || null,
  };
}

function estimateEtaMinutes(lat1: number, lng1: number, lat2: number, lng2: number): number | null {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(1, Math.round((km / 25) * 60));
}

async function getDriverEta(driverId: string, pickupLat: number, pickupLng: number): Promise<number | null> {
  const supabase = getSupabase();
  const { data } = await supabase.from("driver_profiles").select("current_lat, current_lng").eq("user_id", driverId).single();
  if (!data?.current_lat || !data?.current_lng) return null;
  return estimateEtaMinutes(data.current_lat, data.current_lng, pickupLat, pickupLng);
}

function buildVehicleString(info: DriverInfo): string {
  const parts: string[] = [];
  if (info.license_plate) parts.push(info.license_plate);
  const car = [info.vehicle_color, info.vehicle_make, info.vehicle_model].filter(Boolean).join(" ");
  if (car) parts.push(car);
  return parts.join(" · ");
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function deterministicNotificationId(userId: string, rideId: string, type: string): Promise<string> {
  const raw = `${userId}:${rideId}:${type}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = toHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function getNotificationConfig(payload: RidePayload, driverInfo?: DriverInfo, etaMinutes?: number | null) {
  const { new_status, rider_id, driver_id } = payload;
  const name = driverInfo?.first_name || "Your driver";
  const vehicleStr = driverInfo ? buildVehicleString(driverInfo) : "";

  switch (new_status) {
    case "driver_assigned": {
      const etaText = etaMinutes ? `Pick up in ${etaMinutes} min` : `${name} is on the way`;
      return { targetUserId: rider_id, title: `🚗 ${etaText}`, message: vehicleStr || `${name} has accepted your ride!`, type: "ride_accepted" };
    }
    case "driver_en_route": {
      const etaText = etaMinutes ? `Pick up in ${etaMinutes} min` : `${name} is on the way`;
      return { targetUserId: rider_id, title: `🚗 ${etaText}`, message: vehicleStr || `${name} is heading to you.`, type: "driver_en_route" };
    }
    case "arrived":
      return { targetUserId: rider_id, title: `${name} Has Arrived 📍`, message: vehicleStr ? `Look for ${vehicleStr}` : `${name} is at the pickup. Head outside!`, type: "driver_arrived" };
    case "in_progress":
      return { targetUserId: rider_id, title: "Ride Started 🛣️", message: "Your ride has started. Enjoy the trip!", type: "ride_started" };
    case "completed":
      return { targetUserId: rider_id, title: "Ride Completed ✅", message: "You've arrived at your destination. Thanks for riding!", type: "ride_completed" };
    case "cancelled":
      // ALWAYS notify the rider on cancellation (rider is the one who needs to know)
      return { targetUserId: rider_id, title: "Ride Cancelled ❌", message: "Your ride has been cancelled.", type: "ride_cancelled" };
    default:
      return null;
  }
}

async function insertInAppNotification(userId: string, rideId: string, title: string, message: string, type: string): Promise<boolean> {
  const supabase = getSupabase();
  const deterministicId = await deterministicNotificationId(userId, rideId, type);
  const { error } = await supabase.from("notifications").insert({
    id: deterministicId, user_id: userId, ride_id: rideId, title, message, type, is_read: false,
  });
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      console.log(`[ride-status-push] Duplicate notification suppressed for ${userId} (${type})`);
      return false;
    }
    console.error("[ride-status-push] Failed to insert in-app notification:", error);
    return false;
  }
  console.log(`[ride-status-push] ✅ In-app notification inserted for ${userId}: ${type}`);
  return true;
}

async function sendPush(targetUserId: string, title: string, message: string, data: Record<string, string>) {
  const restApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
  if (!restApiKey) {
    console.warn("[ride-status-push] ONESIGNAL_REST_API_KEY missing, skipping push");
    return { ok: false, delivered: false, data: { skipped: true } };
  }

  console.log("[ride-status-push] 🔔 Sending push to user:", targetUserId, "| title:", title, "| REST key prefix:", restApiKey.substring(0, 8) + "...");

  const basePayload = {
    app_id: ONESIGNAL_APP_ID,
    headings: { en: String(title) },
    contents: { en: String(message) },
    // Force high priority delivery
    priority: 10,
    content_available: true,
    mutable_content: true,
    // iOS: sound, badge, priority
    ios_sound: "default",
    ios_badgeType: "Increase",
    ios_badgeCount: 1,
    ios_priority: 10,
    apns_push_type_override: "alert",
    // Android: sound, priority
    android_sound: "os_notification",
    android_channel_id: "ride_updates",
    ttl: 0,
    thread_id: `ride_${data.ride_id}`,
    collapse_id: `ride_status_${data.ride_id}`,
    android_group: `ride_${data.ride_id}`,
    data,
  };

  const sendToOneSignal = async (targeting: Record<string, unknown>, label: string) => {
    const payload = { ...basePayload, ...targeting };
    console.log(`[ride-status-push] Trying ${label}:`, JSON.stringify(targeting));
    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Basic ${restApiKey}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    const recipients = body?.recipients || 0;
    console.log(`[ride-status-push] ${label} → status=${res.status} recipients=${recipients} id=${body?.id || "none"} errors=${JSON.stringify(body?.errors || [])}`);
    return { ok: res.ok, status: res.status, data: body, delivered: recipients > 0 };
  };

  // PRIMARY: include_external_user_ids — this is what the Median bridge sets via login({ externalId })
  const r1 = await sendToOneSignal({ include_external_user_ids: [targetUserId] }, "external_user_id");
  if (r1.delivered) return r1;

  // Fallback 1: include_aliases (newer OneSignal API)
  const r2 = await sendToOneSignal({
    include_aliases: { external_id: [targetUserId] },
    target_channel: "push",
  }, "aliases_external_id");
  if (r2.delivered) return r2;

  // Fallback 2: Direct player_id from DB
  const supabase = getSupabase();
  const { data: profile } = await supabase.from("profiles").select("onesignal_player_id").eq("user_id", targetUserId).single();
  const playerId = profile?.onesignal_player_id;
  if (playerId) {
    console.log("[ride-status-push] Trying player_id from DB:", playerId);
    const r3 = await sendToOneSignal({ include_player_ids: [playerId] }, "player_id");
    if (r3.delivered) return r3;
  }

  // Fallback 3: Tag-based
  const r4 = await sendToOneSignal({
    filters: [{ field: "tag", key: "uid", relation: "=", value: targetUserId }],
  }, "tag_uid");

  console.log(`[ride-status-push] 🏁 All strategies exhausted. Last result: recipients=${r4.data?.recipients || 0}`);
  return r4;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    console.log("[ride-status-push] body:", rawBody);
    const payload: RidePayload = JSON.parse(rawBody);

    // ── DB verification: always fetch the real rider_id & driver_id from rides table ──
    const supabase = getSupabase();
    const { data: rideRow, error: rideError } = await supabase
      .from("rides")
      .select("rider_id, driver_id, pickup_lat, pickup_lng")
      .eq("id", payload.ride_id)
      .single();

    if (rideError || !rideRow) {
      console.error("[ride-status-push] Could not fetch ride from DB:", rideError);
      return new Response(JSON.stringify({ error: "ride_not_found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Override payload IDs with DB truth
    payload.rider_id = rideRow.rider_id;
    payload.driver_id = rideRow.driver_id;
    console.log(`[ride-status-push] DB-verified rider_id=${payload.rider_id} driver_id=${payload.driver_id} status=${payload.new_status}`);

    let driverInfo: DriverInfo | undefined;
    let etaMinutes: number | null = null;

    if (payload.driver_id && ["driver_assigned", "driver_en_route", "arrived"].includes(payload.new_status)) {
      driverInfo = await getDriverInfo(payload.driver_id);
      if (rideRow.pickup_lat && rideRow.pickup_lng && ["driver_assigned", "driver_en_route"].includes(payload.new_status)) {
        etaMinutes = await getDriverEta(payload.driver_id, rideRow.pickup_lat, rideRow.pickup_lng);
      }
    }

    const config = getNotificationConfig(payload, driverInfo, etaMinutes);
    if (!config || !config.targetUserId) {
      console.log("[ride-status-push] No target user, skipping");
      return new Response(JSON.stringify({ skipped: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const insertedPrimary = await insertInAppNotification(config.targetUserId, payload.ride_id, config.title, config.message, config.type);

    // For cancellation, also notify the driver if one was assigned
    let insertedCancelledDriver = false;
    if (payload.new_status === "cancelled" && payload.driver_id && payload.driver_id !== config.targetUserId) {
      insertedCancelledDriver = await insertInAppNotification(payload.driver_id, payload.ride_id, "Ride Cancelled ❌", "The rider has cancelled the ride.", "ride_cancelled");
    }

    const pushData: Record<string, string> = { ride_id: payload.ride_id, status: payload.new_status };
    if (etaMinutes) pushData.eta_minutes = String(etaMinutes);
    if (driverInfo?.license_plate) pushData.license_plate = driverInfo.license_plate;
    if (driverInfo?.vehicle_color) pushData.vehicle_color = driverInfo.vehicle_color;

    let result: unknown = { skipped: true, reason: "duplicate_notification" };
    if (insertedPrimary) {
      result = await sendPush(config.targetUserId, config.title, config.message, pushData);
    }

    let cancelledDriverResult: unknown = null;
    if (payload.new_status === "cancelled" && payload.driver_id && insertedCancelledDriver) {
      cancelledDriverResult = await sendPush(payload.driver_id, "Ride Cancelled ❌", "The rider has cancelled the ride.", { ride_id: payload.ride_id, status: "cancelled" });
    }

    return new Response(JSON.stringify({
      success: true,
      verified_rider_id: payload.rider_id,
      verified_driver_id: payload.driver_id,
      inserted: { primary: insertedPrimary, cancelled_driver: insertedCancelledDriver },
      onesignal: result,
      cancelled_driver_onesignal: cancelledDriverResult,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[ride-status-push] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
