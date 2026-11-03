/**
 * Admin access: a single shared secret (ADMIN_TOKEN). If it is not set the admin area does not exist.
 * The session cookie is an HMAC of a constant under that secret, so nothing is stored server-side,
 * and changing the token logs everyone out.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { APIContext } from 'astro';
import { getDb, t } from './db';

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

/**
 * Who is calling, for rate limiting. Astro.clientAddress is the socket address and cannot be spoofed, so it
 * is preferred. The Vercel adapter does not implement it; there the platform sets x-real-ip and overwrites
 * x-forwarded-for, so those headers are trustworthy.
 */
export function clientKey(ctx: { clientAddress: string; request: Request }): string {
  try {
    return ctx.clientAddress || 'unknown';
  } catch {
    const h = ctx.request.headers;
    return h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  }
}

/**
 * Login throttle: 10 attempts per 10 minutes per client address, counted in the database so it holds
 * across serverless instances. Returns true when the client should be refused.
 */
export async function throttled(clientKey: string): Promise<boolean> {
  const db = await getDb();
  const key = clientKey.slice(0, 64);
  await db.delete(t.loginAttempts).where(sql`${t.loginAttempts.at} < now() - interval '1 hour'`);
  await db.insert(t.loginAttempts).values({ clientKey: key });
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.loginAttempts)
    .where(and(eq(t.loginAttempts.clientKey, key), sql`${t.loginAttempts.at} > now() - interval '10 minutes'`));
  return n > 10;
}
