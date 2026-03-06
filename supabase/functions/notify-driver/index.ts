import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { driver_id, pickup, dropoff } = await req.json();

    if (!driver_id || !pickup || !dropoff) {
      return new Response(JSON.stringify({ error: "Missing required fields: driver_id, pickup, dropoff" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const restApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (!restApiKey) throw new Error("ONESIGNAL_REST_API_KEY not configured");

    const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID") || "5a6c4131-8faa-4969-b5c4-5a09033c8e2a";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log("[notify-driver] 🔔 target user id:", driver_id);

    const { data: profile } = await supabase
      .from("profiles")
      .select("onesignal_player_id")
      .eq("user_id", driver_id)
      .single();

    const playerId = profile?.onesignal_player_id;
    console.log("[notify-driver] onesignal_player_id:", playerId || "none");

    const basePayload: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      headings: { en: "🚗 New Ride Request" },
      contents: { en: `Pickup: ${pickup} → Dropoff: ${dropoff}` },
      priority: 10,
      ttl: 0,
      content_available: true,
      mutable_content: true,
      ios_sound: "default",
      android_sound: "default",
    };

    const sendToOneSignal = async (targeting: Record<string, unknown>, label: string) => {
      const payload = { ...basePayload, ...targeting };
      console.log(`[notify-driver] Trying ${label}:`, JSON.stringify(targeting));
      const res = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Authorization": `Basic ${restApiKey}`,
        },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      const recipients = body?.recipients || 0;
      console.log(`[notify-driver] ${label} → status=${res.status} recipients=${recipients} errors=${JSON.stringify(body?.errors || [])}`);
      return { ok: res.ok, data: body, delivered: recipients > 0 };
    };

    // Strategy 1: Direct player ID
    if (playerId) {
      const r1 = await sendToOneSignal({ include_player_ids: [playerId] }, "player_id");
      if (r1.delivered) {
        return new Response(JSON.stringify(r1.data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      console.log("[notify-driver] ⚠️ player_id failed, trying fallbacks");
    }

    // Strategy 2: include_aliases (newer API)
    const r2 = await sendToOneSignal({
      include_aliases: { external_id: [driver_id] },
      target_channel: "push",
    }, "aliases_external_id");
    if (r2.delivered) {
      return new Response(JSON.stringify(r2.data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Strategy 3: Tag-based
    const r3 = await sendToOneSignal({
      filters: [
        { field: "tag", key: "uid", relation: "=", value: driver_id },
      ],
    }, "tag_uid");
    if (r3.delivered) {
      return new Response(JSON.stringify(r3.data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Strategy 4: Legacy external user IDs
    const r4 = await sendToOneSignal({ include_external_user_ids: [driver_id] }, "legacy_external_id");
    console.log(`[notify-driver] 🏁 All strategies exhausted. Last recipients=${r4.data?.recipients || 0}`);
    return new Response(JSON.stringify(r4.data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error("[notify-driver] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
