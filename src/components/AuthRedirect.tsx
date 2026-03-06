import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getRouteForRoles, AUTH_PAGES } from '@/lib/routeByRole';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Wrap public/auth pages. If a session + roles exist, redirect to dashboard.
 * Uses skeleton instead of spinner for instant-feel loading.
 */
const AuthRedirect = ({ children }: { children: React.ReactNode }) => {
  const { user, roles, authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const rolesRef = useRef(roles);
  rolesRef.current = roles;

  useEffect(() => {
    if (authLoading || !user) return;

    if (AUTH_PAGES.includes(location.pathname)) {
      if (roles.length > 0) {
        const target = getRouteForRoles(roles as any);
        if (location.pathname !== target) {
          navigate(target, { replace: true });
        }
      } else {
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
  }, [user, roles, authLoading, location.pathname, navigate, toast]);

  // Only show skeleton on auth pages while initial auth is resolving
  if (authLoading && AUTH_PAGES.includes(location.pathname)) {
    return (
      <div className="min-h-screen bg-background p-6 space-y-6">
        <Skeleton className="h-16 w-40 mx-auto" />
        <Skeleton className="h-[50vh] w-full rounded-xl" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  return <>{children}</>;
};

export default AuthRedirect;
