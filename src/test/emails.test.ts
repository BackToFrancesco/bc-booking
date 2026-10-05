import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitUntil } from '@vercel/functions';
import { resetDb, insertBooking } from './db';
import { call, freezeTime, slot, WED } from './helpers';

// Modulo email VERO: intercettiamo solo l'invio Gmail per leggere le email prodotte.
const sent: { from: string; to: string; subject: string; text: string; html: string }[] = [];
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: async (mail: any) => void sent.push(mail) }) },
}));
vi.mock('../lib/db', async () => ({ default: (await import('./db')).sql }));
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }));

const email = await import('../lib/email');
const { POST: createBooking } = await import('../pages/api/bookings/index');
const { POST: approve } = await import('../pages/api/admin/bookings/[id]/approve');
const { PATCH: patchBooking } = await import('../pages/api/admin/bookings/[id]');

const ID = '3f2a9c1e-1111-2222-3333-444455556666';
const customer = { id: ID, name: 'Giulia Bianchi', email: 'giulia@example.com', phone: '+393471234567' };
/** mercoledì 7 ottobre 2026, 18:00–19:30 ora di Roma (16:00–17:30 UTC, 17:00–18:30 in Irlanda) */
const S = slot(WED, 18, 0, 90);

/** Aspetta le email mandate in background con waitUntil. */
async function flush() {
  await Promise.all(vi.mocked(waitUntil).mock.calls.map(([p]) => p));
}
const last = () => sent.at(-1)!;
const both = (m: { text: string; html: string }) => [m.text, m.html];

beforeEach(async () => {
  sent.length = 0;
  vi.clearAllMocks();
  vi.stubEnv('GMAIL_USER', 'prenotazioni@basketconselve.com');
  vi.stubEnv('ADMIN_EMAIL', 'admin@basketconselve.com');
  vi.stubEnv('BOOKING_PRICE', '10');
  vi.stubEnv('PAYPAL_ME_HANDLE', 'basketconselve');
  freezeTime();
  await resetDb();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('Orari nelle email: sempre ora di Roma', () => {
  it.each([
    ['sendUserBookingReceived', () => email.sendUserBookingReceived({ ...customer, ...S })],
    ['sendAdminNewBooking', () => email.sendAdminNewBooking({ ...customer, ...S })],
    ['sendUserApproved', () => email.sendUserApproved({ ...customer, ...S })],
    ['sendUserConfirmed', () => email.sendUserConfirmed({ ...customer, ...S })],
    ['sendUserRejected', () => email.sendUserRejected({ ...customer, ...S })],
  ])('%s mostra 18:00–19:30 di mercoledì 7 ottobre', async (_name, send) => {
    await send();
    for (const body of both(last())) {
      expect(body).toMatch(/mercoledì 0?7 ottobre 2026/);
      expect(body).toContain('18:00');
      expect(body).toContain('19:30');
      expect(body).not.toContain('17:00'); // ora irlandese/UTC
      expect(body).not.toContain('16:00');
    }
    expect(last().subject).toMatch(/^BC Beach Volley — .* — mercoledì 0?7 ottobre 2026$/);
  });

  it('il giorno del cambio ora (25 ottobre) le 16:00 restano 16:00', async () => {
    await email.sendUserConfirmed({ ...customer, ...slot('2026-10-25', 16, 0, 60) });
    expect(last().text).toMatch(/domenica 25 ottobre 2026.*16:00 – 17:00/);
  });

  it('un orario a cavallo della mezzanotte UTC resta sul giorno giusto', async () => {
    // 22:30–23:00 a Roma in estate = 20:30–21:00 UTC; in inverno = 21:30–22:00 UTC
    await email.sendUserBookingReceived({ ...customer, ...slot('2026-12-15', 22, 30, 30) });
    expect(last().text).toMatch(/martedì 15 dicembre 2026.*22:30 – 23:00/);
  });
});

describe('Contenuto delle singole email', () => {
  it('richiesta ricevuta: al cliente, totale, codice, in attesa', async () => {
    await email.sendUserBookingReceived({ ...customer, ...S });
    const m = last();
    expect(m.to).toBe('giulia@example.com');
    expect(m.from).toBe('"Basket Conselve" <prenotazioni@basketconselve.com>');
    expect(m.subject).toContain('Richiesta ricevuta');
    for (const b of both(m)) {
      expect(b).toContain('Giulia Bianchi');
      expect(b).toContain('€30'); // 3 slot × €10
      expect(b).toContain('3f2a9c1e');
      expect(b).toContain('wa.me/393423022007');
    }
  });

  it('nuova prenotazione: all\'admin, con contatti cliente, durata, totale e link admin', async () => {
    await email.sendAdminNewBooking({ ...customer, ...S });
    const m = last();
    expect(m.to).toBe('admin@basketconselve.com');
    expect(m.subject).toContain('Nuova prenotazione — Giulia Bianchi');
    for (const b of both(m)) {
      expect(b).toContain('giulia@example.com');
      expect(b).toContain('+393471234567');
      expect(b).toContain('90 min');
      expect(b).toContain('€30');
      expect(b).toContain('/admin');
      expect(b).toContain(ID);
    }
  });

  it('telefono mancante → "Non fornito"', async () => {
    await email.sendAdminNewBooking({ ...customer, phone: undefined, ...S });
    expect(last().text).toContain('Telefono: Non fornito');
  });

  it('approvata: link PayPal, importo, causale con codice', async () => {
    await email.sendUserApproved({ ...customer, ...S });
    const m = last();
    expect(m.to).toBe('giulia@example.com');
    for (const b of both(m)) {
      expect(b).toContain('https://www.paypal.me/basketconselve');
      expect(b).toContain('€30');
      expect(b).toContain('€10 / 30 min');
      expect(b).toContain('3f2a9c1e');
    }
  });

  it('approvata senza PAYPAL_ME_HANDLE: errore invece di un link PayPal rotto', async () => {
    vi.stubEnv('PAYPAL_ME_HANDLE', '');
    await expect(email.sendUserApproved({ ...customer, ...S })).rejects.toThrow('PAYPAL_ME_HANDLE');
    expect(sent).toHaveLength(0);
  });

  it('il prezzo segue BOOKING_PRICE', async () => {
    vi.stubEnv('BOOKING_PRICE', '12');
    await email.sendUserApproved({ ...customer, ...S });
    expect(last().text).toContain('€36 (€12 / 30 min)');
  });

  it('confermata: informazioni sul campo', async () => {
    await email.sendUserConfirmed({ ...customer, ...S });
    expect(last().subject).toContain('Pagamento confermato');
    expect(last().text).toContain('Il pallone non è fornito');
  });

  it('orario aggiornato: vecchio e nuovo orario', async () => {
    const old = slot(WED, 18, 0, 60);
    const now = slot('2026-10-08', 20, 30, 60);
    await email.sendUserRescheduled({ ...customer, ...now, old_slot_start: old.slot_start, old_slot_end: old.slot_end });
    const m = last();
    expect(m.text).toMatch(/Vecchio orario: mercoledì 0?7 ottobre 2026.*18:00 – 19:00/);
    expect(m.text).toMatch(/Nuovo orario:\s+giovedì 0?8 ottobre 2026.*20:30 – 21:30/);
    expect(m.html).toMatch(/<s>mercoledì 0?7 ottobre 2026.*18:00 – 19:00<\/s>/);
  });

  it('rifiutata: invito a riprenotare', async () => {
    await email.sendUserRejected({ ...customer, ...S });
    expect(last().text).toContain('Puoi effettuare una nuova prenotazione');
  });
});

describe('Dati del cliente nell\'HTML', () => {
  const evil = { ...customer, name: '<a href="https://truffa.example">Clicca qui</a> & <img src=x>', email: 'x"><script>@example.com' };

  it.each([
    ['sendAdminNewBooking', () => email.sendAdminNewBooking({ ...evil, ...S })],
    ['sendUserBookingReceived', () => email.sendUserBookingReceived({ ...evil, ...S })],
    ['sendUserApproved', () => email.sendUserApproved({ ...evil, ...S })],
    ['sendUserConfirmed', () => email.sendUserConfirmed({ ...evil, ...S })],
    ['sendUserRejected', () => email.sendUserRejected({ ...evil, ...S })],
    ['sendUserRescheduled', () => email.sendUserRescheduled({ ...evil, ...S, old_slot_start: S.slot_start, old_slot_end: S.slot_end })],
  ])('%s non permette di inserire link o tag', async (_name, send) => {
    await send();
    const { html } = last();
    expect(html).not.toContain('truffa.example">');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;a href=&quot;https://truffa.example&quot;&gt;Clicca qui&lt;/a&gt; &amp; &lt;img src=x&gt;');
  });
});

describe('Email inviate dal flusso reale (API + database)', () => {
  it('prenotazione → conferma al cliente e avviso all\'admin, con orari di Roma', async () => {
    const res = await call(createBooking, { body: { name: 'Luca Verdi', email: 'luca@example.com', phone: '+393331111111', ...S } });
    expect(res.status).toBe(201);
    await flush();
    expect(sent.map((m) => m.to).sort()).toEqual(['admin@basketconselve.com', 'luca@example.com']);
    for (const m of sent) expect(m.text).toContain('18:00 – 19:30');
  });

  it('approvazione da admin (date lette dal database) → email PayPal con orario di Roma', async () => {
    const id = await insertBooking(S, 'pending', 'Luca Verdi');
    expect((await call(approve, { params: { id } })).status).toBe(200);
    await flush();
    expect(sent).toHaveLength(1);
    expect(last().text).toContain('18:00 – 19:30');
    expect(last().text).toContain(id.slice(0, 8));
  });

  it('spostamento da admin → email con vecchio e nuovo orario', async () => {
    const id = await insertBooking(S, 'approved', 'Luca Verdi');
    const to = slot(WED, 21, 0, 90);
    expect((await call(patchBooking, { method: 'PATCH', params: { id }, body: to })).status).toBe(200);
    await flush();
    expect(last().text).toMatch(/Vecchio orario: .*18:00 – 19:30/);
    expect(last().text).toMatch(/Nuovo orario: .*21:00 – 22:30/);
  });

  it('un errore Gmail non fa fallire la prenotazione', async () => {
    const nodemailer = (await import('nodemailer')).default as any;
    const spy = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail: async () => { throw new Error('SMTP giù'); } });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call(createBooking, { body: { name: 'Luca Verdi', email: 'luca@example.com', phone: '+393331111111', ...S } });
    expect(res.status).toBe(201);
    await flush();
    expect(errors).toHaveBeenCalled();
    spy.mockRestore();
    errors.mockRestore();
  });
});
