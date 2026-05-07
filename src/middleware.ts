import { defineMiddleware } from 'astro:middleware';
import { createHash } from 'crypto';

const PROTECTED = ['/admin', '/api/admin'];

export const onRequest = defineMiddleware(({ url, cookies, redirect }, next) => {
  const isProtected = PROTECTED.some((p) => url.pathname === p || url.pathname.startsWith(p + '/'));
  const isLoginRoute = url.pathname === '/api/admin/login' || url.pathname === '/admin-login';

  if (!isProtected || isLoginRoute) return next();

  const session = cookies.get('admin_session')?.value;
  const expected = createHash('sha256').update(import.meta.env.ADMIN_PASSWORD ?? '').digest('hex');

  if (session !== expected) {
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401 });
    }
    return redirect('/admin-login');
  }

  return next();
});
