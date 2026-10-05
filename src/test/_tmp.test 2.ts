import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetDb, insertBooking, insertBlock, countBookings, sql } from './db';
import { call, freezeTime, slot, WED } from './helpers';
import * as email from '../lib/email';

vi.mock('../lib/db', async () => ({ default: (await import('./db')).sql }));
vi.mock('../lib/email', () => ({
  sendAdminNewBooking: vi.fn(async () => {}), sendUserBookingReceived: vi.fn(async () => {}),
  sendUserApproved: vi.fn(async () => {}), sendUserConfirmed: vi.fn(async () => {}),
  sendUserRejected: vi.fn(async () => {}), sendUserRescheduled: vi.fn(async () => {}),
}));
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }));

const { POST: createBooking } = await import('../pages/api/bookings/index');

const person = { name: 'Giulia Bianchi', email: 'giulia@example.com', phone: '+393471234567' };
const book = (s: { slot_start: string; slot_end: string }, extra: Record<string, unknown> = {}) =>
  call(createBooking, { body: { ...person, ...s, ...extra } });

beforeEach(async () => {
  freezeTime();
  vi.clearAllMocks();
  await resetDb();
});
afterEach(() => vi.useRealTimers());

describe('POST /api/bookings — prenotazione valida', () => {
  it('crea la prenotazione in attesa e avvisa admin e cliente', async () => {
    const res = await book(slot(WED, 18, 0, 60));
    expect(res.status).toBe(201);
    expect(await countBookings()).toBe(1);
    const [row] = await sql`SELECT status, slot_start FROM bookings`;
    expect(row.status).toBe('pending');
    expect(new Date(row.slot_start).toISOString()).toBe(slot(WED, 18).slot_start);
    expect(email.sendAdminNewBooking).toHaveBeenCalledOnce();
    expect(email.sendUserBookingReceived).toHaveBeenCalledOnce();
  });

  it('accetta l\'ultimo slot fino alla chiusura (22:30–23:00)', async () => {
    expect((await book(slot(WED, 22, 30, 30))).status).toBe(201);
  });

  it('accetta il primo slot all\'apertura nel weekend (domenica 16:00)', async () => {
    expect((await book(slot('2026-10-11', 16, 0, 60))).status).toBe(201);
  });
});

describe('POST /api/bookings — orari e validazione', () => {
  it.each([
    ['prima dell\'apertura (17:30 di mercoledì)', slot(WED, 17, 30, 60)],
    ['oltre la chiusura (22:30–23:30)', slot(WED, 22, 30, 60)],
    ['a cavallo della mezzanotte', slot(WED, 23, 30, 60)],
    ['non allineata ai 30 minuti (18:15)', slot(WED, 18, 15, 60)],
    ['durata non multipla di 30 minuti (45 min)', slot(WED, 18, 0, 45)],
    ['nel passato', slot('2026-10-02', 18, 0, 60)],
    ['oltre l\'orizzonte di prenotazione', slot('2027-03-01', 18, 0, 60)],
  ])('rifiuta: %s', async (_label, s) => {
    const res = await book(s);
    expect(res.status).toBe(400);
    expect(await countBookings()).toBe(0);
  });

  it('rifiuta fine prima dell\'inizio', async () => {
    const s = slot(WED, 19);
    expect((await book({ slot_start: s.slot_end, slot_end: s.slot_start })).status).toBe(400);
  });

  it.each([
    ['nome mancante', { name: '' }],
    ['email non valida', { email: 'non-una-email' }],
    ['telefono mancante', { phone: '' }],
  ])('rifiuta dati cliente: %s', async (_label, extra) => {
    expect((await book(slot(WED, 18), extra)).status).toBe(400);
  });

  it('rifiuta JSON non valido', async () => {
    expect((await call(createBooking, { body: '{rotto' })).status).toBe(400);
  });

  it('rispetta gli orari modificati dall\'admin', async () => {
    await sql`UPDATE day_schedules SET open_hour = 20 WHERE day_of_week = 3`;
    expect((await book(slot(WED, 19))).status).toBe(400);
    expect((await book(slot(WED, 20))).status).toBe(201);
  });

  it('rifiuta un giorno senza orari configurati', async () => {
    await sql`DELETE FROM day_schedules WHERE day_of_week = 3`;
    expect((await book(slot(WED, 18))).status).toBe(400);
  });
});

describe('POST /api/bookings — cambio ora legale/solare (25 ottobre 2026)', () => {
  const DST_DAY = '2026-10-25'; // domenica, UTC+1 da quel giorno

  it('accetta le 16:00 ora di Roma (15:00 UTC)', async () => {
    const s = slot(DST_DAY, 16, 0, 60);
    expect(s.slot_start).toBe('2026-10-25T15:00:00.000Z');
    expect((await book(s)).status).toBe(201);
  });

  it('rifiuta le 15:00 ora di Roma anche se in UTC sarebbero le 14:00 (ex orario estivo)', async () => {
    expect((await book(slot(DST_DAY, 15, 0, 60))).status).toBe(400);
  });

  it('il giorno prima (ora legale) le 16:00 di sabato sono le 14:00 UTC', async () => {
    const s = slot('2026-10-24', 16, 0, 60);
    expect(s.slot_start).toBe('2026-10-24T14:00:00.000Z');
    expect((await book(s)).status).toBe(201);
  });
});

describe('POST /api/bookings — conflitti con altre prenotazioni', () => {
  it.each(['pending', 'approved', 'confirmed'])('rifiuta uno slot già preso (stato %s)', async (status) => {
    await insertBooking(slot(WED, 19, 0, 60), status);
    expect((await book(slot(WED, 19, 0, 60))).status).toBe(409);
  });

  it('rifiuta una sovrapposizione parziale (18:30–19:30 contro 19:00–20:00)', async () => {
    await insertBooking(slot(WED, 19, 0, 60));
    expect((await book(slot(WED, 18, 30, 60))).status).toBe(409);
  });

  it('rifiuta una prenotazione che ne contiene un\'altra', async () => {
    await insertBooking(slot(WED, 19, 0, 30));
    expect((await book(slot(WED, 18, 0, 180))).status).toBe(409);
  });

  it('accetta una prenotazione adiacente (finisce quando l\'altra inizia)', async () => {
    await insertBooking(slot(WED, 19, 0, 60));
    expect((await book(slot(WED, 18, 0, 60))).status).toBe(201);
    expect((await book(slot(WED, 20, 0, 60))).status).toBe(201);
  });

  it('una prenotazione rifiutata non occupa lo slot', async () => {
    await insertBooking(slot(WED, 19, 0, 60), 'rejected');
    expect((await book(slot(WED, 19, 0, 60))).status).toBe(201);
  });

  // BUG noto: controllo e inserimento non sono atomici, due richieste simultanee
  // sullo stesso slot passano entrambe. Quando verrà corretto, togliere `.fails`.
  it.only('due prenotazioni simultanee sullo stesso slot: ne passa una sola', async () => {
    const s = slot(WED, 21, 0, 60);
    const results = await Promise.all([book(s), book(s)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await countBookings()).toBe(1);
  });
});

describe('POST /api/bookings — slot bloccati', () => {
  it('rifiuta uno slot bloccato', async () => {
    await insertBlock(slot(WED, 19, 0, 120));
    expect((await book(slot(WED, 19, 0, 60))).status).toBe(409);
  });

  it('rifiuta una prenotazione che tocca parzialmente un blocco', async () => {
    await insertBlock(slot(WED, 19, 0, 60));
    expect((await book(slot(WED, 18, 30, 60))).status).toBe(409);
    expect((await book(slot(WED, 19, 30, 60))).status).toBe(409);
  });

  it('accetta una prenotazione adiacente al blocco', async () => {
    await insertBlock(slot(WED, 19, 0, 60));
    expect((await book(slot(WED, 18, 0, 60))).status).toBe(201);
    expect((await book(slot(WED, 20, 0, 60))).status).toBe(201);
  });

  it('un blocco su tutta la giornata rende impossibile prenotare', async () => {
    await insertBlock(slot(WED, 0, 0, 24 * 60), 'Torneo');
    for (const h of [18, 19, 20, 21, 22]) {
      expect((await book(slot(WED, h, 0, 30))).status).toBe(409);
    }
  });
});
