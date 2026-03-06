import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getRouteForRoles } from '@/lib/routeByRole';

type AllowedRole = 'rider' | 'driver' | 'admin';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Roles allowed to view this route. If the user has a different role they get redirected. */
  allowedRoles: AllowedRole[];
}

/**
 * Wraps authenticated routes.
 * - No session → redirect to /login
 * - Session but wrong role → redirect to correct dashboard
 * - Shows loading spinner while checking
 */
const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, roles, authLoading, profileLoading } = useAuth();
  const navigate = useNavigate();

  const isChecking = authLoading || profileLoading;

  useEffect(() => {
    if (isChecking) return;

    // Not logged in → send to login
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    // Roles loaded but user doesn't have the required role
    if (roles.length > 0) {
      const hasAccess = roles.some((r) => allowedRoles.includes(r as AllowedRole));
      if (!hasAccess) {
        const correctRoute = getRouteForRoles(roles as AllowedRole[]);
        navigate(correctRoute, { replace: true });
      }
    }
  }, [user, roles, isChecking, allowedRoles, navigate]);

  // Show loading while auth/profile are being resolved
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Not logged in (will redirect via useEffect)
  if (!user) return null;

  // Roles not yet loaded — keep showing spinner
  if (roles.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Wrong role (will redirect via useEffect)
  const hasAccess = roles.some((r) => allowedRoles.includes(r as AllowedRole));
  if (!hasAccess) return null;

  return <>{children}</>;
};

export default ProtectedRoute;
