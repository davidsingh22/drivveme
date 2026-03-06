import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

declare global {
  interface Window {
    median?: {
      onesignal?: {
        register: () => void;
        login: (opts: { externalId: string }) => void;
      };
    };
  }
}

/**
 * Background hook that syncs Supabase UID → OneSignal externalId via the Median bridge.
 * Retries every 10 s until successful. Does NOT block UI.
 */
export function useOneSignalSync() {
  const { user } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncedRef = useRef(false);

  useEffect(() => {
    // Reset on user change
    syncedRef.current = false;

    if (!user?.id) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    const uid = user.id;

    const attempt = () => {
      if (syncedRef.current) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        return;
      }

      if (!window.median?.onesignal) {
        console.log('[OneSignalSync] Median bridge not available yet, will retry…');
        return;
      }

      try {
        console.log(`[OneSignalSync] Calling register() for UID: ${uid}`);
        window.median.onesignal.register();
      } catch (e) {
        console.error('[OneSignalSync] register() failed:', e);
      }

      try {
        console.log(`[OneSignalSync] Calling login() with externalId: ${uid}`);
        window.median.onesignal.login({ externalId: uid });
        syncedRef.current = true;
        console.log(`[OneSignalSync] ✅ login() succeeded for UID: ${uid}`);
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
      } catch (e) {
        console.error('[OneSignalSync] login() failed, will retry in 10 s:', e);
      }
    };

    // First attempt after a short delay so it doesn't block render
    const initTimer = setTimeout(attempt, 2000);

    // Retry every 10 s
    intervalRef.current = setInterval(attempt, 10_000);

    return () => {
      clearTimeout(initTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [user?.id]);
}
