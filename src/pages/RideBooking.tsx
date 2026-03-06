import { useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useMapboxToken } from '@/hooks/useMapboxToken';
import { supabase } from '@/integrations/supabase/client';
import { calculateFare, FareEstimate } from '@/lib/pricing';
import { Button } from '@/components/ui/button';
import Navbar from '@/components/Navbar';
import MapView from '@/components/ride/MapView';
import FareCard from '@/components/ride/FareCard';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect } from 'react';

interface Location {
  address: string;
  lat: number;
  lng: number;
}

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
  const [step, setStep] = useState<'input' | 'estimate'>('input');

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
          fetchRouteFromCoords(
            state.pickupLat, state.pickupLng,
            state.dropoffLat, state.dropoffLng
          );
        }
      }, 500);
    }
  }, [routeLocation.state, mapboxToken]);

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
        setRouteGeoJson({
          type: 'Feature',
          properties: {},
          geometry: route.geometry,
        });
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
      const { error } = await supabase.from('rides').insert({
        rider_id: user.id,
        pickup_address: pickup.address,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        dropoff_address: dropoff.address,
        dropoff_lat: dropoff.lat,
        dropoff_lng: dropoff.lng,
        estimated_fare: fare.total,
        distance_km: distanceKm,
        estimated_duration_minutes: Math.round(durationMin),
        subtotal_before_tax: fare.subtotalBeforeTax,
        gst_amount: fare.gstAmount,
        qst_amount: fare.qstAmount,
        platform_fee: fare.platformFee,
        driver_earnings: fare.driverEarnings,
        status: 'searching',
      });
      if (error) throw error;
      toast({ title: '🚗 Ride requested!', description: 'Looking for a driver near you…' });
      setPickup(null);
      setDropoff(null);
      setRouteGeoJson(null);
      setFare(null);
      setStep('input');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to request ride', variant: 'destructive' });
    } finally {
      setRequesting(false);
    }
  };

  if (tokenLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <div className="flex-1 flex flex-col lg:flex-row pt-16">
        {/* Map */}
        <div className="flex-1 relative min-h-[300px] lg:min-h-0">
          {mapboxToken ? (
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

        {/* Fare estimate panel - right side on desktop, bottom on mobile */}
        {fare && step === 'estimate' && (
          <motion.div
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="w-full lg:w-[400px] border-l border-border bg-background p-5 space-y-4 overflow-y-auto max-h-[60vh] lg:max-h-none"
          >
            <FareCard
              fare={fare}
              distanceKm={distanceKm}
              durationMin={durationMin}
              onConfirm={handleRequestRide}
              loading={requesting}
              pickupAddress={pickup?.address}
              dropoffAddress={dropoff?.address}
            />
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default RideBooking;
