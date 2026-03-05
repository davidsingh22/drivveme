import { supabase } from "@/integrations/supabase/client";
import { setPendingRideFromNotification } from "@/lib/pendingRideStore";

let lastExternalId: string | null = null;

function waitForOneSignal(timeoutMs = 30000): Promise<any> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const os = (window as any).OneSignal;
      if (os && typeof os.login === "function") {
        clearInterval(timer);
        resolve(os);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error("OneSignal never became available"));
      }
    }, 300);
  });
}

export function initOneSignalAuthLink() {
  supabase.auth.onAuthStateChange((_event, session) => {
    const uid = session?.user?.id;
    waitForOneSignal()
      .then(async (OneSignal) => {
        if (uid) {
          if (lastExternalId === uid) return;
          await OneSignal.login(uid);
          lastExternalId = uid;
          console.log("✅ OneSignal External ID set:", uid);
        } else {
          lastExternalId = null;
          await OneSignal.logout();
          console.log("✅ OneSignal logged out");
        }
        try {
          if (OneSignal.Notifications?.addEventListener) {
            OneSignal.Notifications.addEventListener("click", (event: any) => {
              const data = event?.notification?.additionalData || event?.result?.notification?.additionalData || {};
              if (data.ride_id) {
                setPendingRideFromNotification(data.ride_id);
                try {
                  localStorage.setItem('pendingRideFromPush', data.ride_id);
                  localStorage.setItem('last_notified_ride', data.ride_id);
                } catch {}
                const lastRoute = localStorage.getItem('last_route');
                window.location.href = lastRoute === '/driver' ? '/driver' : '/ride';
              }
            });
          }
        } catch (e) {
          console.log("OneSignal click handler registration failed (non-fatal):", e);
        }
      })
      .catch((e) => {
        console.log("❌ OneSignal External ID error:", (e as any)?.message || e);
      });
  });
}
