import { initializeApp, getApps, getApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { supabase } from '@/integrations/supabase/client';

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;
let cachedConfig: { config: Record<string, string>; vapidKey: string } | null = null;
let lastConfigHash: string | null = null;

function normalizeBase64Url(input: string): string {
  const trimmed = (input || '').trim().replace(/\s+/g, '');
  const base64 = trimmed.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (base64.length % 4)) % 4;
  return base64 + '='.repeat(padLen);
}

function hashConfig(config: Record<string, string>): string {
  return JSON.stringify(config);
}

export async function getFirebaseConfig() {
  if (cachedConfig) return cachedConfig;
  const { data, error } = await supabase.functions.invoke('get-firebase-config');
  if (error) throw new Error(`Failed to fetch Firebase config: ${error.message}`);
  if (!data?.config) throw new Error('Invalid Firebase configuration');
  cachedConfig = data;
  return cachedConfig;
}

export async function initializeFirebase(): Promise<{ app: FirebaseApp; messaging: Messaging }> {
  const { config } = await getFirebaseConfig();
  const configHash = hashConfig(config);
  if (app && lastConfigHash && lastConfigHash !== configHash) {
    try { await deleteApp(app); } catch {}
    app = null; messaging = null;
  }
  if (app && messaging) return { app, messaging };
  const existingApps = getApps();
  if (existingApps.length > 0) {
    try {
      app = getApp(); messaging = getMessaging(app); lastConfigHash = configHash;
      return { app, messaging };
    } catch {
      try { await deleteApp(getApp()); } catch {}
    }
  }
  app = initializeApp(config);
  messaging = getMessaging(app);
  lastConfigHash = configHash;
  return { app, messaging };
}

export async function registerServiceWorkerWithConfig(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  await navigator.serviceWorker.ready;
  const { config } = await getFirebaseConfig();
  if (registration.active) registration.active.postMessage({ type: 'FIREBASE_CONFIG', config });
  return registration;
}

export async function getFCMToken(registration: ServiceWorkerRegistration): Promise<string> {
  const { messaging } = await initializeFirebase();
  const { vapidKey } = await getFirebaseConfig();
  if (!vapidKey) throw new Error('VAPID key not configured');
  let token: string | null = null;
  try {
    const normalized = normalizeBase64Url(vapidKey).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    token = await getToken(messaging, { vapidKey: normalized, serviceWorkerRegistration: registration });
  } catch {
    token = await getToken(messaging, { serviceWorkerRegistration: registration } as any);
  }
  if (!token) throw new Error('Failed to get FCM token');
  return token;
}

export function setupForegroundMessageHandler(callback: (payload: any) => void) {
  if (!messaging) return;
  return onMessage(messaging, (payload) => {
    if (Notification.permission === 'granted') {
      new Notification(payload?.notification?.title || 'DrivvMe', { body: payload?.notification?.body || 'New notification' });
    }
    callback(payload);
  });
}

export { app, messaging };
