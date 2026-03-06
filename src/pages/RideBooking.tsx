import { useState, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, CheckCircle, Car, MapPin, Navigation, Phone, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useMapboxToken } from '@/hooks/useMapboxToken';
import { supabase } from '@/integrations/supabase/client';
import { calculateFare, FareEstimate } from '@/lib/pricing';
import { Button } from '@/components/ui/button';
import Navbar from '@/components/Navbar';
import MapView from '@/components/ride/MapView';
import MapComponent from '@/components/MapComponent';
import FareCard from '@/components/ride/FareCard';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast as sonnerToast } from 'sonner';

interface Location {
  address: string;
  lat: number;
  lng: number;
}

type RideStatus = 'searching' | 'driver_assigned' | 'driver_en_route' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';
type PostCancelAction = 'none' | 'show_options';

interface ActiveRide {
  id: string;
  status: RideStatus;
  driver_id: string | null;
  pickup_address: string;
  dropoff_address: string;
  estimated_fare: number;
  pickup_lat?: number;
  pickup_lng?: number;
  dropoff_lat?: number;
  dropoff_lng?: number;
}

interface DriverDetails {
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  license_plate: string | null;
}

interface RideCompletionPayload {
  id: string;
  driver_id: string | null;
  pickup_address: string;
  dropoff_address: string;
  estimated_fare: number | null;
  actual_fare: number | null;
}

const STATUS_LABELS: Record<string, { en: string; fr: string; icon: string }> = {
  searching: { en: 'Looking for a driver…', fr: 'Recherche d\'un chauffeur…', icon: '🔍' },
  driver_assigned: { en: 'Driver assigned!', fr: 'Chauffeur assigné!', icon: '🚗' },
  driver_en_route: { en: 'Driver is on the way', fr: 'Chauffeur en route', icon: '🚗' },
  arrived: { en: 'Driver has arrived!', fr: 'Le chauffeur est arrivé!', icon: '📍' },
  in_progress: { en: 'Ride in progress', fr: 'Course en cours', icon: '🛣️' },
  completed: { en: 'Ride completed!', fr: 'Course terminée!', icon: '✅' },
  cancelled: { en: 'Ride cancelled', fr: 'Course annulée', icon: '❌' },
};

const RideBooking = () => {
  const { user, profile } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const { toast } = useToast();
  const { token: mapboxToken, loading: tokenLoading } = useMapboxToken();

  const [pickup, setPickup] = useState<Location | null>(null);
  const [dropoff, setDropoff] = useState<Location | null>(null);
  const [routeGeoJson, setRouteGeoJson] = useState<GeoJSON.Feature | null>(null);
  const [fare, setFare] = useState<FareEstimate | null>(null);
  const [distanceKm, setDistanceKm] = useState(0);
  const [durationMin, setDurationMin] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [step, setStep] = useState<'input' | 'estimate'>('input');
  const [postCancelState, setPostCancelState] = useState<PostCancelAction>('none');
  const [cancelledRideInfo, setCancelledRideInfo] = useState<{ pickup: Location; dropoff: Location } | null>(null);

  // Active ride tracking
  const [activeRide, setActiveRide] = useState<ActiveRide | null>(null);
  const [driverDetails, setDriverDetails] = useState<DriverDetails | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);

  const handleRideCompleted = useCallback((ride: RideCompletionPayload) => {
    setActiveRide(null);
    setDriverDetails(null);
    setDriverLocation(null);
    setEtaMinutes(null);
    setConfirmed(false);
    setPostCancelState('none');

    navigate('/ride-review', {
      replace: true,
      state: {
        rideId: ride.id,
        driverId: ride.driver_id,
        driverName: null,
        fare: Number(ride.actual_fare ?? ride.estimated_fare ?? 0),
        pickupAddress: ride.pickup_address || '',
        dropoffAddress: ride.dropoff_address || '',
      },
    });
  }, [navigate]);

  // Restore from navigation state (from RideSearch)
  useEffect(() => {
    const state = routeLocation.state as any;
    if (!state) return;

    if (state.pickupAddress && state.pickupLat != null) {
      setPickup({ address: state.pickupAddress, lat: state.pickupLat, lng: state.pickupLng });
    }
    if (state.dropoffAddress && state.dropoffLat != null) {
      setDropoff({ address: state.dropoffAddress, lat: state.dropoffLat, lng: state.dropoffLng });
    }
    if (state.autoEstimate && state.pickupLat != null && state.dropoffLat != null) {
      setTimeout(() => {
        if (mapboxToken) {
          fetchRouteFromCoords(state.pickupLat, state.pickupLng, state.dropoffLat, state.dropoffLng);
        }
      }, 500);
    }
  }, [routeLocation.state, mapboxToken]);

  // Recover latest ride on mount
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const { data: latestRide } = await supabase
        .from('rides')
        .select('id, status, driver_id, pickup_address, dropoff_address, estimated_fare, actual_fare, updated_at, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng')
        .eq('rider_id', user.id)
        .in('status', ['searching', 'driver_assigned', 'driver_en_route', 'arrived', 'in_progress', 'completed'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled || !latestRide) return;

      if (latestRide.status === 'completed') {
        const { data: existingRating } = await supabase
          .from('ratings').select('id').eq('ride_id', latestRide.id).limit(1).maybeSingle();
        if (!cancelled && !existingRating) {
          handleRideCompleted(latestRide as RideCompletionPayload);
        }
        return;
      }

      setActiveRide(latestRide as ActiveRide);
      if (latestRide.driver_id) fetchDriverDetails(latestRide.driver_id);
    })();

    return () => { cancelled = true; };
  }, [user, handleRideCompleted]);

  // Real-time subscription for active ride status
  useEffect(() => {
    if (!activeRide) return;

    const channel = supabase
      .channel(`ride-tracking:${activeRide.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${activeRide.id}`,
      }, (payload) => {
        const updated = payload.new as RideCompletionPayload & { status: RideStatus; pickup_lat: number; pickup_lng: number; dropoff_lat: number; dropoff_lng: number };

        const label = STATUS_LABELS[updated.status];
        if (label) sonnerToast(`${label.icon} ${language === 'fr' ? label.fr : label.en}`);

        if (updated.status === 'completed') { handleRideCompleted(updated); return; }
        if (updated.status === 'cancelled') {
          setActiveRide(null); setDriverDetails(null); setDriverLocation(null); setEtaMinutes(null);
          setConfirmed(false);
          sonnerToast(language === 'fr' ? 'Course annulée' : 'Ride cancelled');
          navigate('/rider-home', { replace: true });
          return;
        }

        setActiveRide((prev) => (prev ? { ...prev, status: updated.status, driver_id: updated.driver_id } : null));
        if (updated.driver_id && updated.status === 'driver_assigned') fetchDriverDetails(updated.driver_id);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeRide?.id, language, handleRideCompleted]);

  // Subscribe to driver_locations for live driver position
  useEffect(() => {
    if (!activeRide?.driver_id) { setDriverLocation(null); return; }
    const driverId = activeRide.driver_id;

    // Fetch initial location
    (async () => {
      const { data } = await (supabase as any)
        .from('driver_locations').select('lat, lng').eq('driver_id', driverId).eq('is_online', true).maybeSingle();
      if (data) setDriverLocation({ lat: data.lat, lng: data.lng });
    })();

    const channel = supabase
      .channel(`rider-driver-loc-${driverId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}`,
      }, (payload) => {
        const loc = payload.new as { lat: number; lng: number; is_online: boolean };
        if (loc.is_online) setDriverLocation({ lat: loc.lat, lng: loc.lng });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeRide?.driver_id]);

  const fetchDriverDetails = useCallback(async (driverId: string) => {
    const [profileRes, driverRes] = await Promise.all([
      supabase.from('profiles').select('first_name, last_name, phone_number, avatar_url').eq('user_id', driverId).single(),
      supabase.from('driver_profiles').select('vehicle_make, vehicle_model, vehicle_color, license_plate').eq('user_id', driverId).single(),
    ]);
    setDriverDetails({
      first_name: profileRes.data?.first_name || null,
      last_name: profileRes.data?.last_name || null,
      phone_number: profileRes.data?.phone_number || null,
      avatar_url: profileRes.data?.avatar_url || null,
      vehicle_make: driverRes.data?.vehicle_make || null,
      vehicle_model: driverRes.data?.vehicle_model || null,
      vehicle_color: driverRes.data?.vehicle_color || null,
      license_plate: driverRes.data?.license_plate || null,
    });
  }, []);

  // Fallback reconciliation
  useEffect(() => {
    if (!activeRide?.id || activeRide.status === 'completed' || activeRide.status === 'cancelled') return;
    let cancelled = false;

    const reconcileStatus = async () => {
      const { data } = await supabase
        .from('rides')
        .select('id, status, driver_id, pickup_address, dropoff_address, estimated_fare, actual_fare')
        .eq('id', activeRide.id).maybeSingle();
      if (cancelled || !data) return;
      if (data.status === 'completed') { handleRideCompleted(data as RideCompletionPayload); return; }
      if (data.status === 'cancelled') {
        setActiveRide(null); setDriverDetails(null); setDriverLocation(null); setEtaMinutes(null);
        setConfirmed(false);
        navigate('/rider-home', { replace: true });
      }
    };

    reconcileStatus();
    const interval = window.setInterval(reconcileStatus, 3000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [activeRide?.id, activeRide?.status, handleRideCompleted]);

  const handleRouteInfo = useCallback((eta: number) => {
    setEtaMinutes(eta);
  }, []);

  const fetchRouteFromCoords = async (pLat: number, pLng: number, dLat: number, dLng: number) => {
    if (!mapboxToken) return;
    try {
      const res = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${pLng},${pLat};${dLng},${dLat}?geometries=geojson&overview=full&access_token=${mapboxToken}`
      );
      const data = await res.json();
      if (data.routes?.[0]) {
        const route = data.routes[0];
        const km = route.distance / 1000;
        const min = route.duration / 60;
        setDistanceKm(km);
        setDurationMin(min);
        setFare(calculateFare(km, min));
        setRouteGeoJson({ type: 'Feature', properties: {}, geometry: route.geometry });
        setStep('estimate');
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to calculate route', variant: 'destructive' });
    }
  };

  const handleRequestRide = async () => {
    if (!pickup || !dropoff || !fare || !user) return;
    setRequesting(true);
    try {
      const { data, error } = await supabase.from('rides').insert({
        rider_id: user.id,
        pickup_address: pickup.address, pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        dropoff_address: dropoff.address, dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng,
        estimated_fare: fare.total, distance_km: distanceKm,
        estimated_duration_minutes: Math.round(durationMin),
        subtotal_before_tax: fare.subtotalBeforeTax, gst_amount: fare.gstAmount,
        qst_amount: fare.qstAmount, platform_fee: fare.platformFee,
        driver_earnings: fare.driverEarnings, status: 'searching',
      }).select('id, status, driver_id, pickup_address, dropoff_address, estimated_fare, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng').single();

      if (error) throw error;
      setConfirmed(true);
      setActiveRide(data as ActiveRide);
      toast({ title: '✅ Payment Confirmed!', description: 'Looking for a driver near you…' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to request ride', variant: 'destructive' });
    } finally { setRequesting(false); }
  };

  const handleCancelRide = async () => {
    if (!activeRide || !user) return;
    const rideId = activeRide.id;
    const driverId = activeRide.driver_id;

    if (pickup && dropoff) setCancelledRideInfo({ pickup, dropoff });

    setActiveRide(null); setConfirmed(false); setDriverDetails(null); setDriverLocation(null); setEtaMinutes(null);
    toast({ title: language === 'fr' ? 'Course annulée' : 'Ride cancelled' });
    navigate('/rider-home', { replace: true });

    try {
      if (driverId) {
        await supabase.from('notifications').insert({
          user_id: driverId, ride_id: rideId, type: 'ride_cancelled',
          title: 'Ride Cancelled ❌', message: 'The rider cancelled this ride.',
        });
      }
      await supabase.from('rides').update({
        status: 'cancelled', cancelled_at: new Date().toISOString(),
        cancelled_by: user.id, cancellation_reason: 'Rider cancelled',
      }).eq('id', rideId);
      if (driverId) {
        supabase.functions.invoke('ride-status-push', {
          body: { ride_id: rideId, new_status: 'cancelled', old_status: activeRide.status, rider_id: user.id, driver_id: driverId },
        }).catch(() => {});
      }
    } catch {
      toast({ title: language === 'fr' ? 'Erreur' : 'Error cancelling ride', variant: 'destructive' });
    }
  };

  const handleModifyRide = () => {
    setPostCancelState('none');
    if (cancelledRideInfo && pickup && dropoff) {
      setStep('estimate');
      fetchRouteFromCoords(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
    } else { setStep('input'); }
    setCancelledRideInfo(null);
  };

  const handleBackToHome = () => {
    setPostCancelState('none'); setCancelledRideInfo(null);
    setStep('input'); setFare(null); setPickup(null); setDropoff(null); setRouteGeoJson(null);
    navigate('/rider-home');
  };

  if (tokenLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  // Determine map props for active ride
  const ridePickup = activeRide ? { lat: activeRide.pickup_lat!, lng: activeRide.pickup_lng! } : null;
  const rideDropoff = activeRide ? { lat: activeRide.dropoff_lat!, lng: activeRide.dropoff_lng! } : null;
  const rideRouteMode = activeRide
    ? (activeRide.status === 'in_progress' ? 'driver-to-dropoff' as const : 'driver-to-pickup' as const)
    : undefined;

  const etaLabel = activeRide
    ? (activeRide.status === 'in_progress' ? (language === 'fr' ? 'Arrivée estimée' : 'ETA to Destination') : (language === 'fr' ? 'Arrivée du chauffeur' : 'Time to Pickup'))
    : null;

  // Active ride tracking view
  const renderActiveRidePanel = () => {
    if (!activeRide) return null;
    const statusInfo = STATUS_LABELS[activeRide.status] || STATUS_LABELS.searching;
    const isTerminal = activeRide.status === 'completed' || activeRide.status === 'cancelled';

    return (
      <motion.div
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-full lg:w-[400px] border-l border-border bg-background p-5 space-y-4 overflow-y-auto max-h-[60vh] lg:max-h-none"
      >
        {/* Status Banner */}
        <div className={`rounded-xl p-4 text-center ${
          activeRide.status === 'completed' ? 'bg-green-500/20 border border-green-500/30' :
          activeRide.status === 'cancelled' ? 'bg-destructive/20 border border-destructive/30' :
          activeRide.status === 'arrived' ? 'bg-yellow-500/20 border border-yellow-500/30' :
          'bg-primary/20 border border-primary/30'
        }`}>
          <p className="text-3xl mb-1">{statusInfo.icon}</p>
          <p className="text-lg font-bold text-foreground">
            {language === 'fr' ? statusInfo.fr : statusInfo.en}
          </p>
          {activeRide.status === 'searching' && (
            <Loader2 className="h-5 w-5 animate-spin mx-auto mt-2 text-primary" />
          )}
        </div>

        {/* ETA Banner */}
        {etaMinutes !== null && activeRide.status !== 'searching' && (
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{etaLabel}</p>
            </div>
            <p className="text-2xl font-bold text-primary">
              {Math.round(etaMinutes)} min
            </p>
          </div>
        )}

        {/* Driver Details */}
        {driverDetails && activeRide.driver_id && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center text-xl font-bold text-primary">
                {driverDetails.first_name?.[0] || '?'}
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  {driverDetails.first_name} {driverDetails.last_name?.[0] ? `${driverDetails.last_name[0]}.` : ''}
                </p>
                {driverDetails.vehicle_color && driverDetails.vehicle_make && (
                  <p className="text-sm text-muted-foreground">
                    {[driverDetails.vehicle_color, driverDetails.vehicle_make, driverDetails.vehicle_model].filter(Boolean).join(' ')}
                  </p>
                )}
                {driverDetails.license_plate && (
                  <p className="text-sm font-mono font-bold text-primary">{driverDetails.license_plate}</p>
                )}
              </div>
            </div>
            {driverDetails.phone_number && (
              <a href={`tel:${driverDetails.phone_number}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                <Phone className="h-4 w-4" />
                {driverDetails.phone_number}
              </a>
            )}
          </div>
        )}

        {/* Trip Info */}
        <div className="space-y-2">
          <div className="flex items-start gap-3">
            <div className="mt-1 h-3 w-3 rounded-full bg-green-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground font-semibold">{language === 'fr' ? 'Départ' : 'Pickup'}</p>
              <p className="text-sm font-medium text-foreground">{activeRide.pickup_address}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Navigation className="mt-1 h-3 w-3 text-primary flex-shrink-0" />
            <div>
              <p className="text-xs text-primary font-semibold">Destination</p>
              <p className="text-sm font-medium text-foreground">{activeRide.dropoff_address}</p>
            </div>
          </div>
        </div>

        {/* Cancel button */}
        {!isTerminal && activeRide.status !== 'in_progress' && (
          <Button variant="destructive" className="w-full h-12" onClick={handleCancelRide}>
            {language === 'fr' ? 'Annuler la course' : 'Cancel Ride'}
          </Button>
        )}

        {isTerminal && (
          <Button className="w-full h-12 gradient-primary" onClick={() => navigate('/rider-home')}>
            {language === 'fr' ? 'Retour à l\'accueil' : 'Back to Home'}
          </Button>
        )}
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <div className="flex-1 flex flex-col lg:flex-row pt-16">
        {/* Map */}
        <div className="flex-1 relative min-h-[300px] lg:min-h-0">
          {activeRide && mapboxToken ? (
            <MapComponent
              pickup={ridePickup}
              dropoff={rideDropoff}
              driverLocation={driverLocation}
              routeMode={rideRouteMode}
              followDriver={true}
              onRouteInfo={handleRouteInfo}
              showRecenter={!!driverLocation}
            />
          ) : mapboxToken ? (
            <MapView
              token={mapboxToken}
              pickup={pickup ? { lat: pickup.lat, lng: pickup.lng } : null}
              dropoff={dropoff ? { lat: dropoff.lat, lng: dropoff.lng } : null}
              routeGeoJson={routeGeoJson}
            />
          ) : (
            <div className="w-full h-full bg-secondary/30 flex items-center justify-center text-muted-foreground">
              Map unavailable
            </div>
          )}
        </div>

        {/* Post-cancel options panel */}
        {postCancelState === 'show_options' && !activeRide && (
          <motion.div
            initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
            className="w-full lg:w-[400px] border-l border-border bg-background p-6 space-y-5 overflow-y-auto max-h-[60vh] lg:max-h-none flex flex-col items-center justify-center"
          >
            <div className="text-center space-y-2">
              <p className="text-4xl">❌</p>
              <h2 className="text-xl font-bold text-foreground">{language === 'fr' ? 'Course annulée' : 'Ride Cancelled'}</h2>
              <p className="text-sm text-muted-foreground">{language === 'fr' ? 'Que souhaitez-vous faire ?' : 'What would you like to do?'}</p>
            </div>
            <Button className="w-full h-14 text-lg font-bold gradient-primary" onClick={handleModifyRide}>
              {language === 'fr' ? '✏️ Modifier la course' : '✏️ Modify Ride'}
            </Button>
            <Button variant="outline" className="w-full h-14 text-lg font-bold border-border" onClick={handleBackToHome}>
              {language === 'fr' ? '🏠 Retour à l\'accueil' : '🏠 Back to Home'}
            </Button>
          </motion.div>
        )}

        {/* Active ride tracking panel */}
        {activeRide ? renderActiveRidePanel() : (
          postCancelState !== 'show_options' && fare && step === 'estimate' && (
            <motion.div
              initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
              className="w-full lg:w-[400px] border-l border-border bg-background p-5 space-y-4 overflow-y-auto max-h-[60vh] lg:max-h-none"
            >
              <FareCard
                fare={fare} distanceKm={distanceKm} durationMin={durationMin}
                onConfirm={handleRequestRide} loading={requesting} confirmed={confirmed}
                pickupAddress={pickup?.address} dropoffAddress={dropoff?.address}
              />
            </motion.div>
          )
        )}
      </div>
    </div>
  );
};

export default RideBooking;
