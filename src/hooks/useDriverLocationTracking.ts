import { useEffect, useRef, useCallback, useState } from 'react';
import { upsertDriverLocation, setDriverOffline } from '@/lib/driverLocation';

interface UseDriverLocationTrackingOptions {
  userId: string | undefined;
  driverId: string | undefined;
  isOnline: boolean;
  updateIntervalMs?: number;
}

export function useDriverLocationTracking({
  userId,
  driverId,
  isOnline,
  updateIntervalMs = 4000
}: UseDriverLocationTrackingOptions) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const errorSuppressedUntilRef = useRef<number>(0);
  const [isTracking, setIsTracking] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'unknown' | 'granted' | 'denied' | 'prompt'>('unknown');

  useEffect(() => {
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        setPermissionStatus(result.state as 'granted' | 'denied' | 'prompt');
        result.onchange = () => {
          setPermissionStatus(result.state as 'granted' | 'denied' | 'prompt');
        };
      }).catch(() => {});
    }
  }, []);

  const updateOnce = useCallback(async (online: boolean) => {
    if (!userId || !driverId) return;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const heading = pos.coords.heading;
        const speedKph = pos.coords.speed != null ? pos.coords.speed * 3.6 : null;

        setLocationError(null);

        try {
          await upsertDriverLocation({
            driverId,
            userId,
            lat,
            lng,
            heading: heading ?? null,
            speedKph,
            isOnline: online,
          });
          setLastUpdate(new Date());
        } catch (err) {
          console.error('[DriverLocationTracking] Upsert error:', err);
          setLocationError('Failed to save location');
        }
      },
      (error) => {
        if (Date.now() < errorSuppressedUntilRef.current) return;
        setLocationError(error.message);
        if (error.code === 1) setPermissionStatus('denied');
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
  }, [userId, driverId]);

  const startSharing = useCallback(async () => {
    if (!userId || !driverId) return;
    if (timerRef.current) return;

    await updateOnce(true);
    timerRef.current = setInterval(() => updateOnce(true), updateIntervalMs);
    setIsTracking(true);
  }, [userId, driverId, updateOnce, updateIntervalMs]);

  const stopSharing = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (driverId) {
      try {
        await setDriverOffline(driverId);
      } catch (err) {
        console.error('[DriverLocationTracking] Error setting offline:', err);
      }
    }

    setIsTracking(false);
    setLocationError(null);
  }, [driverId]);

  useEffect(() => {
    if (isOnline && userId && driverId && !isTracking) {
      startSharing();
    } else if (!isOnline && isTracking) {
      stopSharing();
    }
  }, [isOnline, userId, driverId, isTracking, startSharing, stopSharing]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const resetLocationError = useCallback(() => {
    setLocationError(null);
    errorSuppressedUntilRef.current = Date.now() + 15000;
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        setPermissionStatus(result.state as 'granted' | 'denied' | 'prompt');
      }).catch(() => {});
    }
  }, []);

  return {
    isTracking,
    lastUpdate,
    locationError,
    permissionStatus,
    stopSharing,
    resetLocationError,
  };
}