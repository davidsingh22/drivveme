import { FareEstimate, formatCurrency } from '@/lib/pricing';
import { Car, Clock, Route, MapPin, Navigation, TrendingDown, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

interface FareCardProps {
  fare: FareEstimate;
  distanceKm: number;
  durationMin: number;
  onConfirm: () => void;
  loading?: boolean;
  pickupAddress?: string;
  dropoffAddress?: string;
}

const FareCard = ({ fare, distanceKm, durationMin, onConfirm, loading, pickupAddress, dropoffAddress }: FareCardProps) => {
  const { language } = useLanguage();

  return (
    <div className="space-y-4">
      {/* Pickup & Destination */}
      {(pickupAddress || dropoffAddress) && (
        <div className="space-y-3">
          {pickupAddress && (
            <div className="flex items-start gap-3">
              <div className="mt-1 h-3 w-3 rounded-full bg-green-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-primary font-semibold">{language === 'fr' ? 'Départ' : 'Pickup'}</p>
                <p className="text-sm font-medium text-foreground">{pickupAddress}</p>
              </div>
            </div>
          )}
          {dropoffAddress && (
            <div className="flex items-start gap-3">
              <Navigation className="mt-1 h-3 w-3 text-green-400 flex-shrink-0" />
              <div>
                <p className="text-xs text-green-400 font-semibold">Destination</p>
                <p className="text-sm font-medium text-foreground">{dropoffAddress}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Distance & Duration */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Distance</p>
          <p className="text-xl font-bold text-foreground">{distanceKm.toFixed(1)} km</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Duration</p>
          <p className="text-xl font-bold text-foreground">{Math.round(durationMin)} min</p>
        </div>
      </div>

      {/* Price Comparison */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <h3 className="text-center text-sm font-semibold text-muted-foreground">Price Comparison</h3>
        
        <div className="grid grid-cols-2 gap-3">
          {/* Uber Price */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-center relative">
            <span className="absolute top-2 right-2 text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium text-muted-foreground">Uber</span>
            <p className="text-xs text-muted-foreground mt-2 mb-1">Current Uber Price</p>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(fare.uberTotal)}</p>
            <p className="text-[10px] text-muted-foreground">taxes included</p>
          </div>

          {/* Drivveme Price */}
          <div className="rounded-xl border-2 border-primary bg-primary/10 p-4 text-center relative">
            <span className="absolute -top-2.5 -right-2 text-[10px] bg-green-500 text-white px-2 py-0.5 rounded-full font-bold">-{fare.savingsPercent}%</span>
            <p className="text-xs text-primary mt-2 mb-1 font-semibold">Drivveme Price</p>
            <p className="text-2xl font-bold text-primary">{formatCurrency(fare.total)}</p>
            <p className="text-[10px] text-primary/70">taxes included</p>
          </div>
        </div>

        {/* Savings Banner */}
        <div className="flex items-center justify-center gap-2 bg-green-500/10 border border-green-500/30 rounded-xl p-3">
          <TrendingDown className="h-5 w-5 text-green-500" />
          <div className="text-center">
            <p className="text-base font-bold text-green-500">
              You save {formatCurrency(fare.savings)}!
            </p>
            <p className="text-xs text-green-500/80">
              {fare.savingsPercent}% cheaper than Uber
            </p>
          </div>
        </div>
      </div>

      {/* Tax breakdown */}
      <div className="text-xs text-muted-foreground space-y-1.5 px-1">
        <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(fare.subtotalBeforeTax)}</span></div>
        <div className="flex justify-between"><span>GST (5%)</span><span>{formatCurrency(fare.gstAmount)}</span></div>
        <div className="flex justify-between"><span>QST (9.975%)</span><span>{formatCurrency(fare.qstAmount)}</span></div>
        <div className="flex justify-between font-semibold text-sm text-foreground pt-1 border-t border-border">
          <span>Total</span>
          <span className="text-primary">{formatCurrency(fare.total)}</span>
        </div>
      </div>

      <Button
        className="w-full h-14 text-base font-bold gradient-primary"
        onClick={onConfirm}
        disabled={loading}
      >
        <CreditCard className="h-5 w-5 mr-2" />
        {loading ? (language === 'fr' ? 'Demande en cours…' : 'Requesting…') : (language === 'fr' ? 'Confirmer et payer' : 'Confirm Ride & Pay')}
      </Button>
    </div>
  );
};

export default FareCard;
