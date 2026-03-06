import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    median?: {
      onesignal?: {
        register: () => void;
        login: (opts: { externalId: string }) => void;
        externalUserId?: {
          set: (opts: { externalId: string }) => void;
        };
      };
    };
    median_library_ready?: () => void;
  }
}

/**
 * Polls for `window.median` every 300ms for up to 30 seconds.
 * Resolves `true` when bridge detected, `false` on timeout.
 */
function waitForOneSignal(timeoutMs = 30_000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (window.median?.onesignal) {
        console.log('[OneSignalSync] ✅ Median bridge detected after', Date.now() - start, 'ms');
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        console.warn('[OneSignalSync] ⏱️ Timed out waiting for Median bridge after', timeoutMs, 'ms');
        resolve(false);
        return;
      }
      setTimeout(check, 300);
    };
    check();
  });
}

/**
 * Attempts to link Supabase UID → OneSignal via multiple strategies:
 * 1) median.onesignal.register() + login()
 * 2) median.onesignal.externalUserId.set()
 * 3) Deep link fallback via gonative:// URL scheme
 */
async function linkDevice(userId: string): Promise<boolean> {
  const median = window.median;

  // Strategy 1: register() + login() (preferred)
  if (median?.onesignal?.login) {
    try {
      console.log(`[OneSignalSync] Strategy 1: register() + login({ externalId: ${userId} })`);
      median.onesignal.register();
      median.onesignal.login({ externalId: userId });
      console.log(`[OneSignalSync] ✅ login() succeeded for UID: ${userId}`);
      return true;
    } catch (e) {
      console.error('[OneSignalSync] Strategy 1 failed:', e);
    }
  }

  // Strategy 2: externalUserId.set()
  if (median?.onesignal?.externalUserId?.set) {
    try {
      console.log(`[OneSignalSync] Strategy 2: externalUserId.set({ externalId: ${userId} })`);
      median.onesignal.register();
      median.onesignal.externalUserId.set({ externalId: userId });
      console.log(`[OneSignalSync] ✅ externalUserId.set() succeeded for UID: ${userId}`);
      return true;
    } catch (e) {
      console.error('[OneSignalSync] Strategy 2 failed:', e);
    }
  }

  // Strategy 3: Deep link fallback (gonative:// URL scheme)
  try {
    const deepLink = `gonative://onesignal/externalUserId/set?externalId=${encodeURIComponent(userId)}`;
    console.log(`[OneSignalSync] Strategy 3: Deep link fallback → ${deepLink}`);
    window.location.href = deepLink;
    // Give the deep link handler time to process
    await new Promise((r) => setTimeout(r, 1500));
    console.log(`[OneSignalSync] ✅ Deep link dispatched for UID: ${userId}`);
    return true;
  } catch (e) {
    console.error('[OneSignalSync] Strategy 3 (deep link) failed:', e);
  }

  return false;
}

/**
 * Save the OneSignal player_id to profiles table if available
 */
async function capturePlayerId(userId: string) {
  try {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      const playerId = detail?.oneSignalUserId || detail?.player_id || detail?.userId;
      if (playerId) {
        console.log(`[OneSignalSync] 🔑 Captured player_id: ${playerId}`);
        supabase
          .from('profiles')
          .update({ onesignal_player_id: playerId } as any)
          .eq('user_id', userId)
          .then(({ error }) => {
            if (error) console.error('[OneSignalSync] Failed to save player_id:', error);
            else console.log('[OneSignalSync] ✅ player_id saved to DB');
          });
      }
    };
    window.addEventListener('gonative_onesignal_info', handler, { once: true });
    // Clean up after 15s if no event fires
    setTimeout(() => window.removeEventListener('gonative_onesignal_info', handler), 15_000);
  } catch {}
}

/**
 * Nuclear-option OneSignal sync hook.
 * Uses waitForOneSignal polling, median_library_ready callback,
 * and deep-link fallback. Retries every 10s until linked.
 */
export function useOneSignalSync() {
  const { user } = useAuth();
  const syncedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    syncedRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!user?.id) return;

    const uid = user.id;

    const doSync = async () => {
      if (syncedRef.current) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      const bridgeReady = await waitForOneSignal(30_000);
      if (!bridgeReady) {
        console.warn('[OneSignalSync] Bridge not available, will retry via deep link');
      }

      const linked = await linkDevice(uid);
      if (linked) {
        syncedRef.current = true;
        capturePlayerId(uid);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };

    // Path A: Use median_library_ready if bridge hasn't loaded yet
    if (!window.median?.onesignal) {
      const prevReady = window.median_library_ready;
      window.median_library_ready = () => {
        console.log('[OneSignalSync] 🎯 median_library_ready fired');
        if (prevReady) prevReady();
        doSync();
      };
    }

    // Path B: Also start polling immediately (belt and suspenders)
    const initTimer = setTimeout(doSync, 1500);

    // Path C: Retry every 10s if still not synced
    intervalRef.current = setInterval(() => {
      if (syncedRef.current) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        return;
      }
      console.log('[OneSignalSync] ♻️ Retry sync attempt…');
      linkDevice(uid).then((ok) => {
        if (ok) {
          syncedRef.current = true;
          capturePlayerId(uid);
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      });
    }, 10_000);

    return () => {
      clearTimeout(initTimer);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [user?.id]);
}
