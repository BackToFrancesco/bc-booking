import { defineMiddleware } from 'astro:middleware';
import { SESSION_COOKIE, verifySessionToken } from './lib/admin-auth';

const PROTECTED = ['/admin', '/api/admin'];

export const onRequest = defineMiddleware(({ url, cookies, redirect }, next) => {
  const isProtected = PROTECTED.some((p) => url.pathname === p || url.pathname.startsWith(p + '/'));
  const isLoginRoute = url.pathname === '/api/admin/login' || url.pathname === '/admin-login';

  if (!isProtected || isLoginRoute) return next();

  if (!verifySessionToken(cookies.get(SESSION_COOKIE)?.value)) {
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401 });
    }
    return redirect('/admin-login');
  }

  return next();
});
