import { supabase } from "@/integrations/supabase/client";

let lastId: string | null = null;
let lastSavedPlayerId: string | null = null;

const MAX_RETRIES = 5;
const RETRY_INTERVAL_MS = 2000;

/** Try to get the OneSignal player/subscription ID from Median and save to DB */
async function captureAndSavePlayerId(uid: string, attempt = 1): Promise<void> {
  try {
    const median = (window as any).median;
    if (!median?.onesignal) return;

    let playerId: string | null = null;

    // Try median.onesignal.onesignalInfo() – returns promise or uses callback
    if (typeof median.onesignal.onesignalInfo === "function") {
      try {
        const info = await median.onesignal.onesignalInfo();
        playerId = info?.oneSignalUserId || info?.playerId || info?.userId || info?.subscriptionId || info?.oneSignalId || null;
        console.log("[OneSignal] onesignalInfo response:", JSON.stringify(info));
      } catch { /* ignore */ }
    }

    // Fallback: try median.onesignal.info()
    if (!playerId && typeof median.onesignal.info === "function") {
      try {
        const info = await median.onesignal.info();
        playerId = info?.oneSignalId || info?.subscriptionId || info?.playerId || info?.id || null;
        console.log("[OneSignal] info response:", JSON.stringify(info));
      } catch { /* ignore */ }
    }

    // Fallback: check global callback data
    if (!playerId) {
      const globalInfo = (window as any)._medianOneSignalInfo;
      if (globalInfo) {
        playerId = globalInfo.oneSignalUserId || globalInfo.playerId || globalInfo.subscriptionId || globalInfo.oneSignalId || null;
      }
    }

    if (playerId && playerId !== lastSavedPlayerId) {
      const { error } = await supabase
        .from("profiles")
        .update({ onesignal_player_id: playerId } as any)
        .eq("user_id", uid);
      if (!error) {
        lastSavedPlayerId = playerId;
        console.log("✅ Saved OneSignal player ID to DB:", playerId);
      } else {
        console.log("❌ Failed to save OneSignal player ID:", error.message);
      }
    } else if (!playerId && attempt < MAX_RETRIES) {
      console.log(`[OneSignal] Player ID not available yet, retry ${attempt}/${MAX_RETRIES}`);
      setTimeout(() => captureAndSavePlayerId(uid, attempt + 1), RETRY_INTERVAL_MS);
    }
  } catch (e) {
    console.log("❌ captureAndSavePlayerId error:", e);
  }
}

function attemptLogin(uid: string, attempt = 1): void {
  console.log(`OneSignal Attempt: ${uid} (try ${attempt}/${MAX_RETRIES})`);
  try {
    const median = (window as any).median;
    if (!median?.onesignal) {
      if (attempt < MAX_RETRIES) {
        setTimeout(() => attemptLogin(uid, attempt + 1), RETRY_INTERVAL_MS);
      } else {
        console.log("❌ Median OneSignal: gave up after max retries – bridge not available");
      }
      return;
    }

    // Register the device first to ensure push permission
    try { median.onesignal.register(); } catch { /* ignore */ }

    try {
      median.onesignal.login({ externalId: uid });
      lastId = uid;
      console.log("✅ Median Bridge: OneSignal login with ID", uid);
    } catch {
      // fallback for older bridge versions
      try {
        window.location.href = `gonative://onesignal/login?externalId=${uid}`;
      } catch { /* ignore */ }
      lastId = uid;
    }

    // After login, wait a beat then capture the player/subscription ID
    setTimeout(() => captureAndSavePlayerId(uid), 1500);
  } catch (e) {
    console.log("❌ Median OneSignal error:", e);
    if (attempt < MAX_RETRIES) {
      setTimeout(() => attemptLogin(uid, attempt + 1), RETRY_INTERVAL_MS);
    }
  }
}

/** Manually trigger OneSignal login – used by "Re-sync Notifications" button */
export function resyncMedianOneSignal(uid: string): void {
  lastId = null; // force re-login
  lastSavedPlayerId = null; // force re-capture
  attemptLogin(uid, 1);
}

export function initMedianOneSignalAuthLink() {
  let pendingUid: string | null | undefined = undefined;

  // Listen for OneSignal info callbacks from Median
  (window as any).gonative_onesignal_info = (info: any) => {
    console.log("[OneSignal] gonative_onesignal_info callback:", JSON.stringify(info));
    (window as any)._medianOneSignalInfo = info;
  };

  const applyLogin = (uid: string | null) => {
    if (uid) {
      if (lastId === uid) return;
      attemptLogin(uid);
    } else {
      if (lastId) {
        try {
          const median = (window as any).median;
          if (median?.onesignal) {
            median.onesignal.logout();
          } else {
            window.location.href = "gonative://onesignal/logout";
          }
        } catch { /* ignore */ }
      }
      lastId = null;
      lastSavedPlayerId = null;
      console.log("✅ Median Bridge: OneSignal logout");
    }
  };

  // Handle median library ready callback
  (window as any).median_library_ready = () => {
    console.log("[OneSignal] median_library_ready fired");
    if (pendingUid !== undefined) {
      applyLogin(pendingUid);
      pendingUid = undefined;
    }
    try {
      (window as any).gonative_onesignal_push_opened = (payload: any) => {
        const data = payload?.additionalData || payload?.custom?.a || {};
        if (data.ride_id) window.location.href = "/ride";
      };
    } catch {}
  };

  // Push-opened handler for early registration
  (window as any).gonative_onesignal_push_opened = (payload: any) => {
    const data = payload?.additionalData || payload?.custom?.a || {};
    if (data.ride_id) window.location.href = "/ride";
  };

  // React to auth state changes — always attempt, with retry if bridge not ready yet
  supabase.auth.onAuthStateChange((_event, session) => {
    const uid = session?.user?.id ?? null;
    console.log("[OneSignal] onAuthStateChange fired, uid:", uid, "event:", _event);

    if (uid) {
      // Immediately try register + login, even if median isn't ready yet
      try {
        const median = (window as any).median;
        if (median?.onesignal) {
          console.log("[OneSignal] Bridge available on auth change, calling register + login now");
          try { median.onesignal.register(); } catch (e) { console.error("[OneSignal] register() failed:", e); }
          try {
            median.onesignal.login({ externalId: uid });
            console.log("✅ [OneSignal] Immediate login called with:", uid);
          } catch (e) {
            console.error("[OneSignal] login() failed:", e);
          }
        } else {
          console.log("[OneSignal] Bridge NOT ready on auth change, queuing retry");
        }
      } catch (e) {
        console.error("[OneSignal] Error during immediate auth login:", e);
      }

      // Always run the retry-based attemptLogin to ensure it sticks
      applyLogin(uid);
    } else {
      applyLogin(null);
    }

    // Also store pending in case median_library_ready fires later
    if (typeof (window as any).median === "undefined") {
      pendingUid = uid;
    }
  });
}
