import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetDb, insertBooking, insertBlock, sql } from './db';
import { call, freezeTime, slot, WED } from './helpers';

vi.mock('../lib/db', async () => ({ default: (await import('./db')).sql }));
vi.mock('../lib/email', () => ({
  sendAdminNewBooking: vi.fn(async () => {}), sendUserBookingReceived: vi.fn(async () => {}),
  sendUserApproved: vi.fn(async () => {}), sendUserConfirmed: vi.fn(async () => {}),
  sendUserRejected: vi.fn(async () => {}), sendUserRescheduled: vi.fn(async () => {}),
}));
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }));

const { POST: createBlock } = await import('../pages/api/admin/blocked-slots/index');
const { DELETE: deleteBlock } = await import('../pages/api/admin/blocked-slots/[id]');
const { POST: createBooking } = await import('../pages/api/bookings/index');
const { GET: getSlots } = await import('../pages/api/slots');
const { GET: getCalendarEvents } = await import('../pages/api/admin/calendar-events');
const { PUT: putSchedule } = await import('../pages/api/admin/schedule');

const person = { name: 'Giulia Bianchi', email: 'giulia@example.com', phone: '+393471234567' };
const book = (s: object) => call(createBooking, { body: { ...person, ...s } });
const get = (route: typeof getSlots, from: string, to: string) =>
  call(route, { method: 'GET', url: `http://localhost/api?from=${from}&to=${to}` });

beforeEach(async () => {
  freezeTime();
  await resetDb();
});
afterEach(() => vi.useRealTimers());

describe('Blocchi', () => {
  it('creare un blocco impedisce di prenotare quello slot', async () => {
    const res = await call(createBlock, { body: { ...slot(WED, 19, 0, 120), reason: 'Torneo' } });
    expect(res.status).toBe(201);
    expect((await book(slot(WED, 20))).status).toBe(409);
    expect((await book(slot(WED, 18))).status).toBe(201);
  });

  it('eliminare il blocco rende di nuovo prenotabile lo slot', async () => {
    const id = await insertBlock(slot(WED, 19));
    expect((await book(slot(WED, 19))).status).toBe(409);
    expect((await call(deleteBlock, { method: 'DELETE', params: { id } })).status).toBe(200);
    expect((await book(slot(WED, 19))).status).toBe(201);
  });

  it.each([
    ['fine prima dell\'inizio', { slot_start: slot(WED, 19).slot_end, slot_end: slot(WED, 19).slot_start }],
    ['date mancanti', { slot_start: slot(WED, 19).slot_start }],
    ['date non valide', { slot_start: 'x', slot_end: 'y' }],
  ])('rifiuta un blocco con %s', async (_label, body) => {
    expect((await call(createBlock, { body })).status).toBe(400);
  });

  it('non si può bloccare uno slot con una prenotazione attiva', async () => {
    await insertBooking(slot(WED, 19), 'confirmed');
    expect((await call(createBlock, { body: slot(WED, 18, 0, 180) })).status).toBe(409);
  });

  it('si può bloccare sopra una prenotazione rifiutata', async () => {
    await insertBooking(slot(WED, 19), 'rejected');
    expect((await call(createBlock, { body: slot(WED, 19) })).status).toBe(201);
  });

  it('i blocchi compaiono nella disponibilità pubblica e nel calendario admin', async () => {
    await insertBlock(slot(WED, 19), 'Torneo');
    const pub = await get(getSlots, '2026-10-05', '2026-10-12');
    expect(pub.body.blocked).toHaveLength(1);
    const admin = await get(getCalendarEvents, '2026-10-05', '2026-10-12');
    expect(admin.body).toEqual([expect.objectContaining({ title: 'Torneo', start: slot(WED, 19).slot_start })]);
  });
});

describe('Disponibilità (GET /api/slots)', () => {
  it('mostra prenotazioni attive, nasconde quelle rifiutate e non espone dati personali', async () => {
    await insertBooking(slot(WED, 18), 'pending');
    await insertBooking(slot(WED, 20), 'rejected');
    const res = await get(getSlots, '2026-10-05', '2026-10-12');
    expect(res.status).toBe(200);
    expect(res.body.bookings).toHaveLength(1);
    expect(res.body.schedule).toHaveLength(7);
    const json = JSON.stringify(res.body);
    expect(json).not.toContain('mario@example.com');
    expect(json).not.toContain('Mario Rossi');
  });

  it('include le prenotazioni dell\'ultimo giorno richiesto (to è inclusivo)', async () => {
    await insertBooking(slot('2026-10-12', 22, 30, 30));
    expect((await get(getSlots, '2026-10-05', '2026-10-12')).body.bookings).toHaveLength(1);
  });

  it.each([
    ['parametri mancanti', 'http://localhost/api/slots?from=2026-10-05'],
    ['date non valide', 'http://localhost/api/slots?from=boh&to=mah'],
    ['intervallo oltre 180 giorni', 'http://localhost/api/slots?from=2026-01-01&to=2027-01-01'],
  ])('400 con %s', async (_label, url) => {
    expect((await call(getSlots, { method: 'GET', url })).status).toBe(400);
  });
});

describe('Orari settimanali (PUT /api/admin/schedule)', () => {
  const week = (overrides: Record<number, [number, number]> = {}) => ({
    schedules: Array.from({ length: 7 }, (_, d) => {
      const [open_hour, close_hour] = overrides[d] ?? (d === 0 || d === 6 ? [16, 23] : [18, 23]);
      return { day_of_week: d, open_hour, close_hour };
    }),
  });

  it('salva i nuovi orari e le prenotazioni li rispettano', async () => {
    expect((await call(putSchedule, { method: 'PUT', body: week({ 3: [10, 14] }) })).status).toBe(200);
    const [row] = await sql`SELECT open_hour, close_hour FROM day_schedules WHERE day_of_week = 3`;
    expect(row).toEqual({ open_hour: 10, close_hour: 14 });
    expect((await book(slot(WED, 12))).status).toBe(201);
    expect((await book(slot(WED, 18))).status).toBe(400);
  });

  it.each([
    ['apertura dopo la chiusura', week({ 2: [20, 18] })],
    ['apertura uguale alla chiusura', week({ 2: [18, 18] })],
    ['ora fuori range', week({ 2: [18, 24] })],
    ['meno di 7 giorni', { schedules: week().schedules.slice(0, 6) }],
  ])('rifiuta: %s', async (_label, body) => {
    expect((await call(putSchedule, { method: 'PUT', body })).status).toBe(400);
    const [row] = await sql`SELECT open_hour FROM day_schedules WHERE day_of_week = 2`;
    expect(row.open_hour).toBe(18); // niente salvato
  });
});
