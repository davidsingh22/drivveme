import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getRouteForRoles } from '@/lib/routeByRole';
import { Skeleton } from '@/components/ui/skeleton';

type AllowedRole = 'rider' | 'driver' | 'admin';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: AllowedRole[];
}

/**
 * Non-blocking protected route wrapper.
 * If we have a user (even from cache), render children immediately.
 * Only show skeleton when we have zero session info.
 */
const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, roles, authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Still resolving the initial session — wait
    if (authLoading) return;

    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    // Once roles are loaded, enforce access
    if (roles.length > 0) {
      const hasAccess = roles.some((r) => allowedRoles.includes(r as AllowedRole));
      if (!hasAccess) {
        const correctRoute = getRouteForRoles(roles as AllowedRole[]);
        navigate(correctRoute, { replace: true });
      }
    }
  }, [user, roles, authLoading, allowedRoles, navigate]);

  // No session info at all yet — show skeleton (not spinner)
  if (authLoading && !user) {
    return (
      <div className="min-h-screen bg-background p-6 space-y-4">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-[60vh] w-full rounded-xl" />
        <div className="flex gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 flex-1" />
        </div>
      </div>
    );
  }

  // Not logged in (will redirect via useEffect)
  if (!user && !authLoading) return null;

  // User exists — render children immediately (roles load in background)
  // If wrong role, useEffect will redirect
  if (user && roles.length > 0) {
    const hasAccess = roles.some((r) => allowedRoles.includes(r as AllowedRole));
    if (!hasAccess) return null;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
