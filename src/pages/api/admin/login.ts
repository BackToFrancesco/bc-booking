import type { APIRoute } from 'astro';
import { checkAdminPassword, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_S } from '../../../lib/admin-auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  let password = '';
  try {
    const body = await request.json();
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    return new Response(JSON.stringify({ error: 'JSON non valido' }), { status: 400 });
  }

  if (!checkAdminPassword(password)) {
    return new Response(JSON.stringify({ error: 'Password errata' }), { status: 401 });
  }

  cookies.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE_S,
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
