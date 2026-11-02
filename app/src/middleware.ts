import { defineMiddleware } from 'astro:middleware';
import { isAdmin } from './lib/auth';

export const onRequest = defineMiddleware(async (ctx, next) => {
  const path = ctx.url.pathname;
  // Postgres cannot store NUL bytes in text; refuse them everywhere instead of failing deep in a query.
  if (/%00|\u0000/i.test(ctx.request.url)) return new Response('Bad request', { status: 400 });
  const isAdminPath = path === '/admin' || path.startsWith('/admin/');
  // Every response, including the sign-in redirect, goes through the header code below.
  const blocked = isAdminPath && path !== '/admin/login' && !isAdmin(ctx.cookies);
  const res = blocked ? ctx.redirect('/admin/login') : await next();
  const h = res.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('X-Frame-Options', 'DENY');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isAdminPath) h.set('Cache-Control', 'private, no-store');
  else if (ctx.request.method === 'GET' && !h.has('Cache-Control') && !path.startsWith('/api/')) {
    h.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  }
  return res;
});
