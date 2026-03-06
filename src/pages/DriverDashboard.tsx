import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Car, LogOut, MapPin } from 'lucide-react';
import Logo from '@/components/Logo';
import { useNavigate } from 'react-router-dom';

const DriverDashboard = () => {
  const { user, profile, driverProfile, signOut, isDriver } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
        <Logo size="sm" />
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {profile?.first_name || user?.email}
          </span>
          <Button variant="ghost" size="icon" onClick={handleSignOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Car className="h-8 w-8 text-primary" />
          </div>
          <h1 className="font-display text-3xl font-bold mb-2">Driver Dashboard</h1>
          <p className="text-muted-foreground">
            {driverProfile?.application_status === 'approved'
              ? 'You are approved! Start accepting rides.'
              : driverProfile?.application_status === 'pending'
              ? 'Your application is under review.'
              : 'Welcome, driver!'}
          </p>
        </div>

        <div className="grid gap-4">
          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="font-semibold mb-2">Status</h2>
            <p className="text-muted-foreground text-sm">
              Application: <span className="capitalize font-medium text-foreground">{driverProfile?.application_status || 'N/A'}</span>
            </p>
            <p className="text-muted-foreground text-sm">
              Rating: <span className="font-medium text-foreground">{driverProfile?.average_rating || '5.00'} ⭐</span>
            </p>
            <p className="text-muted-foreground text-sm">
              Total Rides: <span className="font-medium text-foreground">{driverProfile?.total_rides || 0}</span>
            </p>
          </div>

          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="font-semibold mb-2">Earnings</h2>
            <p className="text-3xl font-bold text-primary">${Number(driverProfile?.total_earnings || 0).toFixed(2)}</p>
            <p className="text-muted-foreground text-sm">Total earnings</p>
          </div>

          <div className="bg-muted/50 rounded-xl border border-border p-6 text-center">
            <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">
              Real-time ride requests and map view coming soon.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DriverDashboard;
