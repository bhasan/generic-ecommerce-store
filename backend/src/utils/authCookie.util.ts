import { CookieOptions } from 'express';

/**
 * Name of the httpOnly refresh-token cookie.
 *
 * The cookie is scoped to `/api/auth` so the browser only attaches it to the
 * refresh/logout endpoints — it never rides along on regular API traffic,
 * shrinking both its exposure surface and CSRF relevance.
 */
export const REFRESH_COOKIE = 'refreshToken';

const REFRESH_COOKIE_PATH = '/api/auth';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches the DB TTL

/**
 * Options for setting the refresh cookie. `sameSite: 'lax'` is safe because the
 * app is served same-origin in every environment (dev = Vite proxy, prod =
 * nginx serving `/` and `/api` on one domain), which blocks the cross-site CSRF
 * vector without a separate CSRF token. `secure` is enabled in production (HTTPS).
 * Host-only (no `Domain`) so it cannot leak to sibling subdomains.
 */
export const refreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: REFRESH_COOKIE_PATH,
  maxAge: REFRESH_COOKIE_MAX_AGE_MS,
});

/** Options for clearing the refresh cookie — path must match the one it was set with. */
export const clearRefreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: REFRESH_COOKIE_PATH,
});
