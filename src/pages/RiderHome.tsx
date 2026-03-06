import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Car, MapPin, LogOut } from 'lucide-react';
import Logo from '@/components/Logo';

const RiderHome = () => {
  const { profile, signOut, user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/landing', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Logo size="sm" />
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {profile?.first_name || user?.email}
            </span>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        <h1 className="font-display text-3xl font-bold mb-2">
          Welcome{profile?.first_name ? `, ${profile.first_name}` : ''}! 👋
        </h1>
        <p className="text-muted-foreground mb-8">Where would you like to go?</p>

        {/* Ride booking placeholder */}
        <div className="rounded-2xl border border-border bg-card p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">Book a Ride</h2>
              <p className="text-sm text-muted-foreground">Enter your destination to get started</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl bg-secondary/50 border border-border p-4 text-muted-foreground text-sm">
              📍 Pickup location will use your current location
            </div>
            <div className="rounded-xl bg-secondary/50 border border-border p-4 text-muted-foreground text-sm">
              🏁 Where to?
            </div>
          </div>
        </div>

        {/* Recent rides placeholder */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Car className="h-5 w-5 text-accent" />
            </div>
            <h2 className="font-semibold text-lg">Recent Rides</h2>
          </div>
          <p className="text-muted-foreground text-sm">No rides yet. Book your first ride above!</p>
        </div>
      </main>
    </div>
  );
};

export default RiderHome;
