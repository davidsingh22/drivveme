import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Shield, LogOut } from 'lucide-react';
import Logo from '@/components/Logo';
import { useNavigate } from 'react-router-dom';

const AdminPanel = () => {
  const { user, profile, signOut } = useAuth();
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
          <span className="text-sm text-muted-foreground">{profile?.first_name || user?.email}</span>
          <Button variant="ghost" size="icon" onClick={handleSignOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="font-display text-3xl font-bold mb-2">Admin Panel</h1>
          <p className="text-muted-foreground">Manage drivers, rides, and platform settings.</p>
        </div>

        <div className="bg-muted/50 rounded-xl border border-border p-8 text-center">
          <p className="text-muted-foreground">Admin features coming soon: driver approvals, ride management, analytics.</p>
        </div>
      </main>
    </div>
  );
};

export default AdminPanel;
