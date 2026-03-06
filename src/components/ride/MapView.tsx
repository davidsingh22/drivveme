import { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface MapViewProps {
  token: string;
  pickup: { lat: number; lng: number } | null;
  dropoff: { lat: number; lng: number } | null;
  routeGeoJson?: GeoJSON.Feature | null;
}

const MapView = ({ token, pickup, dropoff, routeGeoJson }: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const pickupMarker = useRef<mapboxgl.Marker | null>(null);
  const dropoffMarker = useRef<mapboxgl.Marker | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    mapboxgl.accessToken = token;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-73.5673, 45.5017], // Montreal
      zoom: 12,
      attributionControl: false,
    });
    map.current.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
    return () => { map.current?.remove(); map.current = null; };
  }, [token]);

  // Update markers
  useEffect(() => {
    if (!map.current) return;

    if (pickup) {
      if (pickupMarker.current) pickupMarker.current.setLngLat([pickup.lng, pickup.lat]);
      else {
        const el = document.createElement('div');
        el.className = 'w-4 h-4 rounded-full bg-green-500 border-2 border-white shadow-lg';
        pickupMarker.current = new mapboxgl.Marker(el).setLngLat([pickup.lng, pickup.lat]).addTo(map.current);
      }
    }

    if (dropoff) {
      if (dropoffMarker.current) dropoffMarker.current.setLngLat([dropoff.lng, dropoff.lat]);
      else {
        const el = document.createElement('div');
        el.className = 'w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow-lg';
        dropoffMarker.current = new mapboxgl.Marker(el).setLngLat([dropoff.lng, dropoff.lat]).addTo(map.current);
      }
    }

    // Fit bounds
    if (pickup && dropoff) {
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend([pickup.lng, pickup.lat]);
      bounds.extend([dropoff.lng, dropoff.lat]);
      map.current.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 800 });
    } else if (pickup) {
      map.current.flyTo({ center: [pickup.lng, pickup.lat], zoom: 14 });
    }
  }, [pickup, dropoff]);

  // Draw route
  useEffect(() => {
    if (!map.current || !routeGeoJson) return;
    const m = map.current;
    const onLoad = () => {
      if (m.getSource('route')) {
        (m.getSource('route') as mapboxgl.GeoJSONSource).setData(routeGeoJson as any);
      } else {
        m.addSource('route', { type: 'geojson', data: routeGeoJson as any });
        m.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#a855f7', 'line-width': 4, 'line-opacity': 0.8 },
        });
      }
    };
    if (m.isStyleLoaded()) onLoad();
    else m.on('load', onLoad);
  }, [routeGeoJson]);

  return (
    <div ref={mapContainer} className="w-full h-full rounded-2xl overflow-hidden" />
  );
};

export default MapView;
