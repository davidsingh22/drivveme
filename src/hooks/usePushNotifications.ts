import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function usePushNotifications() {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setIsSupported(supported);
    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  const checkExistingSubscription = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);

      if (error) {
        console.error('Error checking subscription:', error);
      }
      setIsSubscribed(!!data && data.length > 0);
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  }, [user]);

  useEffect(() => {
    if (!isSupported || !user) return;
    checkExistingSubscription();
  }, [isSupported, user, checkExistingSubscription]);

  const refreshPermission = useCallback(() => {
    if (!isSupported) return;
    setPermission(Notification.permission);
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported || !user) {
      toast.error('Push notifications are not supported');
      return false;
    }

    setIsLoading(true);

    try {
      if (Notification.permission === 'denied') {
        setPermission('denied');
        toast.error('Notifications are blocked in your browser settings');
        return false;
      }

      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult !== 'granted') {
        toast.error('Notification permission denied');
        return false;
      }

      // For now, store a placeholder subscription
      const endpoint = `push-${user.id}-${Date.now()}`;
      
      const { error: saveError } = await supabase
        .from('push_subscriptions')
        .upsert(
          {
            user_id: user.id,
            endpoint: endpoint,
            p256dh: 'placeholder',
            auth: 'web-push',
          },
          { onConflict: 'user_id,endpoint' as any }
        );

      if (saveError) {
        throw new Error(`Failed to save subscription: ${saveError.message}`);
      }

      setIsSubscribed(true);
      toast.success('Push notifications enabled!');
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error subscribing to push:', error);
      toast.error(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, user]);

  const unsubscribe = useCallback(async () => {
    if (!user) return false;

    setIsLoading(true);

    try {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id);

      setIsSubscribed(false);
      toast.success('Push notifications disabled');
      return true;
    } catch (error) {
      console.error('Error unsubscribing:', error);
      toast.error('Failed to disable push notifications');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    refreshPermission,
    subscribe,
    unsubscribe,
  };
}