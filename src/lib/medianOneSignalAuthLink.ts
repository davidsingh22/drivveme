import { supabase } from "@/integrations/supabase/client";

let lastId: string | null = null;

export function initMedianOneSignalAuthLink() {
  let pendingUid: string | null | undefined = undefined;

  const applyExternalId = (uid: string | null) => {
    try {
      const median = (window as any).median;
      if (!median?.onesignal) return;
      if (uid) {
        if (lastId === uid) return;
        try { median.onesignal.externalUserId.set({ externalId: uid }); } catch {
          window.location.href = `gonative://onesignal/externalUserId/set?externalId=${uid}`;
        }
        lastId = uid;
        console.log("✅ Median Bridge: External ID set to", uid);
      } else {
        lastId = null;
        try { median.onesignal.externalUserId.remove(); } catch {}
      }
    } catch (e) { console.log("❌ Median OneSignal error:", e); }
  };

  (window as any).median_library_ready = () => {
    if (pendingUid !== undefined) { applyExternalId(pendingUid); pendingUid = undefined; }
    try {
      (window as any).gonative_onesignal_push_opened = (payload: any) => {
        const data = payload?.additionalData || payload?.custom?.a || {};
        if (data.ride_id) window.location.href = "/ride";
      };
    } catch {}
  };

  (window as any).gonative_onesignal_push_opened = (payload: any) => {
    const data = payload?.additionalData || payload?.custom?.a || {};
    if (data.ride_id) window.location.href = "/ride";
  };

  supabase.auth.onAuthStateChange((_event, session) => {
    const uid = session?.user?.id ?? null;
    if ((window as any).median?.onesignal) applyExternalId(uid);
    else pendingUid = uid;
  });
}
