/**
 * The canonical production domain for auth redirects.
 * Falls back to window.location.origin in dev/preview environments.
 */
export const SITE_URL =
  import.meta.env.PROD
    ? 'https://drivveme.com'
    : window.location.origin;
