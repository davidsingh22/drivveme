import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut, Bell, Globe, Shield, Car, MapPin, Clock, DollarSign, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Logo from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import NotificationsBell from '@/components/NotificationsBell';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, roles, isAdmin, isDriver, isRider, signOut } = useAuth();
  const { language, setLanguage } = useLanguage();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const initials = profile
    ? `${(profile.first_name || '')[0] || ''}${(profile.last_name || '')[0] || ''}`.toUpperCase() || '?'
    : '?';

  const navLinks = [];
  if (isRider || (!isDriver && !isAdmin && user)) {
    navLinks.push({ to: '/rider-home', label: 'Book a Ride', icon: Car });
    navLinks.push({ to: '/ride-history', label: 'My Rides', icon: Clock });
  }
  if (isDriver) {
    navLinks.push({ to: '/driver', label: 'Dashboard', icon: Car });
    navLinks.push({ to: '/earnings', label: 'Earnings', icon: DollarSign });
    navLinks.push({ to: '/driver-messages', label: 'Messages', icon: MessageSquare });
    navLinks.push({ to: '/ride-history', label: 'My Rides', icon: Clock });
  }
  if (isAdmin) {
    navLinks.push({ to: '/admin', label: 'Admin', icon: Shield });
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center">
            <Logo size="sm" />
          </Link>

          {/* Desktop nav links */}
          {user && (
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Button
                  key={link.to}
                  asChild
                  variant={location.pathname === link.to ? 'secondary' : 'ghost'}
                  size="sm"
                >
                  <Link to={link.to}>{link.label}</Link>
                </Button>
              ))}
            </div>
          )}

          <div className="hidden md:flex items-center gap-2">
            {!user ? (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/login">Log In</Link>
                </Button>
                <Button asChild size="sm" className="gradient-primary shadow-button">
                  <Link to="/signup">Sign Up</Link>
                </Button>
              </>
            ) : (
              <>
                <NotificationsBell userId={user.id} />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setLanguage(language === 'en' ? 'fr' : 'en')}
                  className="text-muted-foreground"
                >
                  <Globe className="h-4 w-4" />
                  <span className="ml-1 text-xs font-medium">{language.toUpperCase()}</span>
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={profile?.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <div className="px-2 py-1.5 text-sm font-medium">
                      {profile?.first_name || user.email}
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>

          <button
            className="md:hidden text-foreground"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {isOpen && (
          <div className="md:hidden py-4 border-t border-border space-y-2">
            {!user ? (
              <>
                <Link to="/login" className="block px-4 py-2 text-foreground hover:bg-muted rounded-lg" onClick={() => setIsOpen(false)}>
                  Log In
                </Link>
                <Link to="/signup" className="block px-4 py-2 text-foreground hover:bg-muted rounded-lg" onClick={() => setIsOpen(false)}>
                  Sign Up
                </Link>
              </>
            ) : (
              <>
                {navLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="block px-4 py-2 text-foreground hover:bg-muted rounded-lg"
                    onClick={() => setIsOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
                <button
                  onClick={() => { handleSignOut(); setIsOpen(false); }}
                  className="block w-full text-left px-4 py-2 text-destructive hover:bg-muted rounded-lg"
                >
                  Sign Out
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
