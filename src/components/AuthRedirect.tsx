import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getRouteForRoles, AUTH_PAGES } from '@/lib/routeByRole';
import { useToast } from '@/hooks/use-toast';

/**
 * Wrap public/auth pages with this component.
 * If a session + roles exist, it redirects to the correct dashboard.
 * Shows a brief loading spinner while checking.
 */
const AuthRedirect = ({ children }: { children: React.ReactNode }) => {
  const { user, roles, authLoading, profileLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const rolesRef = useRef(roles);
  rolesRef.current = roles;

  const isChecking = authLoading || profileLoading;

  useEffect(() => {
    if (isChecking || !user) return;

    // If on an auth page and we have a session, redirect by role
    if (AUTH_PAGES.includes(location.pathname)) {
      if (roles.length > 0) {
        const target = getRouteForRoles(roles as any);
        if (location.pathname !== target) {
          navigate(target, { replace: true });
        }
      } else {
        // Give roles a moment to load, then show error
        const timeout = setTimeout(() => {
          if (rolesRef.current.length === 0) {
            toast({
              title: 'No role assigned',
              description: 'Please contact support.',
              variant: 'destructive',
            });
          }
        }, 5000);
        return () => clearTimeout(timeout);
      }
    }
  }, [user, roles, isChecking, location.pathname, navigate, toast]);

  // Show loading state while checking auth on auth pages
  if (isChecking && AUTH_PAGES.includes(location.pathname)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AuthRedirect;
