import { createHash, createHmac, timingSafeEqual } from 'crypto';

export const SESSION_COOKIE = 'admin_session';
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 7; // 7 giorni

/** Password admin configurata, o null se manca/vuota: in quel caso l'accesso admin è sempre negato. */
function adminPassword(): string | null {
  const pw = import.meta.env.ADMIN_PASSWORD;
  return typeof pw === 'string' && pw.length > 0 ? pw : null;
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

function sign(payload: string, pw: string): string {
  return createHmac('sha256', `admin-session:${pw}`).update(payload).digest('base64url');
}

export function checkAdminPassword(input: string): boolean {
  const pw = adminPassword();
  if (!pw || !input) return false;
  return safeEqual(input, pw);
}

/** Token di sessione firmato con scadenza: `<exp>.<hmac>`. Cambiare la password invalida tutte le sessioni. */
export function createSessionToken(now = Date.now()): string {
  const pw = adminPassword();
  if (!pw) throw new Error('ADMIN_PASSWORD non configurata');
  const exp = String(Math.floor(now / 1000) + SESSION_MAX_AGE_S);
  return `${exp}.${sign(exp, pw)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  const pw = adminPassword();
  if (!pw || !token) return false;
  const [exp, sig, ...rest] = token.split('.');
  if (!exp || !sig || rest.length > 0 || !/^\d+$/.test(exp)) return false;
  if (Number(exp) * 1000 <= now) return false;
  return safeEqual(sig, sign(exp, pw));
}
