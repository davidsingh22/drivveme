import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Power, MapPin, Navigation, DollarSign, Clock, UserCircle, Bell, Map, HelpCircle, Gift, X, Send, ChevronRight, CornerDownRight, ArrowUp, ArrowLeft as ArrowLeftIcon, ArrowRight as ArrowRightIcon, RotateCw } from 'lucide-react';
import RideChat from '@/components/RideChat';
import MapComponent, { type NavigationStep } from '@/components/MapComponent';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/pricing';
import Navbar from '@/components/Navbar';

import DriverProfileModal from '@/components/DriverProfileModal';
import { useToast } from '@/hooks/use-toast';
import { RideOfferModal } from '@/components/RideOfferModal';
import { DriverLocationStatus } from '@/components/DriverLocationStatus';
import { useDriverLocationTracking } from '@/hooks/useDriverLocationTracking';
import { calculatePlatformFee } from '@/lib/platformFees';
import { withTimeout } from '@/lib/withTimeout';
import { consumePendingRide, onPendingRide } from '@/lib/pendingRideStore';
import montrealDriverBg from '@/assets/montreal-driver-night-bg.png';
import { HelpDialog } from '@/components/HelpDialog';
import { useOneSignalSync } from '@/hooks/useOneSignalSync';

/** Fire push notification to rider immediately (don't wait for DB trigger) */
const fireInstantPush = async (
  rideId: string, newStatus: string, oldStatus: string, riderId: string | null, driverId: string | null,
) => {
  try {
    const { error } = await supabase.functions.invoke('ride-status-push', {
      body: { ride_id: rideId, new_status: newStatus, old_status: oldStatus, rider_id: riderId, driver_id: driverId },
    });
    if (error) console.warn('[InstantPush] edge fn error:', error);
  } catch (e) { console.warn('[InstantPush] failed:', e); }
};

interface RideRequest {
  id: string; rider_id: string; pickup_address: string; pickup_lat: number; pickup_lng: number;
  dropoff_address: string; dropoff_lat: number; dropoff_lng: number; distance_km: number;
  estimated_duration_minutes: number; estimated_fare: number; subtotal_before_tax?: number | null;
  platform_fee?: number | null; status: string; requested_at: string;
}

const COUNTDOWN_SECONDS = 25;

const getManeuverIcon = (maneuver?: { type: string; modifier?: string }) => {
  if (!maneuver) return <ArrowUp className="h-5 w-5 text-primary" />;
  const mod = maneuver.modifier || '';
  if (mod.includes('left')) return <ArrowLeftIcon className="h-5 w-5 text-primary" />;
  if (mod.includes('right')) return <ArrowRightIcon className="h-5 w-5 text-primary" />;
  if (maneuver.type === 'roundabout' || maneuver.type === 'rotary') return <RotateCw className="h-5 w-5 text-primary" />;
  if (maneuver.type === 'arrive') return <MapPin className="h-5 w-5 text-primary" />;
  return <ArrowUp className="h-5 w-5 text-primary" />;
};

const DriverDashboard = () => {
  const { t, language } = useLanguage();
  const { user, session, roles, isDriver, driverProfile, refreshDriverProfile, refreshSession, authLoading, profileLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  useOneSignalSync();

  const [isOnline, setIsOnline] = useState(false);
  const [currentRide, setCurrentRide] = useState<RideRequest | null>(null);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [todayRides, setTodayRides] = useState(0);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [newRideAlertOpen, setNewRideAlertOpen] = useState(false);
  const [newRideAlertRideId, setNewRideAlertRideId] = useState<string | null>(null);
  const [cachedAlertRide, setCachedAlertRide] = useState<RideRequest | null>(null);
  const [redirectGraceOver, setRedirectGraceOver] = useState(false);
  const [showReconnect, setShowReconnect] = useState(false);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [etaDistanceKm, setEtaDistanceKm] = useState<number | null>(null);
  const [navMode, setNavMode] = useState(false);
  const [navSteps, setNavSteps] = useState<NavigationStep[]>([]);
  const [rideScreenReady, setRideScreenReady] = useState(false);
  const currentRideRef = useRef<RideRequest | null>(null);
  const newRideAlertOpenRef = useRef(false);
  const alertStartTimeRef = useRef<number | null>(null);
  const rideStatusChannelRef = useRef<any>(null);

  useEffect(() => { currentRideRef.current = currentRide; }, [currentRide]);
  useEffect(() => { newRideAlertOpenRef.current = newRideAlertOpen; }, [newRideAlertOpen]);

  const { isTracking: locationIsTracking, lastUpdate: locationLastUpdate, locationError, permissionStatus: locationPermission, resetLocationError } = useDriverLocationTracking({
    userId: user?.id, driverId: user?.id, isOnline, updateIntervalMs: 3000,
  });

  // GPS watch for driver location
  useEffect(() => {
    if (!isOnline && !currentRide) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setDriverLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}, { enableHighAccuracy: true, maximumAge: 2000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isOnline, currentRide]);

  useEffect(() => { try { localStorage.setItem('last_route', '/driver'); } catch {} }, []);

  useEffect(() => {
    setRedirectGraceOver(false);
    const t = window.setTimeout(() => setRedirectGraceOver(true), 5000);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (authLoading || !redirectGraceOver) return;
    if (!session) { navigate('/login', { replace: true }); return; }
    if (profileLoading || roles.length === 0) return;
    if (!isDriver) navigate('/', { replace: true });
  }, [authLoading, redirectGraceOver, session, profileLoading, roles.length, isDriver, navigate]);

  const ACTIVE_STATUSES = ['driver_assigned', 'driver_en_route', 'arrived', 'in_progress'] as const;

  const isActiveDriverRide = useCallback((
    ride: { status: string; driver_id: string | null } | null | undefined,
    driverId: string,
  ) => {
    return !!ride && ride.driver_id === driverId && ACTIVE_STATUSES.includes(ride.status as typeof ACTIVE_STATUSES[number]);
  }, []);

  const forceUnsubscribeRideStatus = useCallback(() => {
    const channel = rideStatusChannelRef.current;
    if (!channel) return;
    void supabase.removeChannel(channel);
    rideStatusChannelRef.current = null;
  }, []);

  /** Hard exit: wipe all ride UI state immediately */
  const hardExitRide = useCallback((reason?: string) => {
    console.log('[DriverDash] Hard Exit:', reason);
    forceUnsubscribeRideStatus();
    setCurrentRide(null);
    setCachedAlertRide(null);
    setNewRideAlertOpen(false);
    setNewRideAlertRideId(null);
    setEtaMinutes(null);
    setEtaDistanceKm(null);
    setNavMode(false);
    setNavSteps([]);
    alertStartTimeRef.current = null;
  }, [forceUnsubscribeRideStatus]);

  /** Clear all ride-related UI state */
  const clearRideState = useCallback((reason?: string) => {
    hardExitRide(reason);
  }, [hardExitRide]);

  // Flash clean on mount: verify local ride still belongs to this driver before map renders
  useEffect(() => {
    const driverId = session?.user?.id;
    let cancelled = false;

    const runFlashClean = async () => {
      if (!driverId) { setRideScreenReady(true); return; }
      const localRide = currentRideRef.current;
      if (!localRide) { setRideScreenReady(true); return; }

      const { data } = await supabase.from('rides').select('id, status, driver_id').eq('id', localRide.id).maybeSingle();
      if (cancelled) return;

      if (!isActiveDriverRide(data, driverId)) {
        hardExitRide('Flash Clean: local ride no longer belongs to this driver');
      }
      setRideScreenReady(true);
    };

    setRideScreenReady(false);
    runFlashClean();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, isActiveDriverRide, hardExitRide]);

  // Restore active ride on mount + on every app resume
  useEffect(() => {
    const driverId = session?.user?.id;
    if (!driverId) return;
    let cancelled = false;

    const fetchActiveRide = async () => {
      try {
        const { data } = await supabase.from('rides').select('*')
          .eq('driver_id', driverId)
          .not('driver_id', 'is', null)
          .in('status', ACTIVE_STATUSES)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (data) {
          // Double-check exact row to prevent stale/ghost restore
          const { data: freshRide } = await supabase.from('rides').select('status, driver_id').eq('id', data.id).maybeSingle();
          if (cancelled) return;

          if (isActiveDriverRide(freshRide, driverId)) {
            setCurrentRide(data);
          } else {
            hardExitRide(`Restore blocked: stale ride ${data.id}`);
          }
        } else {
          hardExitRide('Restore found no active ride for this driver');
        }
      } catch (error) {
        console.warn('[DriverDash] Restore failed, forcing hard exit:', error);
        hardExitRide('Restore error fallback');
      } finally {
        if (!cancelled) setRideScreenReady(true);
      }
    };

    fetchActiveRide();

    // Re-check on app resume
    const onResume = () => {
      if (document.visibilityState === 'visible') {
        console.log('[DriverDash] App resumed, re-checking active ride');
        fetchActiveRide();
      }
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
    };
  }, [session?.user?.id, isActiveDriverRide, hardExitRide]);

  // Periodic liveness check: every 4s verify the current ride is still active
  useEffect(() => {
    const rideId = currentRide?.id;
    const driverId = session?.user?.id;
    if (!rideId || !driverId) return;

    const checkRide = async () => {
      const { data } = await supabase.from('rides').select('status, driver_id').eq('id', rideId).maybeSingle();
      const dead = !isActiveDriverRide(data, driverId);
      if (dead) {
        hardExitRide(`Liveness: ride ${rideId} evicted (status=${data?.status ?? 'missing'}, driver=${data?.driver_id ?? 'null'})`);
        if (data?.status === 'cancelled') {
          toast({ title: '❌ Ride Cancelled', description: 'This ride has been cancelled.' });
        }
      }
    };

    // Check immediately on mount (catches stale state from previous render)
    checkRide();
    const interval = setInterval(checkRide, 4000);
    return () => clearInterval(interval);
  }, [currentRide?.id, session?.user?.id, isActiveDriverRide, hardExitRide, toast]);

  // Realtime: hard-evict ride as soon as driver is unassigned or ride is cancelled/completed
  useEffect(() => {
    const rideId = currentRide?.id;
    const driverId = session?.user?.id;
    if (!rideId || !driverId) return;

    const channel = supabase
      .channel(`driver-ride-status-${rideId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${rideId}`,
      }, (payload) => {
        const updated = payload.new as { status: string; driver_id: string | null };
        const mustEvict = updated.driver_id === null || updated.status === 'cancelled' || updated.status === 'completed' || updated.driver_id !== driverId;

        if (mustEvict) {
          // Immediate state wipe (Hard Exit)
          setCurrentRide(null);
          hardExitRide(`Realtime eviction: status=${updated.status}, driver=${updated.driver_id}`);
          if (updated.status === 'cancelled') {
            toast({ title: '❌ Ride Cancelled', description: 'The rider cancelled this ride.' });
          }
          return;
        }

        setCurrentRide(prev => prev ? { ...prev, status: updated.status } : null);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentRide?.id, session?.user?.id, hardExitRide, toast]);

  // Today's earnings
  useEffect(() => {
    if (!user) return;
    (async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { data } = await supabase.from('rides').select('driver_earnings').eq('driver_id', user.id).eq('status', 'completed').gte('dropoff_at', today.toISOString());
      if (data) { setTodayEarnings(data.reduce((sum, r) => sum + (Number(r.driver_earnings) || 0), 0)); setTodayRides(data.length); }
    })();
  }, [user, currentRide]);

  const toggleOnlineStatus = async () => {
    if (!user) return;
    const newStatus = !isOnline;
    const { error } = await supabase.from('driver_profiles').update({ is_online: newStatus }).eq('user_id', user.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setIsOnline(newStatus);
    await refreshDriverProfile();
    toast({ title: newStatus ? 'You are now online' : 'You are now offline' });
  };

  // Realtime ride offers
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel(`driver-ride-offers-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, async (payload) => {
        const notif = payload.new as { type: string; ride_id: string | null };
        if (notif.type !== 'new_ride' || !notif.ride_id || currentRideRef.current || newRideAlertOpenRef.current) return;
        const { data: ride } = await supabase.from('rides').select('*').eq('id', notif.ride_id).eq('status', 'searching').maybeSingle();
        if (!ride) return;
        setCachedAlertRide(ride); setNewRideAlertRideId(ride.id); setNewRideAlertOpen(true);
        alertStartTimeRef.current = Date.now();
        toast({ title: '🚗 NEW RIDE REQUEST!' }); if ('vibrate' in navigator) (navigator as any).vibrate?.([300, 100, 300]);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const handleRouteInfo = useCallback((eta: number, dist: number) => {
    setEtaMinutes(eta);
    setEtaDistanceKm(dist);
  }, []);

  const handleNavigationSteps = useCallback((steps: NavigationStep[]) => {
    setNavSteps(steps);
  }, []);

  const acceptRide = async (ride: RideRequest) => {
    if (!user || busyAction) return;
    setNewRideAlertOpen(false); setCachedAlertRide(null); setNewRideAlertRideId(null); setBusyAction('accept');
    try {
      const acceptanceTime = alertStartTimeRef.current ? Math.floor((Date.now() - alertStartTimeRef.current) / 1000) : null;
      const { data: updatedRows, error } = await withTimeout(
        supabase.from('rides').update({ driver_id: user.id, status: 'driver_assigned' as const, accepted_at: new Date().toISOString(), acceptance_time_seconds: acceptanceTime })
          .eq('id', ride.id).eq('status', 'searching').is('driver_id', null).select('id').then(r => r), 7000, 'Accept ride'
      );
      if (error || !updatedRows?.length) {
        const { data: rpcResult, error: rpcError } = await withTimeout(supabase.rpc('accept_ride', { p_ride_id: ride.id, p_driver_id: user.id, p_acceptance_time_seconds: acceptanceTime }), 7000, 'Accept RPC');
        if (rpcError || !rpcResult) { toast({ title: 'Error', description: 'Ride no longer available', variant: 'destructive' }); return; }
      }
      if (acceptanceTime !== null && acceptanceTime <= 5) {
        supabase.from('driver_profiles').update({ priority_driver_until: new Date(Date.now() + 30 * 60 * 1000).toISOString() }).eq('user_id', user.id).then(() => {});
        toast({ title: '⚡ Priority Driver Activated!' });
      }
      setCurrentRide({ ...ride, status: 'driver_assigned' });
      setEtaMinutes(null);
      setEtaDistanceKm(null);
      toast({ title: 'Ride accepted!', description: 'Navigate to pickup' });
      fireInstantPush(ride.id, 'driver_assigned', 'searching', ride.rider_id, user.id);
      alertStartTimeRef.current = null;
    } catch { toast({ title: 'Error', variant: 'destructive' }); }
    finally { setBusyAction(null); }
  };

  const updateRideStatus = async (status: string) => {
    if (!currentRide || !user || busyAction) return;
    setBusyAction(status);
    const prev = { ...currentRide };

    // Clear ETA when switching routes
    setEtaMinutes(null);
    setEtaDistanceKm(null);

    if (status === 'completed') { clearRideState('Driver completed ride'); toast({ title: 'Ride completed!' }); }
    else { setCurrentRide(r => r ? { ...r, status } : null); toast({ title: status === 'arrived' ? 'Arrived!' : 'Ride started!' }); }
    fireInstantPush(prev.id, status, prev.status, prev.rider_id, user.id);
    try {
      const updates: any = { status };
      if (status === 'in_progress') updates.pickup_at = new Date().toISOString();
      else if (status === 'completed') { updates.dropoff_at = new Date().toISOString(); updates.actual_fare = prev.estimated_fare; updates.platform_fee = calculatePlatformFee(prev.estimated_fare); updates.driver_earnings = prev.estimated_fare - calculatePlatformFee(prev.estimated_fare); }
      const { error } = await withTimeout(supabase.from('rides').update(updates).eq('id', prev.id).then(r => r), 7000, `Update to ${status}`);
      if (error) { setCurrentRide(prev); toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
      if (status === 'completed') void refreshDriverProfile();
    } catch { setCurrentRide(prev); toast({ title: 'Error', variant: 'destructive' }); }
    finally { setBusyAction(null); }
  };

  const cancelRide = async () => {
    if (!currentRide || !user || busyAction) return;
    setBusyAction('cancel');
    const prev = currentRide;
    const riderIdForNotif = prev.rider_id;
    const rideIdForNotif = prev.id;
    clearRideState('Driver cancelled ride');
    toast({ title: 'Ride cancelled' });
    fireInstantPush(rideIdForNotif, 'cancelled', prev.status, riderIdForNotif, user.id);
    if (riderIdForNotif) {
      await supabase.from('notifications').insert({
        user_id: riderIdForNotif, ride_id: rideIdForNotif, type: 'ride_cancelled',
        title: 'Ride Cancelled ❌', message: 'The driver cancelled this ride.',
      });
    }
    try {
      await withTimeout(supabase.from('rides').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: user.id, driver_id: null }).eq('id', rideIdForNotif).then(r => r), 7000, 'Cancel ride');
    } catch { setCurrentRide(prev); }
    finally { setBusyAction(null); }
  };

  const alertRide = cachedAlertRide ? {
    id: cachedAlertRide.id, pickup_address: cachedAlertRide.pickup_address, dropoff_address: cachedAlertRide.dropoff_address,
    estimated_fare: cachedAlertRide.estimated_fare, distance_km: cachedAlertRide.distance_km,
    estimated_duration_minutes: cachedAlertRide.estimated_duration_minutes, pickup_lat: cachedAlertRide.pickup_lat, pickup_lng: cachedAlertRide.pickup_lng,
  } : null;

  const cleanupOffer = () => { setNewRideAlertOpen(false); setCachedAlertRide(null); setNewRideAlertRideId(null); alertStartTimeRef.current = null; };

  const routeMode = currentRide
    ? (currentRide.status === 'in_progress' ? 'driver-to-dropoff' : 'driver-to-pickup')
    : undefined;

  const etaLabel = currentRide
    ? (currentRide.status === 'in_progress' ? 'ETA to Destination' : 'Time to Pickup')
    : null;

  const globalModalLayer = (
    <div className="fixed inset-0 pointer-events-none" style={{ isolation: 'isolate', zIndex: 2147483647 }}>
      <RideOfferModal open={newRideAlertOpen} ride={alertRide} countdownSeconds={COUNTDOWN_SECONDS} driverLocation={driverLocation}
        onDecline={cleanupOffer} onAccept={() => { if (cachedAlertRide) acceptRide(cachedAlertRide); }} />
    </div>
  );

  if ((authLoading && !user) || !rideScreenReady) return <div className="min-h-screen bg-background p-6 space-y-4">{globalModalLayer}<Skeleton className="h-12 w-48" /><Skeleton className="h-[60vh] w-full rounded-xl" /><div className="flex gap-4"><Skeleton className="h-10 flex-1" /><Skeleton className="h-10 flex-1" /></div></div>;

  return (
    <div className="min-h-screen bg-background">
      {globalModalLayer}
      <Navbar />
      <div className="pt-16 h-screen flex flex-col lg:flex-row">
        <div className="flex-[2] min-h-[60vh] lg:min-h-0 relative">
          <MapComponent key={currentRide?.id ?? 'idle'}
            pickup={currentRide ? { lat: currentRide.pickup_lat, lng: currentRide.pickup_lng } : null}
            dropoff={currentRide ? { lat: currentRide.dropoff_lat, lng: currentRide.dropoff_lng } : null}
            driverLocation={driverLocation}
            routeMode={routeMode}
            followDriver={!!currentRide}
            onRouteInfo={handleRouteInfo}
            onNavigationSteps={handleNavigationSteps}
            showRecenter={!!currentRide}
            navigationMode={navMode}
          />
          {/* Navigation step overlay on map */}
          {navMode && navSteps.length > 0 && (
            <div className="absolute top-4 left-4 right-4 z-20 bg-background/95 backdrop-blur rounded-xl border border-primary/40 p-4 shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  {getManeuverIcon(navSteps[0]?.maneuver)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground line-clamp-2">{navSteps[0]?.instruction}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {navSteps[0]?.distance >= 1000 ? `${(navSteps[0].distance / 1000).toFixed(1)} km` : `${Math.round(navSteps[0]?.distance || 0)} m`}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <motion.div initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
          className="w-full lg:w-[420px] border-l border-border flex flex-col relative overflow-hidden min-h-[40vh]">
          <div className="absolute inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: `url(${montrealDriverBg})` }} />
          <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/85 to-background/95" />
          <div className="relative z-10 flex flex-col flex-1 overflow-hidden">
            <div className="p-4 flex-1 overflow-y-auto pb-8">
              <Button onClick={toggleOnlineStatus}
                className={`w-full h-14 text-lg font-bold mb-4 transition-all ${isOnline ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' : 'gradient-primary'}`}>
                <Power className={`h-6 w-6 mr-3 ${isOnline ? '' : 'animate-pulse'}`} />
                {isOnline ? 'Go Offline' : 'Go Online'}
              </Button>

              {currentRide && (
                <div className="mb-4 space-y-3">
                  {/* ETA Banner */}
                  {etaMinutes !== null && (
                    <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-center">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{etaLabel}</p>
                      <p className="text-2xl font-bold text-primary">
                        {Math.round(etaMinutes)} min
                      </p>
                      {etaDistanceKm !== null && (
                        <p className="text-xs text-muted-foreground">{etaDistanceKm.toFixed(1)} km away</p>
                      )}
                    </div>
                  )}

                  {/* Pickup address bar */}
                  <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-muted/30 p-3">
                    <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold">Pickup</p>
                      <span className="text-sm font-medium line-clamp-1">{currentRide.pickup_address}</span>
                    </div>
                  </div>

                  {/* Dropoff address bar – always visible */}
                  <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-muted/30 p-3">
                    <Navigation className="h-4 w-4 text-accent flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold">Dropoff</p>
                      <span className="text-sm font-medium line-clamp-1">{currentRide.dropoff_address}</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  {['driver_assigned', 'driver_en_route'].includes(currentRide.status) && (
                    <button onClick={() => updateRideStatus('arrived')} disabled={!!busyAction}
                      className="w-full h-14 text-lg font-bold bg-yellow-500 hover:bg-yellow-600 active:scale-[0.98] text-black rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                      <MapPin className="h-5 w-5" /> I've Arrived
                    </button>
                  )}

                  {currentRide.status === 'arrived' && (
                    <button onClick={() => updateRideStatus('in_progress')} disabled={!!busyAction}
                      className="w-full h-14 text-lg font-bold bg-accent hover:bg-accent/90 active:scale-[0.98] text-black rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                      <Navigation className="h-5 w-5" /> Start Ride
                    </button>
                  )}

                  {['arrived', 'in_progress'].includes(currentRide.status) && (
                    <button onClick={() => updateRideStatus('completed')} disabled={!!busyAction}
                      className="w-full h-14 text-lg font-bold bg-accent hover:bg-accent/90 active:scale-[0.98] text-black rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                      <Clock className="h-5 w-5" /> Complete Ride
                    </button>
                  )}

                  <button onClick={cancelRide} disabled={!!busyAction}
                    className="w-full h-14 text-lg font-bold bg-destructive hover:bg-destructive/90 active:scale-[0.98] text-destructive-foreground rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                    <X className="h-5 w-5" /> Cancel Ride
                  </button>

                  {/* Embedded Chat */}
                  <RideChat rideId={currentRide.id} rideStatus={currentRide.status} role="driver" embedded />

                  {/* Mapbox GPS Navigation Toggle */}
                  <button
                    onClick={() => setNavMode(prev => !prev)}
                    className={`w-full h-14 text-lg font-bold active:scale-[0.98] rounded-xl flex items-center justify-center gap-2 transition-all ${navMode ? 'bg-accent text-black hover:bg-accent/90' : 'bg-primary hover:bg-primary/90 text-primary-foreground'}`}
                  >
                    <Map className="h-5 w-5" /> {navMode ? 'Exit Navigation' : 'Open GPS Navigation'}
                  </button>

                  {/* Navigation Steps List (when nav mode active) */}
                  {navMode && navSteps.length > 0 && (
                    <div className="rounded-xl border border-border/30 bg-muted/30 max-h-48 overflow-y-auto">
                      {navSteps.slice(0, 8).map((step, i) => (
                        <div key={i} className="flex items-center gap-3 p-2.5 border-b border-border/10 last:border-0">
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            {getManeuverIcon(step.maneuver)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium line-clamp-1">{step.instruction}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {step.distance >= 1000 ? `${(step.distance / 1000).toFixed(1)} km` : `${Math.round(step.distance)} m`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 mb-3">
                <Button variant="outline" className="flex-1" onClick={() => setIsProfileModalOpen(true)}>
                  <UserCircle className="h-5 w-5 mr-2" />Edit Profile
                </Button>
              </div>

              <Card className="mb-4 p-4 border-primary/40 bg-primary/10 cursor-pointer hover:bg-primary/20 transition-colors" onClick={() => setHelpDialogOpen(true)}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center"><HelpCircle className="h-5 w-5 text-primary" /></div>
                  <div><p className="font-semibold text-sm">Need Help?</p><p className="text-xs text-muted-foreground">Contact DriveMe Support</p></div>
                </div>
              </Card>

              {isOnline && (
                <div className="flex justify-center mb-6">
                  <DriverLocationStatus isTracking={locationIsTracking} lastUpdate={locationLastUpdate} locationError={locationError} permissionStatus={locationPermission} isOnline={isOnline} />
                </div>
              )}

              {isOnline && !currentRide && (
                <Card className="p-8 text-center border-dashed border-2 border-muted-foreground/20">
                  <Navigation className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40 animate-pulse" />
                  <p className="font-medium text-muted-foreground">Waiting for ride offers...</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">You'll get an alert when a ride is available</p>
                </Card>
              )}

              {!isOnline && !currentRide && (
                <div className="text-center py-12 text-muted-foreground">
                  <Navigation className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Go online to see rides</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      <DriverProfileModal open={isProfileModalOpen} onOpenChange={setIsProfileModalOpen} />
      <HelpDialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen} />
    </div>
  );
};

export default DriverDashboard;
