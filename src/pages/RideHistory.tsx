import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, MapPin, Navigation, Clock, DollarSign, Star, CheckCircle, PlayCircle, Eye, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/pricing';
import Navbar from '@/components/Navbar';

interface Ride {
  id: string; pickup_address: string; dropoff_address: string; distance_km: number;
  estimated_duration_minutes: number; estimated_fare: number; actual_fare: number | null;
  driver_earnings: number | null; platform_fee: number | null; tip_amount: number | null;
  status: string; requested_at: string; dropoff_at: string | null; rider_id: string; driver_id: string | null;
}

const RideHistory = () => {
  const { t, language } = useLanguage();
  const { user, session, isRider, isDriver, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const currentUserId = session?.user?.id ?? user?.id;
  const [rides, setRides] = useState<Ride[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'completed' | 'cancelled'>('all');

  useEffect(() => { if (!authLoading && !user) navigate('/login'); }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    const fetchRides = async () => {
      setIsLoading(true);
      let query = supabase.from('rides').select('*').order('requested_at', { ascending: false });
      if (isRider && !isDriver) query = query.eq('rider_id', user.id);
      else if (isDriver && !isRider) query = query.eq('driver_id', user.id);
      else query = query.or(`rider_id.eq.${user.id},driver_id.eq.${user.id}`);
      if (filter === 'completed') query = query.eq('status', 'completed');
      else if (filter === 'cancelled') query = query.eq('status', 'cancelled');
      const { data } = await query;
      setRides(data || []);
      setIsLoading(false);
    };
    fetchRides();
  }, [user, isRider, isDriver, filter]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-500 bg-green-500/10';
      case 'cancelled': return 'text-destructive bg-destructive/10';
      default: return 'text-primary bg-primary/10';
    }
  };

  const formatDate = (dateString: string) => new Intl.DateTimeFormat(language === 'fr' ? 'fr-CA' : 'en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(dateString));

  if (authLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="animate-pulse text-muted-foreground">{t('common.loading')}</div></div>;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-12 container mx-auto px-4 max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-3xl font-bold mb-8">{t('nav.history')}</h1>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="mb-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            </TabsList>
          </Tabs>
          {isLoading ? (
            <div className="space-y-4">{[1,2,3].map(i => <Card key={i} className="p-6 animate-pulse"><div className="h-4 bg-muted rounded w-1/4 mb-4" /><div className="h-4 bg-muted rounded w-3/4 mb-2" /><div className="h-4 bg-muted rounded w-1/2" /></Card>)}</div>
          ) : rides.length === 0 ? (
            <Card className="p-12 text-center">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-display text-xl font-semibold mb-2">No rides yet</h3>
              <Button onClick={() => navigate(isDriver ? '/driver' : '/ride')} className="gradient-primary">{isDriver ? 'Start Driving' : 'Book a Ride'}</Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {rides.map((ride, index) => (
                <motion.div key={ride.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
                  <Card className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Calendar className="h-4 w-4" />{formatDate(ride.requested_at)}</div>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(ride.status)}`}>{ride.status}</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2"><MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /><span className="text-sm line-clamp-1">{ride.pickup_address}</span></div>
                      <div className="flex items-start gap-2"><Navigation className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" /><span className="text-sm line-clamp-1">{ride.dropoff_address}</span></div>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {ride.distance_km && <span>{ride.distance_km.toFixed(1)} km</span>}
                        {ride.estimated_duration_minutes && <span>{ride.estimated_duration_minutes} min</span>}
                      </div>
                      <span className="font-display font-bold text-lg">{formatCurrency(ride.actual_fare || ride.estimated_fare, language)}</span>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default RideHistory;