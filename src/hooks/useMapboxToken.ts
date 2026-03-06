import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

let cachedToken: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 min

export function clearMapboxTokenCache() {
  cachedToken = null;
  cacheTimestamp = 0;
}

export function useMapboxToken() {
  const [token, setToken] = useState<string | null>(cachedToken);
  const [loading, setLoading] = useState(!cachedToken);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cachedToken && Date.now() - cacheTimestamp < CACHE_TTL) {
      setToken(cachedToken);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setError('Not authenticated'); setLoading(false); return; }

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-mapbox-token`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
          }
        );
        const json = await res.json();
        if (!cancelled) {
          if (json.token) {
            cachedToken = json.token;
            cacheTimestamp = Date.now();
            setToken(json.token);
          } else {
            setError(json.error || 'Failed to fetch token');
          }
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { token, loading, error };
}
