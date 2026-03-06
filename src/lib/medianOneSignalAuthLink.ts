import { supabase } from "@/integrations/supabase/client";

let lastId: string | null = null;

export function initMedianOneSignalAuthLink() {
  let pendingUid: string | null | undefined = undefined;

  const applyLogin = (uid: string | null) => {
    try {
      if (typeof (window as any).median === "undefined") return;
      const median = (window as any).median;
      if (!median?.onesignal) return;

      if (uid) {
        if (lastId === uid) return;
        try {
          median.onesignal.login({ externalId: uid });
        } catch {
          // fallback for older bridge versions
          window.location.href = `gonative://onesignal/login?externalId=${uid}`;
        }
        lastId = uid;
        console.log("✅ Median Bridge: OneSignal login with ID", uid);
      } else {
        if (lastId) {
          try {
            median.onesignal.logout();
          } catch {
            window.location.href = "gonative://onesignal/logout";
          }
        }
        lastId = null;
        console.log("✅ Median Bridge: OneSignal logout");
      }
    } catch (e) {
      console.log("❌ Median OneSignal error:", e);
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
    if (typeof (window as any).median !== "undefined" && (window as any).median?.onesignal) {
      applyLogin(uid);
    } else {
      pendingUid = uid;
    }
  });
}
