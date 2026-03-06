import { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapboxToken } from '@/hooks/useMapboxToken';
import { AlertCircle, Loader2, Crosshair } from 'lucide-react';

export interface NavigationStep {
  instruction: string;
  distance: number; // meters
  duration: number; // seconds
  maneuver: { type: string; modifier?: string };
}

interface MapComponentProps {
  pickup?: { lat: number; lng: number } | null;
  dropoff?: { lat: number; lng: number } | null;
  driverLocation?: { lat: number; lng: number } | null;
  riderLocation?: { lat: number; lng: number } | null;
  routeMode?: 'pickup-dropoff' | 'driver-to-pickup' | 'driver-to-dropoff';
  onMapClick?: (lat: number, lng: number) => void;
  showUserLocation?: boolean;
  followDriver?: boolean;
  pickupAddress?: string;
  use3DStyle?: boolean;
  /** Called whenever a new ETA (in minutes) and distance (km) is calculated for the active route */
  onRouteInfo?: (etaMinutes: number, distanceKm: number) => void;
  /** Called with the latest turn-by-turn navigation steps */
  onNavigationSteps?: (steps: NavigationStep[]) => void;
  showRecenter?: boolean;
  /** When true, map enters full navigation mode: tighter follow, tilted view */
  navigationMode?: boolean;
}

const defaultCenter: [number, number] = [-73.5673, 45.5017];

const createCarIcon = (): HTMLElement => {
  const el = document.createElement('div');
  el.innerHTML = `<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="20" r="18" fill="#a855f7" stroke="white" stroke-width="3"/>
    <path d="M14 24V17L17 13H23L26 17V24H14Z" fill="white"/>
    <circle cx="16.5" cy="24" r="1.5" fill="#a855f7"/>
    <circle cx="23.5" cy="24" r="1.5" fill="#a855f7"/>
    <rect x="17" y="14" width="6" height="3" rx="1" fill="#a855f7" opacity="0.5"/>
  </svg>`;
  el.style.cursor = 'pointer';
  return el;
};

const MapComponent = ({
  pickup, dropoff, driverLocation, routeMode = 'pickup-dropoff',
  onMapClick, showUserLocation = true, followDriver = false,
  onRouteInfo, onNavigationSteps, showRecenter = false, navigationMode = false,
}: MapComponentProps) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const pickupMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const dropoffMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const routeFetchRef = useRef<number>(0);
  const lastRouteFetchRef = useRef<string>('');
  const userInteractedRef = useRef(false);

  const { token, loading, error } = useMapboxToken();

  useEffect(() => {
    if (!token || !mapContainerRef.current || mapRef.current) return;
    mapboxgl.accessToken = token;

    const initialCenter = pickup ? [pickup.lng, pickup.lat] : defaultCenter;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/navigation-night-v1',
      center: initialCenter as [number, number],
      zoom: 14,
      antialias: true,
    });

    map.on('load', () => setMapLoaded(true));
    map.on('click', (e) => { if (onMapClick) onMapClick(e.lngLat.lat, e.lngLat.lng); });
    
    // Track user interaction to pause auto-follow
    map.on('dragstart', () => { userInteractedRef.current = true; });
    map.on('zoomstart', (e) => { if (!(e as any).flyTo) userInteractedRef.current = true; });

    mapRef.current = map;

    return () => { map.remove(); mapRef.current = null; setMapLoaded(false); };
  }, [token]);

  // Navigation mode: tilt & zoom
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    if (navigationMode && driverLocation) {
      userInteractedRef.current = false;
      mapRef.current.easeTo({
        center: [driverLocation.lng, driverLocation.lat],
        zoom: 16,
        pitch: 60,
        bearing: 0,
        duration: 1200,
      });
    } else if (!navigationMode) {
      mapRef.current.easeTo({ pitch: 0, duration: 600 });
    }
  }, [navigationMode, mapLoaded]);

  const createMarkerElement = useCallback((color: string) => {
    const el = document.createElement('div');
    el.style.width = '24px'; el.style.height = '24px'; el.style.borderRadius = '50%';
    el.style.backgroundColor = color; el.style.border = '3px solid white';
    el.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
    return el;
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    if (pickup) {
      if (pickupMarkerRef.current) pickupMarkerRef.current.setLngLat([pickup.lng, pickup.lat]);
      else pickupMarkerRef.current = new mapboxgl.Marker(createMarkerElement('#a855f7')).setLngLat([pickup.lng, pickup.lat]).addTo(mapRef.current);
    } else if (pickupMarkerRef.current) { pickupMarkerRef.current.remove(); pickupMarkerRef.current = null; }
  }, [pickup, mapLoaded]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    if (dropoff) {
      if (dropoffMarkerRef.current) dropoffMarkerRef.current.setLngLat([dropoff.lng, dropoff.lat]);
      else dropoffMarkerRef.current = new mapboxgl.Marker(createMarkerElement('#84cc16')).setLngLat([dropoff.lng, dropoff.lat]).addTo(mapRef.current);
    } else if (dropoffMarkerRef.current) { dropoffMarkerRef.current.remove(); dropoffMarkerRef.current = null; }
  }, [dropoff, mapLoaded]);

  // Driver car icon marker
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    if (driverLocation) {
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLngLat([driverLocation.lng, driverLocation.lat]);
      } else {
        const el = createCarIcon();
        driverMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat([driverLocation.lng, driverLocation.lat]).addTo(mapRef.current);
      }
      // In navigation mode always follow; otherwise respect user interaction
      if ((navigationMode || (followDriver && !userInteractedRef.current))) {
        const opts: any = { center: [driverLocation.lng, driverLocation.lat], duration: 1000 };
        if (navigationMode) { opts.zoom = 16; opts.pitch = 60; }
        mapRef.current.easeTo(opts);
      }
    } else if (driverMarkerRef.current) { driverMarkerRef.current.remove(); driverMarkerRef.current = null; }
  }, [driverLocation, mapLoaded, followDriver, navigationMode]);

  // Fetch and render route with ETA + steps
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !token) return;
    const map = mapRef.current;

    let start: { lat: number; lng: number } | null = null;
    let end: { lat: number; lng: number } | null = null;

    if (routeMode === 'driver-to-pickup' && driverLocation && pickup) { start = driverLocation; end = pickup; }
    else if (routeMode === 'driver-to-dropoff' && driverLocation && dropoff) { start = driverLocation; end = dropoff; }
    else if (routeMode === 'pickup-dropoff' && pickup && dropoff) { start = pickup; end = dropoff; }

    if (!start || !end) {
      if (map.getLayer('route-line')) map.removeLayer('route-line');
      if (map.getSource('route')) map.removeSource('route');
      return;
    }

    // Throttle: only re-fetch if coords changed meaningfully (>50m)
    const key = `${start.lat.toFixed(4)},${start.lng.toFixed(4)}-${end.lat.toFixed(4)},${end.lng.toFixed(4)}`;
    if (key === lastRouteFetchRef.current) return;

    const fetchId = ++routeFetchRef.current;

    const fetchRoute = async () => {
      try {
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start!.lng},${start!.lat};${end!.lng},${end!.lat}?geometries=geojson&overview=full&steps=true&banner_instructions=true&voice_instructions=true&access_token=${token}`;
        const res = await fetch(url);
        const data = await res.json();
        if (fetchId !== routeFetchRef.current) return; // stale
        if (!data.routes?.[0]?.geometry) return;

        lastRouteFetchRef.current = key;

        const route = data.routes[0];
        const etaMinutes = route.duration / 60;
        const distanceKm = route.distance / 1000;

        if (onRouteInfo) onRouteInfo(etaMinutes, distanceKm);

        // Extract navigation steps
        if (onNavigationSteps && route.legs?.[0]?.steps) {
          const steps: NavigationStep[] = route.legs[0].steps.map((s: any) => ({
            instruction: s.maneuver?.instruction || '',
            distance: s.distance,
            duration: s.duration,
            maneuver: { type: s.maneuver?.type, modifier: s.maneuver?.modifier },
          }));
          onNavigationSteps(steps);
        }

        const geojson = { type: 'Feature' as const, properties: {}, geometry: route.geometry };

        if (map.getSource('route')) {
          (map.getSource('route') as mapboxgl.GeoJSONSource).setData(geojson as any);
        } else {
          map.addSource('route', { type: 'geojson', data: geojson as any });
          map.addLayer({
            id: 'route-line', type: 'line', source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#a855f7', 'line-width': 6, 'line-opacity': 0.9 },
          });
        }

        // Fit bounds on first route draw (only if not in nav mode)
        if (!navigationMode && start && end) {
          const bounds = new mapboxgl.LngLatBounds();
          bounds.extend([start!.lng, start!.lat]);
          bounds.extend([end!.lng, end!.lat]);
          map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 800 });
        }
      } catch (err) { console.error('Route fetch error:', err); }
    };

    fetchRoute();
  }, [pickup, dropoff, driverLocation, routeMode, mapLoaded, token, onRouteInfo, onNavigationSteps, navigationMode]);

  const handleRecenter = useCallback(() => {
    if (!mapRef.current || !driverLocation) return;
    userInteractedRef.current = false;
    const opts: any = { center: [driverLocation.lng, driverLocation.lat], zoom: 15, duration: 800 };
    if (navigationMode) { opts.zoom = 16; opts.pitch = 60; }
    mapRef.current.flyTo(opts);
  }, [driverLocation, navigationMode]);

  if (loading) return <div className="w-full h-full flex items-center justify-center bg-muted"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error) return <div className="w-full h-full flex items-center justify-center bg-muted text-destructive"><AlertCircle className="h-6 w-6 mr-2" />Map unavailable</div>;

  return (
    <div className="w-full h-full relative">
      <div ref={mapContainerRef} className="w-full h-full" />
      {showRecenter && driverLocation && (
        <button
          onClick={handleRecenter}
          className="absolute bottom-6 right-6 z-10 h-12 w-12 rounded-full bg-background/90 border border-border shadow-lg flex items-center justify-center hover:bg-background transition-colors"
          title="Recenter"
        >
          <Crosshair className="h-5 w-5 text-primary" />
        </button>
      )}
    </div>
  );
};

export default MapComponent;
