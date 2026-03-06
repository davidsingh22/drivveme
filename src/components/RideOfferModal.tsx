import { useState, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MapPin, Navigation, Clock, DollarSign, Zap, Trophy, X, Shield, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/pricing';
import { calculatePlatformFee, calculateDriverEarnings } from '@/lib/platformFees';
import { useLanguage } from '@/contexts/LanguageContext';

type RideSummary = {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  estimated_fare: number;
  distance_km?: number;
  estimated_duration_minutes?: number;
  pickup_eta_minutes?: number;
  is_priority?: boolean;
  pickup_lat?: number;
  pickup_lng?: number;
};

interface RideOfferModalProps {
  open: boolean;
  ride: RideSummary | null;
  onDecline: () => void;
  onAccept: () => void;
  countdownSeconds?: number;
  driverLocation?: { lat: number; lng: number } | null;
}

function calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function RideOfferModal({ open, ride, onDecline, onAccept, countdownSeconds = 25, driverLocation }: RideOfferModalProps) {
  const { language } = useLanguage();
  const [timeLeft, setTimeLeft] = useState(countdownSeconds);
  const timerRef = useRef<number | null>(null);
  const onDeclineRef = useRef(onDecline);
  const onAcceptRef = useRef(onAccept);
  const tapGuardRef = useRef(false);
  onDeclineRef.current = onDecline;
  onAcceptRef.current = onAccept;

  const driverDistanceKm = useMemo(() => {
    if (!driverLocation || !ride?.pickup_lat || !ride?.pickup_lng) return null;
    return calculateDistanceKm(driverLocation.lat, driverLocation.lng, ride.pickup_lat, ride.pickup_lng);
  }, [driverLocation, ride?.pickup_lat, ride?.pickup_lng]);

  useEffect(() => {
    if (open && ride) {
      setTimeLeft(countdownSeconds);
      tapGuardRef.current = false;
    }
  }, [open, ride?.id, countdownSeconds]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          onDeclineRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [open]);

  if (!ride) return null;

  const handleAccept = () => {
    if (tapGuardRef.current) return;
    tapGuardRef.current = true;
    onAcceptRef.current();
    setTimeout(() => { tapGuardRef.current = false; }, 1000);
  };

  const handleDecline = () => {
    if (tapGuardRef.current) return;
    tapGuardRef.current = true;
    onDeclineRef.current();
    setTimeout(() => { tapGuardRef.current = false; }, 1000);
  };

  const fare = ride.estimated_fare;
  const driverEarnings = calculateDriverEarnings(fare);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 flex items-start justify-center p-2 pt-16 pb-4 overflow-y-auto"
          style={{ zIndex: 2147483647, pointerEvents: 'none' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="fixed inset-0 bg-black/80 backdrop-blur-xl" style={{ pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()} />

          <motion.div
            initial={{ y: 50, scale: 0.9, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 50, scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="relative w-full max-w-xl my-auto" style={{ pointerEvents: 'auto' }}
          >
            <Card className="relative bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/30 border border-primary/30 flex items-center justify-center">
                    <Car className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-xl font-semibold text-primary">Drivveme</span>
                </div>
                <div className={`px-4 py-2 rounded-full font-bold text-lg ${timeLeft <= 10 ? 'bg-destructive/20 border border-destructive/50 text-destructive animate-pulse' : 'bg-white/10 border border-white/10 text-white'}`}>
                  {timeLeft}s
                </div>
              </div>

              <div className="px-6 py-5 space-y-5">
                <div className="flex items-center justify-center">
                  <div className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-primary/20 border-2 border-primary/50">
                    <Navigation className="h-5 w-5 text-primary" />
                    <span className="text-primary font-bold text-xl">
                      {driverDistanceKm !== null
                        ? (driverDistanceKm < 1
                            ? `${(driverDistanceKm * 1000).toFixed(0)}m to rider`
                            : `${driverDistanceKm.toFixed(1)} km to rider`)
                        : 'Getting location...'}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 h-3 w-3 rounded-full bg-green-500 flex-shrink-0" />
                    <div>
                      <p className="text-white/60 text-xs mb-0.5">Pickup</p>
                      <p className="text-white font-medium line-clamp-2">{ride.pickup_address}</p>
                    </div>
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-3xl font-extrabold text-green-400">${driverEarnings.toFixed(2)}</div>
                  <div className="text-green-400 text-sm font-medium">You earn</div>
                </div>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleAccept(); }}
                  className="w-full h-14 text-lg font-bold bg-green-600 hover:bg-green-700 active:scale-95 text-white rounded-xl touch-manipulation select-none cursor-pointer"
                >
                  {language === 'fr' ? 'Accepter la course' : 'Accept Ride'}
                </button>

                <div className="flex items-center gap-3 bg-accent/10 border border-accent/30 rounded-xl p-3">
                  <Trophy className="h-5 w-5 text-accent flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-accent">Accept fast → Priority Driver!</p>
                    <p className="text-xs text-white/60">Get priority for 30 min</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDecline(); }}
                  className="w-full h-14 text-lg font-bold bg-destructive hover:bg-destructive/90 active:scale-95 text-white rounded-xl flex items-center justify-center gap-2 touch-manipulation select-none cursor-pointer"
                >
                  <X className="h-5 w-5" />
                  No thanks — Skip
                </button>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}