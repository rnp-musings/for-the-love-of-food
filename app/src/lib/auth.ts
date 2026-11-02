/**
 * Admin access: a single shared secret (ADMIN_TOKEN). If it is not set the admin area does not exist.
 * The session cookie is an HMAC of a constant under that secret, so nothing is stored server-side,
 * and changing the token logs everyone out.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { APIContext } from 'astro';

export const COOKIE = 'ftlof_admin';
const token = () => process.env.ADMIN_TOKEN ?? '';

export const adminEnabled = () => token().length >= 12;

const sign = () => createHmac('sha256', token()).update('ftlof-admin-session-v1').digest('hex');

function safeEqual(a: string, b: string) {
  const ha = createHmac('sha256', 'cmp').update(a).digest();
  const hb = createHmac('sha256', 'cmp').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export const checkToken = (given: string) => adminEnabled() && safeEqual(given, token());
export const isAdmin = (cookies: APIContext['cookies']) => {
  const v = cookies.get(COOKIE)?.value;
  return adminEnabled() && !!v && safeEqual(v, sign());
};
export const startSession = (cookies: APIContext['cookies']) =>
  cookies.set(COOKIE, sign(), { httpOnly: true, sameSite: 'strict', secure: import.meta.env.PROD && process.env.INSECURE_COOKIES !== '1', path: '/', maxAge: 60 * 60 * 8 });
export const endSession = (cookies: APIContext['cookies']) => cookies.delete(COOKIE, { path: '/' });

// Very small in-memory throttle for login attempts: 10 per 10 minutes per client address.
const attempts = new Map<string, number[]>();
export function throttled(key: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < 600_000);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > 10;
}
