import { useState, useRef, useEffect } from 'react';
import { MapPin, Navigation, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface AddressResult {
  place_name: string;
  center: [number, number]; // [lng, lat]
}

interface AddressSearchProps {
  token: string;
  label: string;
  icon: 'pickup' | 'dropoff';
  value: string;
  onSelect: (address: string, lat: number, lng: number) => void;
  onClear: () => void;
}

const AddressSearch = ({ token, label, icon, value, onSelect, onClear }: AddressSearchProps) => {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<AddressResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<number>();

  useEffect(() => { setQuery(value); }, [value]);

  const search = (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 3) { setResults([]); setOpen(false); return; }

    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${token}&country=CA&proximity=-73.5673,45.5017&limit=5&types=address,poi`
        );
        const data = await res.json();
        if (data.features) {
          setResults(data.features.map((f: any) => ({ place_name: f.place_name, center: f.center })));
          setOpen(true);
        }
      } catch {}
    }, 300);
  };

  const handleSelect = (r: AddressResult) => {
    setQuery(r.place_name);
    setOpen(false);
    onSelect(r.place_name, r.center[1], r.center[0]);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setOpen(false);
    onClear();
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <div className={`h-3 w-3 rounded-full shrink-0 ${icon === 'pickup' ? 'bg-green-500' : 'bg-red-500'}`} />
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 pr-8 bg-secondary/50 border-border"
            placeholder={label}
            value={query}
            onChange={(e) => search(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
          />
          {query && (
            <button onClick={handleClear} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full left-5 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
          {results.map((r, i) => (
            <button
              key={i}
              className="w-full text-left px-4 py-3 text-sm hover:bg-secondary/50 transition-colors flex items-start gap-2"
              onClick={() => handleSelect(r)}
            >
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <span className="line-clamp-2">{r.place_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AddressSearch;
