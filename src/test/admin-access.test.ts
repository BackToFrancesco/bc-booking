import { describe, it, expect, vi, afterEach } from 'vitest';
import { call, cookieJar } from './helpers';
import { createSessionToken } from '../lib/admin-auth';

const { onRequest } = await import('../middleware');
const { POST: login } = await import('../pages/api/admin/login');

const EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // sha256('')

async function visit(path: string, cookie?: string) {
  const next = vi.fn(async () => new Response('ok'));
  const res = await (onRequest as any)(
    {
      url: new URL(`http://localhost${path}`),
      cookies: cookieJar(cookie ? { admin_session: cookie } : {}),
      redirect: (to: string) => new Response(null, { status: 302, headers: { location: to } }),
    },
    next,
  );
  return { status: res.status, location: res.headers.get('location'), passed: next.mock.calls.length > 0 };
}

afterEach(() => vi.unstubAllEnvs());

describe('Accesso admin (middleware)', () => {
  it.each(['/admin', '/api/admin/schedule', '/api/admin/bookings/123/approve', '/api/admin/blocked-slots'])(
    'blocca %s senza login', async (path) => {
      vi.stubEnv('ADMIN_PASSWORD', 'segreta123');
      const r = await visit(path);
      expect(r.passed).toBe(false);
      expect(path.startsWith('/api/') ? r.status : r.location).toBe(path.startsWith('/api/') ? 401 : '/admin-login');
    },
  );

  it('lascia passare le pagine pubbliche e il login', async () => {
    vi.stubEnv('ADMIN_PASSWORD', 'segreta123');
    for (const p of ['/', '/api/slots', '/api/bookings', '/admin-login', '/api/admin/login']) {
      expect((await visit(p)).passed).toBe(true);
    }
  });

  it('non si lascia ingannare da percorsi simili (/administrator, /api/admin-x)', async () => {
    vi.stubEnv('ADMIN_PASSWORD', 'segreta123');
    expect((await visit('/administrator')).passed).toBe(true);
    expect((await visit('/api/admin/../admin/schedule')).passed).toBe(false);
  });

  it('con ADMIN_PASSWORD vuota nessuno entra, nemmeno col cookie sha256("")', async () => {
    vi.stubEnv('ADMIN_PASSWORD', '');
    expect((await visit('/api/admin/schedule', EMPTY_HASH)).passed).toBe(false);
    expect((await call(login, { body: { password: '' } })).status).toBe(401);
  });

  it('login corretto → cookie → accesso; password sbagliata → 401 e nessun cookie', async () => {
    vi.stubEnv('ADMIN_PASSWORD', 'segreta123');
    const bad = cookieJar();
    expect((await call(login, { body: { password: 'sbagliata' }, cookies: bad })).status).toBe(401);
    expect(bad.set).not.toHaveBeenCalled();

    const good = cookieJar();
    expect((await call(login, { body: { password: 'segreta123' }, cookies: good })).status).toBe(200);
    const token = good.jar.get('admin_session')!;
    expect((await visit('/api/admin/schedule', token)).passed).toBe(true);
    expect((await visit('/admin', token)).passed).toBe(true);
  });

  it('un token falsificato o scaduto non entra', async () => {
    vi.stubEnv('ADMIN_PASSWORD', 'segreta123');
    const [exp, sig] = createSessionToken().split('.');
    expect((await visit('/admin', `${Number(exp) + 1000}.${sig}`)).passed).toBe(false);
    expect((await visit('/admin', createSessionToken(Date.now() - 8 * 24 * 3600 * 1000))).passed).toBe(false);
  });
});
