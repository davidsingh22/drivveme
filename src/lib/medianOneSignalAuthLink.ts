import { supabase } from "@/integrations/supabase/client";

let lastId: string | null = null;

const MAX_RETRIES = 5;
const RETRY_INTERVAL_MS = 2000;

function attemptLogin(uid: string, attempt = 1): void {
  console.log(`OneSignal Attempt: ${uid} (try ${attempt}/${MAX_RETRIES})`);
  try {
    const median = (window as any).median;
    if (!median?.onesignal) {
      if (attempt < MAX_RETRIES) {
        setTimeout(() => attemptLogin(uid, attempt + 1), RETRY_INTERVAL_MS);
      } else {
        console.log("❌ Median OneSignal: gave up after max retries");
      }
      return;
    }

    // Register the device first
    try { median.onesignal.register(); } catch { /* ignore */ }

    try {
      median.onesignal.login({ externalId: uid });
      lastId = uid;
      console.log("✅ Median Bridge: OneSignal login with ID", uid);
    } catch {
      // fallback for older bridge versions
      window.location.href = `gonative://onesignal/login?externalId=${uid}`;
      lastId = uid;
    }
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
  attemptLogin(uid, 1);
}

export function initMedianOneSignalAuthLink() {
  let pendingUid: string | null | undefined = undefined;

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
      console.log("✅ Median Bridge: OneSignal logout");
    }
  };

  // Handle median library ready callback
  (window as any).median_library_ready = () => {
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

  // React to auth state changes
  supabase.auth.onAuthStateChange((_event, session) => {
    const uid = session?.user?.id ?? null;
    if (typeof (window as any).median !== "undefined") {
      applyLogin(uid);
    } else {
      pendingUid = uid;
    }
  });
}
