import { FareEstimate, formatCurrency } from '@/lib/pricing';
import { Car, Clock, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FareCardProps {
  fare: FareEstimate;
  distanceKm: number;
  durationMin: number;
  onConfirm: () => void;
  loading?: boolean;
}

const FareCard = ({ fare, distanceKm, durationMin, onConfirm, loading }: FareCardProps) => {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      {/* Route summary */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1"><Route className="h-4 w-4" />{distanceKm.toFixed(1)} km</span>
        <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{Math.round(durationMin)} min</span>
      </div>

      {/* Price */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Estimated fare</p>
          <p className="text-3xl font-bold text-foreground">{formatCurrency(fare.total)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground line-through">{formatCurrency(fare.uberTotal)} Uber</p>
          <p className="text-sm font-semibold text-green-500">Save {fare.savingsPercent}%</p>
        </div>
      </div>

      {/* Tax breakdown */}
      <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
        <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(fare.subtotalBeforeTax)}</span></div>
        <div className="flex justify-between"><span>GST (5%)</span><span>{formatCurrency(fare.gstAmount)}</span></div>
        <div className="flex justify-between"><span>QST (9.975%)</span><span>{formatCurrency(fare.qstAmount)}</span></div>
      </div>

      <Button
        className="w-full h-12 text-base font-semibold gradient-primary"
        onClick={onConfirm}
        disabled={loading}
      >
        <Car className="h-5 w-5 mr-2" />
        {loading ? 'Requesting…' : 'Request Ride'}
      </Button>
    </div>
  );
};

export default FareCard;
