import { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapboxToken } from '@/hooks/useMapboxToken';
import { AlertCircle, Loader2 } from 'lucide-react';

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
}

const defaultCenter: [number, number] = [-73.5673, 45.5017];

const MapComponent = ({
  pickup, dropoff, driverLocation, routeMode = 'pickup-dropoff',
  onMapClick, showUserLocation = true, followDriver = false,
}: MapComponentProps) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const pickupMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const dropoffMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const { token, loading, error } = useMapboxToken();

  useEffect(() => {
    if (!token || !mapContainerRef.current || mapRef.current) return;
    mapboxgl.accessToken = token;

    const initialCenter = pickup ? [pickup.lng, pickup.lat] : defaultCenter;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: initialCenter as [number, number],
      zoom: 14,
      antialias: true,
    });

    map.on('load', () => setMapLoaded(true));
    map.on('click', (e) => { if (onMapClick) onMapClick(e.lngLat.lat, e.lngLat.lng); });
    mapRef.current = map;

    return () => { map.remove(); mapRef.current = null; setMapLoaded(false); };
  }, [token]);

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

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    if (driverLocation) {
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLngLat([driverLocation.lng, driverLocation.lat]);
      } else {
        const el = createMarkerElement('#a855f7');
        el.style.width = '36px'; el.style.height = '36px';
        el.style.boxShadow = '0 4px 14px rgba(168,85,247,0.5)';
        driverMarkerRef.current = new mapboxgl.Marker(el).setLngLat([driverLocation.lng, driverLocation.lat]).addTo(mapRef.current);
      }
      if (followDriver) {
        mapRef.current.easeTo({ center: [driverLocation.lng, driverLocation.lat], duration: 1000 });
      }
    } else if (driverMarkerRef.current) { driverMarkerRef.current.remove(); driverMarkerRef.current = null; }
  }, [driverLocation, mapLoaded, followDriver]);

  // Fetch and render route
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

    const fetchRoute = async () => {
      try {
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start!.lng},${start!.lat};${end!.lng},${end!.lat}?geometries=geojson&access_token=${token}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.routes?.[0]?.geometry) return;

        const geojson = { type: 'Feature' as const, properties: {}, geometry: data.routes[0].geometry };

        if (map.getSource('route')) {
          (map.getSource('route') as mapboxgl.GeoJSONSource).setData(geojson as any);
        } else {
          map.addSource('route', { type: 'geojson', data: geojson as any });
          map.addLayer({
            id: 'route-line', type: 'line', source: 'route',
            paint: { 'line-color': '#a855f7', 'line-width': 4, 'line-opacity': 0.8 },
          });
        }
      } catch (err) { console.error('Route fetch error:', err); }
    };

    fetchRoute();
  }, [pickup, dropoff, driverLocation, routeMode, mapLoaded, token]);

  if (loading) return <div className="w-full h-full flex items-center justify-center bg-muted"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error) return <div className="w-full h-full flex items-center justify-center bg-muted text-destructive"><AlertCircle className="h-6 w-6 mr-2" />Map unavailable</div>;

  return <div ref={mapContainerRef} className="w-full h-full" />;
};

export default MapComponent;