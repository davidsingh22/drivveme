import { supabase } from "@/integrations/supabase/client";

let lastSaved: string | null = null;

async function saveOneSignalIdToProfile(uid: string, oneSignalId: string) {
  const { error } = await (supabase as any)
    .from("profiles")
    .update({ onesignal_player_id: oneSignalId })
    .eq("user_id", uid);
  if (error) throw error;
}

export function initCaptureOneSignalId() {
  supabase.auth.onAuthStateChange(async (_event, session) => {
    const uid = session?.user?.id;
    if (!uid) return;

    try {
      if ((window as any).median?.onesignal?.info) {
        const info = await (window as any).median.onesignal.info();
        const id = info?.oneSignalId || info?.subscriptionId || info?.id;
        if (id && lastSaved !== id) {
          await saveOneSignalIdToProfile(uid, id);
          lastSaved = id;
          console.log("✅ Saved OneSignal ID via Median:", id);
          return;
        }
      }

      (window as any).OneSignalDeferred = (window as any).OneSignalDeferred || [];
      (window as any).OneSignalDeferred.push(async (OneSignal: any) => {
        const id = OneSignal?.User?.PushSubscription?.id;
        if (id && lastSaved !== id) {
          await saveOneSignalIdToProfile(uid, id);
          lastSaved = id;
          console.log("✅ Saved OneSignal ID via Web SDK:", id);
        }
      });
    } catch (e) {
      console.log("❌ initCaptureOneSignalId error:", e);
    }
  });
}
