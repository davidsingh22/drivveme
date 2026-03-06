import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useMapboxToken() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
          if (json.token) setToken(json.token);
          else setError(json.error || 'Failed to fetch token');
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
