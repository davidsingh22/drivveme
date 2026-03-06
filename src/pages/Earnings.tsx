import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { DollarSign, Car, ArrowUp, ArrowDown, Wallet, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/pricing';
import Navbar from '@/components/Navbar';
import { Skeleton } from '@/components/ui/skeleton';

const PLATFORM_FEE = 5.00;

const Earnings = () => {
  const { t, language } = useLanguage();
  const { user, isDriver, driverProfile, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all'>('week');
  const [summary, setSummary] = useState({ totalEarnings: 0, totalFares: 0, totalPlatformFees: 0, totalRides: 0, availableBalance: 0, totalTips: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { if (!authLoading && (!user || !isDriver)) navigate('/login'); }, [user, isDriver, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    const fetchEarnings = async () => {
      setIsLoading(true);
      let startDate: Date;
      const now = new Date();
      switch (period) {
        case 'today': startDate = new Date(now.setHours(0, 0, 0, 0)); break;
        case 'week': startDate = new Date(now.setDate(now.getDate() - 7)); break;
        case 'month': startDate = new Date(now.setMonth(now.getMonth() - 1)); break;
        case 'all': startDate = new Date(0); break;
      }
      const { data } = await supabase.from('rides').select('actual_fare, driver_earnings, platform_fee, dropoff_at, tip_amount, tip_status')
        .eq('driver_id', user.id).eq('status', 'completed').gte('dropoff_at', startDate.toISOString()).order('dropoff_at', { ascending: false });

      if (data) {
        const totalEarnings = data.reduce((sum, r) => sum + (Number(r.driver_earnings) || 0), 0);
        const totalFares = data.reduce((sum, r) => sum + (Number(r.actual_fare) || 0), 0);
        const totalPlatformFees = data.reduce((sum, r) => sum + (Number(r.platform_fee) || 0), 0);
        const totalTips = data.reduce((sum, r) => (r as any).tip_status === 'charged' ? sum + (Number(r.tip_amount) || 0) : sum, 0);
        setSummary({ totalEarnings, totalFares, totalPlatformFees, totalRides: data.length, availableBalance: Number(driverProfile?.total_earnings) || 0, totalTips });
      }
      setIsLoading(false);
    };
    fetchEarnings();
  }, [user, period, driverProfile?.total_earnings]);

  const availableBalance = Number(driverProfile?.total_earnings) || 0;

  if (authLoading && !user) return <div className="min-h-screen bg-background p-6 space-y-4"><Skeleton className="h-12 w-48" /><Skeleton className="h-[60vh] w-full rounded-xl" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-12 container mx-auto px-4 max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-3xl font-bold mb-8">{t('nav.earnings')}</h1>

          <Card className="p-6 mb-6 gradient-card border-primary/20">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-muted-foreground mb-2"><Wallet className="h-5 w-5" /><span>Available Balance</span></div>
                <p className="font-display text-4xl font-bold text-accent">{formatCurrency(availableBalance, language)}</p>
                <p className="text-sm text-muted-foreground mt-1">Ready to withdraw</p>
              </div>
              <Button size="lg" disabled={availableBalance <= 0} className="gap-2"><ExternalLink className="h-4 w-4" />Withdraw</Button>
            </div>
          </Card>

          <Tabs value={period} onValueChange={(v) => setPeriod(v as typeof period)} className="mb-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="all">All Time</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <Card className="p-6"><div className="flex items-center gap-2 text-muted-foreground mb-2"><DollarSign className="h-5 w-5" /><span>Period Earnings</span></div><p className="font-display text-3xl font-bold">{formatCurrency(summary.totalEarnings, language)}</p></Card>
            <Card className="p-6"><div className="flex items-center gap-2 text-muted-foreground mb-2"><Car className="h-5 w-5" /><span>Completed Rides</span></div><p className="font-display text-3xl font-bold">{summary.totalRides}</p></Card>
          </div>

          <Card className="p-6 mb-8">
            <h3 className="font-display text-lg font-semibold mb-4">Earnings Breakdown</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-muted-foreground"><ArrowUp className="h-4 w-4 text-green-500" /><span>Total Fares</span></div><span className="font-medium">{formatCurrency(summary.totalFares, language)}</span></div>
              <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-muted-foreground"><ArrowDown className="h-4 w-4 text-destructive" /><span>Platform Fees</span></div><span className="font-medium text-destructive">-{formatCurrency(summary.totalPlatformFees, language)}</span></div>
              <div className="flex items-center justify-between pt-3 border-t border-border"><span className="font-semibold">Your Earnings</span><span className="font-bold text-lg text-accent">{formatCurrency(summary.totalEarnings, language)}</span></div>
            </div>
          </Card>

          {driverProfile && (
            <Card className="p-6 mb-8 bg-muted/50">
              <h3 className="font-display text-lg font-semibold mb-4">Lifetime Stats</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div><p className="text-2xl font-bold">{driverProfile.total_rides}</p><p className="text-sm text-muted-foreground">Total Rides</p></div>
                <div><p className="text-2xl font-bold text-accent">{formatCurrency(Number(driverProfile.total_earnings), language)}</p><p className="text-sm text-muted-foreground">Total Earnings</p></div>
                <div><p className="text-2xl font-bold">{driverProfile.average_rating || '5.00'} ⭐</p><p className="text-sm text-muted-foreground">Rating</p></div>
              </div>
            </Card>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Earnings;