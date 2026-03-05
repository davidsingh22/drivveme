const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const STORAGE_KEY = 'sb-bqpocvswrtqntlomdyzf-auth-token';

interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user?: any;
  [key: string]: any;
}

function decodeJwtPayload(token: string): { exp?: number; [key: string]: any } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(payload);
  } catch { return null; }
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return payload.exp < Math.floor(Date.now() / 1000) + 60;
}

function readStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.access_token && parsed?.refresh_token) return parsed;
    if (parsed?.currentSession?.access_token) return parsed.currentSession;
    return null;
  } catch { return null; }
}

function writeStoredSession(session: StoredSession): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch {}
}

async function rawRefreshToken(refreshToken: string): Promise<StoredSession> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      if (res.status === 400 || res.status === 401) {
        try { localStorage.removeItem(STORAGE_KEY); } catch {}
        throw new Error('SESSION_EXPIRED');
      }
      throw new Error(`Token refresh failed (${res.status})`);
    }
    const data = await res.json();
    if (!data?.access_token || !data?.refresh_token) throw new Error('Invalid refresh response');
    return data as StoredSession;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Token refresh timed out (8s)');
    throw err;
  }
}

export async function getValidAccessToken(): Promise<string> {
  const stored = readStoredSession();
  if (!stored) throw new Error('NO_SESSION');
  if (!isTokenExpired(stored.access_token)) return stored.access_token;
  const newSession = await rawRefreshToken(stored.refresh_token);
  writeStoredSession({ ...stored, ...newSession });
  return newSession.access_token;
}

export function hasStoredSession(): boolean {
  return readStoredSession() !== null;
}

export { SUPABASE_URL, ANON_KEY, STORAGE_KEY };
