type UserRole = 'rider' | 'driver' | 'admin';

/**
 * Returns the correct route path for a given set of roles.
 * Priority: admin > driver > rider > fallback
 */
export function getRouteForRoles(roles: UserRole[]): string {
  if (roles.includes('admin')) return '/admin';
  if (roles.includes('driver')) return '/driver';
  if (roles.includes('rider')) return '/rider-home';
  return '/landing';
}

/** Auth-only pages that should redirect away when a session exists */
export const AUTH_PAGES = ['/', '/landing', '/login', '/signup'];

/** Check if user is already on their correct destination */
export function isOnCorrectRoute(currentPath: string, roles: UserRole[]): boolean {
  const target = getRouteForRoles(roles);
  return currentPath === target;
}
