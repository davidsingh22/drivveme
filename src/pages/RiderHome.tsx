import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useMapboxToken } from '@/hooks/useMapboxToken';
import { supabase } from '@/integrations/supabase/client';
import { calculateFare, FareEstimate } from '@/lib/pricing';
import { Button } from '@/components/ui/button';
import { LogOut, Loader2 } from 'lucide-react';
import Logo from '@/components/Logo';
import MapView from '@/components/ride/MapView';
import AddressSearch from '@/components/ride/AddressSearch';
import FareCard from '@/components/ride/FareCard';

interface Location {
  address: string;
  lat: number;
  lng: number;
}

const RiderHome = () => {
  const { profile, signOut, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { token: mapboxToken, loading: tokenLoading } = useMapboxToken();

  const [pickup, setPickup] = useState<Location | null>(null);
  const [dropoff, setDropoff] = useState<Location | null>(null);
  const [routeGeoJson, setRouteGeoJson] = useState<GeoJSON.Feature | null>(null);
  const [fare, setFare] = useState<FareEstimate | null>(null);
  const [distanceKm, setDistanceKm] = useState(0);
  const [durationMin, setDurationMin] = useState(0);
  const [requesting, setRequesting] = useState(false);

  // Fetch route when both points are set
  const fetchRoute = useCallback(async (p: Location, d: Location) => {
    if (!mapboxToken) return;
    try {
      const res = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${p.lng},${p.lat};${d.lng},${d.lat}?geometries=geojson&overview=full&access_token=${mapboxToken}`
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
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to calculate route', variant: 'destructive' });
    }
  }, [mapboxToken, toast]);

  const handlePickup = (address: string, lat: number, lng: number) => {
    const loc = { address, lat, lng };
    setPickup(loc);
    if (dropoff) fetchRoute(loc, dropoff);
  };

  const handleDropoff = (address: string, lat: number, lng: number) => {
    const loc = { address, lat, lng };
    setDropoff(loc);
    if (pickup) fetchRoute(pickup, loc);
  };

  const clearRoute = () => {
    setRouteGeoJson(null);
    setFare(null);
    setDistanceKm(0);
    setDurationMin(0);
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
      // Reset form
      setPickup(null);
      setDropoff(null);
      clearRoute();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to request ride', variant: 'destructive' });
    } finally {
      setRequesting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/landing', { replace: true });
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
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
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Logo size="sm" />
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {profile?.first_name || user?.email}
            </span>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex flex-col lg:flex-row">
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

        {/* Booking panel */}
        <div className="w-full lg:w-[420px] border-t lg:border-t-0 lg:border-l border-border bg-background p-5 space-y-5 overflow-y-auto max-h-[50vh] lg:max-h-none">
          <div>
            <h1 className="font-display text-2xl font-bold">
              {greeting()}, {profile?.first_name || 'there'} 👋
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Where are we headed today?</p>
          </div>

          {mapboxToken && (
            <div className="space-y-3">
              <AddressSearch
                token={mapboxToken}
                label="Pickup location"
                icon="pickup"
                value={pickup?.address || ''}
                onSelect={handlePickup}
                onClear={() => { setPickup(null); clearRoute(); }}
              />
              <AddressSearch
                token={mapboxToken}
                label="Where to?"
                icon="dropoff"
                value={dropoff?.address || ''}
                onSelect={handleDropoff}
                onClear={() => { setDropoff(null); clearRoute(); }}
              />
            </div>
          )}

          {fare && (
            <FareCard
              fare={fare}
              distanceKm={distanceKm}
              durationMin={durationMin}
              onConfirm={handleRequestRide}
              loading={requesting}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default RiderHome;
