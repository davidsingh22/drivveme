import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Star, DollarSign, CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import Navbar from '@/components/Navbar';

const TIP_PRESETS = [2, 5, 10];

const RideReview = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const state = location.state as {
    rideId: string;
    driverId: string;
    driverName: string | null;
    fare: number;
    pickupAddress: string;
    dropoffAddress: string;
  } | null;

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [tipAmount, setTipAmount] = useState(0);
  const [customTip, setCustomTip] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [driverDisplayName, setDriverDisplayName] = useState(state?.driverName || 'your driver');

  // Fetch driver name if not provided
  useEffect(() => {
    if (!state?.driverId || state?.driverName) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('first_name')
        .eq('user_id', state.driverId)
        .single();
      if (data?.first_name) setDriverDisplayName(data.first_name);
    })();
  }, [state?.driverId, state?.driverName]);

  useEffect(() => {
    if (!state?.rideId) {
      navigate('/rider-home', { replace: true });
    }
  }, [state, navigate]);

  if (!state) return null;

  const handleTipPreset = (amount: number) => {
    setTipAmount(amount);
    setCustomTip('');
  };

  const handleCustomTipChange = (val: string) => {
    setCustomTip(val);
    const n = parseFloat(val);
    setTipAmount(isNaN(n) || n < 0 ? 0 : n);
  };

  const handleSubmit = async () => {
    if (!user || rating === 0) {
      toast({ title: language === 'fr' ? 'Veuillez donner une note' : 'Please select a rating', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      // Submit rating
      const { error: ratingError } = await supabase.from('ratings').insert({
        ride_id: state.rideId,
        rider_id: user.id,
        driver_id: state.driverId,
        rating,
        comment: comment.trim() || null,
      });
      if (ratingError) throw ratingError;

      // Submit tip if any
      if (tipAmount > 0) {
        await supabase.from('rides').update({
          tip_amount: tipAmount,
          tip_status: 'completed',
        }).eq('id', state.rideId);

        // Try charging tip via edge function
        supabase.functions.invoke('charge-tip', {
          body: { ride_id: state.rideId, amount: tipAmount },
        }).catch(() => {});
      }

      setSubmitted(true);
      toast({ title: language === 'fr' ? 'Merci!' : 'Thank you!', description: language === 'fr' ? 'Votre évaluation a été envoyée' : 'Your review has been submitted' });

      setTimeout(() => navigate('/rider-home', { replace: true }), 2500);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    navigate('/rider-home', { replace: true });
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center pt-16">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center space-y-4 p-8"
          >
            <CheckCircle className="h-20 w-20 text-green-500 mx-auto" />
            <h2 className="text-2xl font-bold text-foreground">
              {language === 'fr' ? 'Merci pour votre évaluation!' : 'Thanks for your review!'}
            </h2>
            {tipAmount > 0 && (
              <p className="text-lg text-muted-foreground">
                {language === 'fr' ? `Pourboire de $${tipAmount.toFixed(2)} envoyé` : `$${tipAmount.toFixed(2)} tip sent`}
              </p>
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center pt-16 px-4">
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="w-full max-w-md space-y-6 py-8"
        >
          {/* Header */}
          <div className="text-center space-y-2">
            <p className="text-4xl">✅</p>
            <h1 className="text-2xl font-bold text-foreground">
              {language === 'fr' ? 'Course terminée!' : 'Ride Completed!'}
            </h1>
            <p className="text-muted-foreground">
              {state.pickupAddress.split(',')[0]} → {state.dropoffAddress.split(',')[0]}
            </p>
            <p className="text-xl font-bold text-primary">${state.fare.toFixed(2)}</p>
          </div>

          {/* Rating */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground text-center">
              {language === 'fr' ? `Comment était ${driverDisplayName}?` : `How was ${driverDisplayName}?`}
            </h2>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="transition-transform hover:scale-110 focus:outline-none"
                >
                  <Star
                    className={`h-10 w-10 transition-colors ${
                      star <= (hoverRating || rating)
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-muted-foreground/30'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Comment */}
          <Textarea
            placeholder={language === 'fr' ? 'Laisser un commentaire (optionnel)' : 'Leave a comment (optional)'}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="resize-none bg-card border-border"
            rows={3}
          />

          {/* Tip */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground text-center flex items-center justify-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              {language === 'fr' ? 'Ajouter un pourboire' : 'Add a tip'}
            </h2>
            <div className="flex gap-3 justify-center">
              {TIP_PRESETS.map((amount) => (
                <button
                  key={amount}
                  onClick={() => handleTipPreset(amount)}
                  className={`px-5 py-3 rounded-xl text-lg font-bold border-2 transition-all ${
                    tipAmount === amount && !customTip
                      ? 'border-primary bg-primary/20 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  ${amount}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium">$</span>
              <input
                type="number"
                min="0"
                step="0.50"
                placeholder={language === 'fr' ? 'Autre montant' : 'Custom amount'}
                value={customTip}
                onChange={(e) => handleCustomTipChange(e.target.value)}
                className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {tipAmount === 0 && (
              <p className="text-xs text-muted-foreground text-center">
                {language === 'fr' ? 'Le pourboire est optionnel' : 'Tipping is optional'}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-3 pt-2">
            <Button
              className="w-full h-14 text-lg font-bold gradient-primary"
              onClick={handleSubmit}
              disabled={submitting || rating === 0}
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  {language === 'fr' ? 'Envoyer' : 'Submit Review'}
                  {tipAmount > 0 && ` + $${tipAmount.toFixed(2)} tip`}
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={handleSkip}
            >
              {language === 'fr' ? 'Passer' : 'Skip'}
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default RideReview;
