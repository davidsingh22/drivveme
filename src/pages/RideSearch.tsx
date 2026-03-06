import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Navigation, Clock, Search, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useMapboxToken, clearMapboxTokenCache } from '@/hooks/useMapboxToken';

interface SavedDestination {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  visit_count: number;
  last_visited_at: string;
}

const RideSearch = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { user } = useAuth();
  const { token: mapboxToken, loading: tokenLoading } = useMapboxToken();
  const mapboxTokenRef = useRef<string | null>(null);
  useEffect(() => { mapboxTokenRef.current = mapboxToken ?? null; }, [mapboxToken]);

  const [pickupLabel, setPickupLabel] = useState(
    language === 'fr' ? 'Position actuelle' : 'Current location'
  );
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destinationQuery, setDestinationQuery] = useState('');
  const [destinations, setDestinations] = useState<SavedDestination[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTimedOut, setSearchTimedOut] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const destRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const pendingQueryRef = useRef<string | null>(null);
  const pendingGeocodeRef = useRef<{ lat: number; lng: number } | null>(null);

  const TOKEN_PERSIST_KEY = 'drivveme_mapbox_token';
  const CACHE_KEY = 'drivveme_recent_destinations';

  const getPersistedToken = (): string | null => {
    try {
      const raw = localStorage.getItem(TOKEN_PERSIST_KEY);
      if (raw) {
        const { token, ts } = JSON.parse(raw);
        if (token && typeof token === 'string' && token.startsWith('pk.') && Date.now() - ts < 86_400_000) {
          return token;
        }
      }
    } catch { /* ignore */ }
    return null;
  };

  const persistToken = (token: string) => {
    try {
      localStorage.setItem(TOKEN_PERSIST_KEY, JSON.stringify({ token, ts: Date.now() }));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const persisted = getPersistedToken();
    if (persisted && !mapboxTokenRef.current) {
      mapboxTokenRef.current = persisted;
      setApiReady(true);
    }
  }, []);

  useEffect(() => {
    if (mapboxToken && !tokenLoading) {
      mapboxTokenRef.current = mapboxToken;
      persistToken(mapboxToken);
      setApiReady(true);
      if (pendingGeocodeRef.current) {
        const { lat, lng } = pendingGeocodeRef.current;
        pendingGeocodeRef.current = null;
        reverseGeocode(lat, lng);
      }
      if (pendingQueryRef.current && pendingQueryRef.current.length >= 2) {
        const q = pendingQueryRef.current;
        pendingQueryRef.current = null;
        setTimeout(() => searchMapbox(q), 0);
      }
    }
  }, [mapboxToken, tokenLoading]);

  // Emergency override
  useEffect(() => {
    const forceStartTimer = setTimeout(() => {
      if (!apiReady) {
        const persisted = getPersistedToken();
        if (!mapboxTokenRef.current && persisted) mapboxTokenRef.current = persisted;
        setApiReady(true);
      }
    }, 2000);
    return () => clearTimeout(forceStartTimer);
  }, []);

  // Load cached destinations
  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) setDestinations(JSON.parse(cached));
    } catch { /* ignore */ }
  }, []);

  // GPS location detection
  const locationResolvedRef = useRef(false);
  useEffect(() => {
    if (locationResolvedRef.current) return;

    try {
      const raw = localStorage.getItem('drivveme_gps_warm');
      if (raw) {
        const data = JSON.parse(raw);
        if (Date.now() - data.ts < 600_000) {
          locationResolvedRef.current = true;
          setPickupCoords({ lat: data.lat, lng: data.lng });
          reverseGeocode(data.lat, data.lng);
          return;
        }
      }
    } catch { /* ignore */ }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          locationResolvedRef.current = true;
          setPickupCoords(coords);
          reverseGeocode(coords.lat, coords.lng);
          localStorage.setItem('drivveme_gps_warm', JSON.stringify({ ...coords, ts: Date.now() }));
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
      );
    }
  }, [user?.id]);

  // Load past destinations from DB
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('rider_destinations')
      .select('*')
      .eq('user_id', user.id)
      .order('last_visited_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setDestinations(data as SavedDestination[]);
          localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        }
      });
  }, [user?.id]);

  // Auto-focus destination input
  useEffect(() => {
    const t = setTimeout(() => destRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, []);

  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      const token = mapboxTokenRef.current || mapboxToken || getPersistedToken();
      if (!token) {
        pendingGeocodeRef.current = { lat, lng };
        return;
      }
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&language=${language}&types=address,poi`
        );
        const data = await res.json();
        const place = data?.features?.[0];
        if (place) {
          const addr =
            place.properties?.address ||
            (place.text && place.address ? `${place.address} ${place.text}` : null) ||
            place.place_name?.split(',')[0];
          if (addr) setPickupLabel(addr);
        }
      } catch { /* silent */ }
    },
    [mapboxToken, language]
  );

  const searchMapbox = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setSearchResults([]);
        setSearchTimedOut(false);
        return;
      }

      const token = mapboxTokenRef.current || getPersistedToken();
      if (!token) {
        pendingQueryRef.current = query;
        return;
      }

      setIsSearching(true);
      setSearchTimedOut(false);

      const proximity = pickupCoords
        ? `${pickupCoords.lng},${pickupCoords.lat}`
        : '-73.5673,45.5017';

      try {
        const geoRes = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&language=${language}&country=ca&limit=5&types=poi,address,place,locality,neighborhood&autocomplete=true&fuzzyMatch=true&proximity=${proximity}`
        );
        const geoData = await geoRes.json();
        const geoResults = (geoData.features || []).map((f: any) => ({
          id: f.id,
          name: f.text || f.place_name?.split(',')[0],
          address: f.place_name,
          lat: f.center[1],
          lng: f.center[0],
        }));

        if (geoResults.length > 0) {
          setSearchResults(geoResults);
          retryCountRef.current = 0;
        } else if (retryCountRef.current < 1) {
          retryCountRef.current++;
          clearMapboxTokenCache();
          setTimeout(() => searchMapbox(query), 500);
        } else {
          setSearchResults([]);
          setSearchTimedOut(true);
        }
      } catch {
        setSearchResults([]);
        setSearchTimedOut(true);
      } finally {
        setIsSearching(false);
      }
    },
    [language, pickupCoords]
  );

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDestinationQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchMapbox(val), 300);
  };

  const handleRetrySearch = () => {
    retryCountRef.current = 0;
    clearMapboxTokenCache();
    setSearchTimedOut(false);
    if (destinationQuery.length >= 2) searchMapbox(destinationQuery);
  };

  const selectDestination = (dest: { name: string; address: string; lat: number; lng: number }) => {
    navigate('/ride', {
      state: {
        dropoffAddress: dest.address || dest.name,
        dropoffLat: dest.lat,
        dropoffLng: dest.lng,
        pickupAddress: pickupLabel,
        pickupLat: pickupCoords?.lat ?? null,
        pickupLng: pickupCoords?.lng ?? null,
        autoEstimate: true,
      },
    });
  };

  const filteredDestinations =
    destinationQuery.length > 0
      ? destinations.filter(
          (d) =>
            d.name.toLowerCase().includes(destinationQuery.toLowerCase()) ||
            d.address.toLowerCase().includes(destinationQuery.toLowerCase())
        )
      : destinations;

  const getIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('casino')) return '🎰';
    if (n.includes('airport') || n.includes('aéroport')) return '✈️';
    if (n.includes('hotel') || n.includes('hôtel')) return '🏨';
    if (n.includes('gym') || n.includes('fitness')) return '💪';
    if (n.includes('home') || n.includes('maison')) return '🏠';
    if (n.includes('work') || n.includes('travail') || n.includes('bureau')) return '💼';
    return null;
  };

  const showRecentsFallback = searchTimedOut && destinations.length > 0;
  const showInitSpinner = !apiReady && destinationQuery.length >= 2;

  return (
    <div className="fixed inset-0 z-50 bg-[hsl(240,20%,12%)] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-[env(safe-area-inset-top,12px)] pb-3 border-b border-border">
        <Button
          variant="ghost"
          size="icon"
          className="text-foreground hover:bg-secondary"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-foreground font-semibold text-lg">
          {language === 'fr' ? 'Planifier un trajet' : 'Plan your ride'}
        </h2>
      </div>

      {/* Pickup + Destination boxes */}
      <div className="px-4 py-4 space-y-3">
        <div className="flex items-center gap-3 bg-secondary/50 rounded-xl px-4 py-3">
          <div className="h-3 w-3 rounded-full bg-accent flex-shrink-0" />
          <span className="text-muted-foreground text-sm truncate flex-1">{pickupLabel}</span>
          <Navigation className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
        </div>

        <div className="flex items-center gap-3 bg-secondary/70 rounded-xl px-4 py-3">
          <div className="h-3 w-3 rounded-sm bg-primary flex-shrink-0" />
          <input
            ref={destRef}
            type="text"
            value={destinationQuery}
            onChange={handleQueryChange}
            placeholder={language === 'fr' ? 'Où allez-vous ?' : 'Where to?'}
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm outline-none"
            autoComplete="off"
          />
          {(isSearching || showInitSpinner) && (
            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin flex-shrink-0" />
          )}
        </div>
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-y-auto px-4 pb-[env(safe-area-inset-bottom,16px)]">
        {showInitSpinner && searchResults.length === 0 && (
          <div className="text-center py-6">
            <p className="text-muted-foreground text-xs">
              {language === 'fr' ? 'Initialisation de la recherche…' : 'Warming up search…'}
            </p>
          </div>
        )}

        {searchTimedOut && (
          <div className="mb-3 p-3 rounded-xl bg-secondary/50 flex items-center justify-between">
            <p className="text-muted-foreground text-xs">
              {language === 'fr' ? 'La recherche a expiré. Vos destinations récentes:' : 'Search timed out. Your recent destinations:'}
            </p>
            <Button variant="ghost" size="sm" onClick={handleRetrySearch} className="text-foreground hover:bg-secondary gap-1">
              <RotateCcw className="h-3 w-3" />
              {language === 'fr' ? 'Réessayer' : 'Retry'}
            </Button>
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="mb-4">
            {searchResults.map((r: any) => (
              <button
                key={r.id}
                onClick={() => selectDestination(r)}
                className="w-full flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-secondary/50 transition-colors text-left"
              >
                <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                  <Search className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground text-sm font-medium truncate">{r.name}</p>
                  <p className="text-muted-foreground text-xs truncate">{r.address}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {(filteredDestinations.length > 0 && (searchResults.length === 0 || showRecentsFallback)) && (
          <>
            {(destinationQuery.length === 0 || showRecentsFallback || showInitSpinner) && (
              <p className="text-muted-foreground text-xs uppercase tracking-wider mb-2 px-2">
                {language === 'fr' ? 'Récents' : 'Recent'}
              </p>
            )}
            {filteredDestinations.map((d) => (
              <motion.button
                key={d.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => selectDestination(d)}
                className="w-full flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-secondary/50 transition-colors text-left"
              >
                <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                  {getIcon(d.name) ? (
                    <span className="text-lg">{getIcon(d.name)}</span>
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground text-sm font-medium truncate">{d.name}</p>
                  <p className="text-muted-foreground text-xs truncate">{d.address}</p>
                </div>
                {d.visit_count > 1 && (
                  <span className="text-muted-foreground/50 text-xs flex-shrink-0">{d.visit_count}×</span>
                )}
              </motion.button>
            ))}
          </>
        )}

        {filteredDestinations.length === 0 && searchResults.length === 0 && destinationQuery.length > 0 && !isSearching && !searchTimedOut && apiReady && !showInitSpinner && (
          <div className="text-center py-12 space-y-3">
            <p className="text-muted-foreground text-sm">
              {language === 'fr' ? 'Aucun résultat trouvé' : 'No results found'}
            </p>
            <Button variant="ghost" size="sm" onClick={handleRetrySearch} className="text-muted-foreground hover:bg-secondary gap-2">
              <RotateCcw className="h-4 w-4" />
              {language === 'fr' ? 'Réessayer' : 'Try Again'}
            </Button>
          </div>
        )}

        {filteredDestinations.length === 0 && searchResults.length === 0 && destinationQuery.length === 0 && !searchTimedOut && (
          <div className="text-center py-12 text-muted-foreground/50 text-sm">
            {language === 'fr' ? 'Commencez à taper pour rechercher' : 'Start typing to search'}
          </div>
        )}
      </div>
    </div>
  );
};

export default RideSearch;
