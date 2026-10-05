import { describe, it, expect, afterEach, vi } from 'vitest';
import { checkAdminPassword, createSessionToken, verifySessionToken } from './admin-auth';

const EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // sha256('')

afterEach(() => vi.unstubAllEnvs());

describe('admin auth', () => {
  it('nega tutto se ADMIN_PASSWORD è vuota o assente', () => {
    for (const value of ['', undefined]) {
      vi.stubEnv('ADMIN_PASSWORD', value as string);
      expect(checkAdminPassword('')).toBe(false);
      expect(verifySessionToken(EMPTY_HASH)).toBe(false);
      expect(() => createSessionToken()).toThrow();
    }
  });

  it('accetta solo la password corretta', () => {
    vi.stubEnv('ADMIN_PASSWORD', 'segreta123');
    expect(checkAdminPassword('segreta123')).toBe(true);
    expect(checkAdminPassword('')).toBe(false);
    expect(checkAdminPassword('segreta')).toBe(false);
  });

  it('il vecchio cookie sha256(password) non è più valido', async () => {
    vi.stubEnv('ADMIN_PASSWORD', 'segreta123');
    const { createHash } = await import('crypto');
    expect(verifySessionToken(createHash('sha256').update('segreta123').digest('hex'))).toBe(false);
  });

  it('token valido, manomesso, scaduto, o dopo cambio password', () => {
    vi.stubEnv('ADMIN_PASSWORD', 'segreta123');
    const now = Date.now();
    const token = createSessionToken(now);
    expect(verifySessionToken(token, now)).toBe(true);

    const [exp, sig] = token.split('.');
    expect(verifySessionToken(`${Number(exp) + 999999}.${sig}`, now)).toBe(false);
    expect(verifySessionToken(token, now + 8 * 24 * 3600 * 1000)).toBe(false);

    vi.stubEnv('ADMIN_PASSWORD', 'nuova-password');
    expect(verifySessionToken(token, now)).toBe(false);
  });
});
