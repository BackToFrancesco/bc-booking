import type { APIRoute } from 'astro';
import { createHash } from 'crypto';

export const POST: APIRoute = async ({ request, cookies }) => {
  const { password } = await request.json();
  const hashed = createHash('sha256').update(password).digest('hex');
  const expected = createHash('sha256').update(import.meta.env.ADMIN_PASSWORD).digest('hex');

  if (hashed !== expected) {
    return new Response(JSON.stringify({ error: 'Password errata' }), { status: 401 });
  }

  cookies.set('admin_session', expected, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 giorni
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
