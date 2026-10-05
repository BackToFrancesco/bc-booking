import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetDb, insertBooking, insertBlock, getBooking } from './db';
import { call, freezeTime, slot, WED } from './helpers';
import * as email from '../lib/email';

vi.mock('../lib/db', async () => ({ default: (await import('./db')).sql }));
vi.mock('../lib/email', () => ({
  sendAdminNewBooking: vi.fn(async () => {}), sendUserBookingReceived: vi.fn(async () => {}),
  sendUserApproved: vi.fn(async () => {}), sendUserConfirmed: vi.fn(async () => {}),
  sendUserRejected: vi.fn(async () => {}), sendUserRescheduled: vi.fn(async () => {}),
}));
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }));

const { PATCH: patchBooking, DELETE: deleteBooking } = await import('../pages/api/admin/bookings/[id]');
const { POST: approve } = await import('../pages/api/admin/bookings/[id]/approve');
const { POST: reject } = await import('../pages/api/admin/bookings/[id]/reject');
const { POST: confirmPayment } = await import('../pages/api/admin/bookings/[id]/confirm-payment');
const { POST: createBooking } = await import('../pages/api/bookings/index');

const patch = (id: string, body: unknown) => call(patchBooking, { method: 'PATCH', params: { id }, body });
const MISSING_ID = '00000000-0000-0000-0000-000000000000';

beforeEach(async () => {
  freezeTime();
  vi.clearAllMocks();
  await resetDb();
});
afterEach(() => vi.useRealTimers());

describe('PATCH /api/admin/bookings/:id — spostamento orario', () => {
  it('sposta in uno slot libero, salva e avvisa il cliente con vecchio e nuovo orario', async () => {
    const id = await insertBooking(slot(WED, 18), 'approved');
    const to = slot(WED, 20);
    const res = await patch(id, to);
    expect(res.status).toBe(200);

    const b = await getBooking(id);
    expect(new Date(b!.slot_start).toISOString()).toBe(to.slot_start);
    expect(new Date(b!.slot_end).toISOString()).toBe(to.slot_end);
    expect(b!.status).toBe('approved');
    expect(email.sendUserRescheduled).toHaveBeenCalledWith(expect.objectContaining({
      slot_start: to.slot_start,
      old_slot_start: slot(WED, 18).slot_start,
    }));
  });

  it('con notify=false non manda email', async () => {
    const id = await insertBooking(slot(WED, 18));
    expect((await patch(id, { ...slot(WED, 20), notify: false })).status).toBe(200);
    expect(email.sendUserRescheduled).not.toHaveBeenCalled();
  });

  it('può sovrapporsi al proprio orario originale (spostamento di 30 minuti)', async () => {
    const id = await insertBooking(slot(WED, 18, 0, 60));
    expect((await patch(id, slot(WED, 18, 30, 60))).status).toBe(200);
  });

  it.each(['pending', 'approved', 'confirmed'])('rifiuta lo spostamento su una prenotazione %s', async (status) => {
    const id = await insertBooking(slot(WED, 18));
    await insertBooking(slot(WED, 20), status, 'Altro');
    expect((await patch(id, slot(WED, 19, 30, 60))).status).toBe(409);
    const b = await getBooking(id);
    expect(new Date(b!.slot_start).toISOString()).toBe(slot(WED, 18).slot_start); // invariata
  });

  it('consente lo spostamento su uno slot di una prenotazione rifiutata', async () => {
    const id = await insertBooking(slot(WED, 18));
    await insertBooking(slot(WED, 20), 'rejected', 'Altro');
    expect((await patch(id, slot(WED, 20))).status).toBe(200);
  });

  it('rifiuta lo spostamento su uno slot bloccato (anche parziale)', async () => {
    const id = await insertBooking(slot(WED, 18));
    await insertBlock(slot(WED, 20, 0, 60));
    expect((await patch(id, slot(WED, 20))).status).toBe(409);
    expect((await patch(id, slot(WED, 19, 30, 60))).status).toBe(409);
    expect(email.sendUserRescheduled).not.toHaveBeenCalled();
  });

  it.each([
    ['nel passato', { ...slot('2026-10-02', 18) }],
    ['fine prima dell\'inizio', { slot_start: slot(WED, 20).slot_end, slot_end: slot(WED, 20).slot_start }],
    ['solo l\'inizio', { slot_start: slot(WED, 20).slot_start }],
    ['date non valide', { slot_start: 'ieri', slot_end: 'domani' }],
  ])('rifiuta: %s', async (_label, body) => {
    const id = await insertBooking(slot(WED, 18));
    expect((await patch(id, body)).status).toBe(400);
  });

  it('404 se la prenotazione non esiste', async () => {
    expect((await patch(MISSING_ID, slot(WED, 20))).status).toBe(404);
  });

  it('dopo lo spostamento lo slot vecchio torna prenotabile e quello nuovo no', async () => {
    const id = await insertBooking(slot(WED, 18));
    await patch(id, slot(WED, 20));
    const person = { name: 'Luca', email: 'luca@example.com', phone: '+393331111111' };
    expect((await call(createBooking, { body: { ...person, ...slot(WED, 18) } })).status).toBe(201);
    expect((await call(createBooking, { body: { ...person, ...slot(WED, 20) } })).status).toBe(409);
  });

  it('spostamento attraverso il cambio ora (24 → 25 ottobre) mantiene le 18:00 di Roma', async () => {
    const id = await insertBooking(slot('2026-10-24', 18));
    const to = slot('2026-10-25', 18);
    expect((await patch(id, to)).status).toBe(200);
    expect(new Date((await getBooking(id))!.slot_start).toISOString()).toBe('2026-10-25T17:00:00.000Z');
  });

  it('non si può riattivare una prenotazione rifiutata se lo slot è stato occupato', async () => {
    const rejectedId = await insertBooking(slot(WED, 19), 'rejected');
    await insertBooking(slot(WED, 19), 'approved', 'Nuovo cliente');
    expect((await patch(rejectedId, { status: 'approved' })).status).toBe(409);
  });

  it('non si può riattivare una prenotazione rifiutata su uno slot bloccato nel frattempo', async () => {
    const rejectedId = await insertBooking(slot(WED, 19), 'rejected');
    await insertBlock(slot(WED, 19));
    expect((await patch(rejectedId, { status: 'pending' })).status).toBe(409);
    expect((await getBooking(rejectedId))!.status).toBe('rejected');
  });

  it('si può riattivare una prenotazione rifiutata se lo slot è ancora libero', async () => {
    const rejectedId = await insertBooking(slot(WED, 19), 'rejected');
    expect((await patch(rejectedId, { status: 'approved' })).status).toBe(200);
  });

  it('il database stesso impedisce due prenotazioni attive sovrapposte', async () => {
    await insertBooking(slot(WED, 19), 'approved');
    await expect(insertBooking(slot(WED, 19, 30, 60), 'pending')).rejects.toMatchObject({ code: '23P01' });
    await expect(insertBooking(slot(WED, 19), 'rejected')).resolves.toBeTruthy(); // le rifiutate non contano
  });
});

describe('PATCH /api/admin/bookings/:id — cambio stato', () => {
  it.each([
    ['approved', 'sendUserApproved'],
    ['confirmed', 'sendUserConfirmed'],
    ['rejected', 'sendUserRejected'],
  ] as const)('stato %s salva e manda l\'email giusta', async (status, fn) => {
    const id = await insertBooking(slot(WED, 18));
    expect((await patch(id, { status })).status).toBe(200);
    expect((await getBooking(id))!.status).toBe(status);
    expect(email[fn]).toHaveBeenCalledOnce();
    expect(email.sendUserRescheduled).not.toHaveBeenCalled();
  });

  it('cambio stato + orario manda una sola email (quella di stato)', async () => {
    const id = await insertBooking(slot(WED, 18));
    expect((await patch(id, { status: 'approved', ...slot(WED, 20) })).status).toBe(200);
    expect(email.sendUserApproved).toHaveBeenCalledOnce();
    expect(email.sendUserRescheduled).not.toHaveBeenCalled();
  });

  it('rifiuta uno stato sconosciuto o nessun dato', async () => {
    const id = await insertBooking(slot(WED, 18));
    expect((await patch(id, { status: 'cancellata' })).status).toBe(400);
    expect((await patch(id, {})).status).toBe(400);
  });
});

describe('Flusso pending → approved → confirmed', () => {
  const run = (route: typeof approve, id: string) => call(route, { params: { id } });

  it('approva, poi conferma il pagamento', async () => {
    const id = await insertBooking(slot(WED, 18));
    expect((await run(approve, id)).status).toBe(200);
    expect((await run(confirmPayment, id)).status).toBe(200);
    expect((await getBooking(id))!.status).toBe('confirmed');
  });

  it('non conferma il pagamento di una prenotazione non approvata', async () => {
    const id = await insertBooking(slot(WED, 18));
    expect((await run(confirmPayment, id)).status).toBe(404);
    expect((await getBooking(id))!.status).toBe('pending');
  });

  it('non approva né rifiuta due volte', async () => {
    const id = await insertBooking(slot(WED, 18));
    expect((await run(approve, id)).status).toBe(200);
    expect((await run(approve, id)).status).toBe(404);
    expect((await run(reject, id)).status).toBe(404);
    expect((await getBooking(id))!.status).toBe('approved');
  });

  it('il rifiuto libera lo slot per un altro cliente', async () => {
    const id = await insertBooking(slot(WED, 18));
    expect((await run(reject, id)).status).toBe(200);
    expect(email.sendUserRejected).toHaveBeenCalledOnce();
    const person = { name: 'Luca', email: 'luca@example.com', phone: '+393331111111' };
    expect((await call(createBooking, { body: { ...person, ...slot(WED, 18) } })).status).toBe(201);
  });
});

describe('DELETE /api/admin/bookings/:id', () => {
  it('cancella una prenotazione futura e libera lo slot', async () => {
    const id = await insertBooking(slot(WED, 18), 'confirmed');
    expect((await call(deleteBooking, { method: 'DELETE', params: { id } })).status).toBe(200);
    expect(await getBooking(id)).toBeUndefined();
  });

  it('non cancella una prenotazione passata', async () => {
    const id = await insertBooking(slot('2026-10-02', 18), 'confirmed');
    expect((await call(deleteBooking, { method: 'DELETE', params: { id } })).status).toBe(400);
    expect(await getBooking(id)).toBeDefined();
  });

  it('404 se non esiste', async () => {
    expect((await call(deleteBooking, { method: 'DELETE', params: { id: MISSING_ID } })).status).toBe(404);
  });
});
