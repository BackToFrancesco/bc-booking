import type { APIRoute } from 'astro';
import { waitUntil } from '@vercel/functions';
import sql from '../../../lib/db';
import { sendAdminNewBooking, sendUserBookingReceived } from '../../../lib/email';
import { MOCK_API, BOOKING_HORIZON_MS } from '../../../lib/config';
import { SLOT_DURATION_MINUTES } from '../../../lib/slots';
import { isOverlapViolation } from '../../../lib/db-errors';

export const POST: APIRoute = async ({ request }) => {
  let body: { name?: string; email?: string; phone?: string; slot_start?: string; slot_end?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON non valido' }), { status: 400 });
  }

  if (MOCK_API) {
    return new Response(JSON.stringify({ ok: true, id: 'mock-id' }), { status: 201 });
  }

  const name = body.name?.trim().slice(0, 100) ?? '';
  const email = body.email?.trim().toLowerCase().slice(0, 255) ?? '';
  const phone = body.phone?.trim().slice(0, 30) ?? '';
  const slot_start = body.slot_start;
  const slot_end = body.slot_end;

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  if (!name || !email || !phone || !slot_start || !slot_end) {
    return new Response(JSON.stringify({ error: 'Nome, email, telefono, slot_start e slot_end sono obbligatori' }), { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return new Response(JSON.stringify({ error: 'Formato email non valido' }), { status: 400 });
  }
  if (name.length < 2) {
    return new Response(JSON.stringify({ error: 'Nome troppo corto' }), { status: 400 });
  }

  const start = new Date(slot_start);
  const end = new Date(slot_end);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return new Response(JSON.stringify({ error: 'Intervallo slot non valido' }), { status: 400 });
  }
  if (start <= new Date()) {
    return new Response(JSON.stringify({ error: 'Non è possibile prenotare uno slot nel passato' }), { status: 400 });
  }
  if (start.getTime() > Date.now() + BOOKING_HORIZON_MS) {
    return new Response(JSON.stringify({ error: 'Slot oltre il limite di prenotazione consentito' }), { status: 400 });
  }

  // 1. Durata e allineamento slot
  const durationMs = end.getTime() - start.getTime();
  if (durationMs % (SLOT_DURATION_MINUTES * 60 * 1000) !== 0) {
    return new Response(JSON.stringify({ error: `La durata della prenotazione deve essere un multiplo di ${SLOT_DURATION_MINUTES} minuti` }), { status: 400 });
  }
  if (start.getMinutes() % SLOT_DURATION_MINUTES !== 0 || start.getSeconds() !== 0 || start.getMilliseconds() !== 0) {
    return new Response(JSON.stringify({ error: 'La prenotazione deve essere allineata ai 30 minuti' }), { status: 400 });
  }

  // 2. Controllo che sia nello stesso giorno
  const toDateStrRome = (d: Date) => d.toLocaleDateString('sv', { timeZone: 'Europe/Rome' });
  if (toDateStrRome(start) !== toDateStrRome(new Date(end.getTime() - 1))) {
    return new Response(JSON.stringify({ error: 'La prenotazione deve iniziare e terminare nello stesso giorno' }), { status: 400 });
  }

  // 3. Orari di apertura/chiusura
  const dowStr = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'Europe/Rome' }).format(start);
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(dowStr);
  const [schedule] = await sql<{ open_hour: number; close_hour: number }[]>`
    SELECT open_hour, close_hour FROM day_schedules WHERE day_of_week = ${dow}
  `;
  if (!schedule) {
    return new Response(JSON.stringify({ error: 'Giorno non disponibile per prenotazioni' }), { status: 400 });
  }

  const TZ = 'Europe/Rome';
  const toHourDecimal = (d: Date) => {
    const parts = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: 'numeric', hour12: false, timeZone: TZ }).formatToParts(d);
    const h = Number(parts.find(p => p.type === 'hour')!.value);
    const m = Number(parts.find(p => p.type === 'minute')!.value);
    return h + m / 60;
  };
  const startHourDecimal = toHourDecimal(start);
  const endHourDecimal = toHourDecimal(end);

  if (startHourDecimal < schedule.open_hour || endHourDecimal > schedule.close_hour) {
    return new Response(
      JSON.stringify({ error: `La prenotazione deve rientrare nell'orario di apertura (${schedule.open_hour}:00 - ${schedule.close_hour}:00)` }),
      { status: 400 }
    );
  }

  // Check overlap with existing bookings
  const existing = await sql`
    SELECT id FROM bookings
    WHERE slot_start < ${end} AND slot_end > ${start}
      AND status != 'rejected'
    LIMIT 1
  `;
  if (existing.length > 0) {
    return new Response(JSON.stringify({ error: 'Slot non disponibile' }), { status: 409 });
  }

  // Check overlap with blocked slots
  const isBlocked = await sql`
    SELECT id FROM blocked_slots
    WHERE slot_start < ${end} AND slot_end > ${start}
    LIMIT 1
  `;
  if (isBlocked.length > 0) {
    return new Response(JSON.stringify({ error: 'Slot non disponibile' }), { status: 409 });
  }

  let booking;
  try {
    [booking] = await sql`
      INSERT INTO bookings (name, email, phone, slot_start, slot_end, status)
      VALUES (${name}, ${email}, ${phone || null}, ${start}, ${end}, 'pending')
      RETURNING id, name, email, phone, slot_start, slot_end, status
    `;
  } catch (err) {
    // Richiesta simultanea sullo stesso slot: il vincolo del DB ne lascia passare una sola
    if (isOverlapViolation(err)) {
      return new Response(JSON.stringify({ error: 'Slot non disponibile' }), { status: 409 });
    }
    throw err;
  }

  const bookingTyped = booking as { id: string; name: string; email: string; phone?: string; slot_start: string; slot_end: string };
  waitUntil(
    sendAdminNewBooking(bookingTyped)
      .catch((err) => console.error('sendAdminNewBooking failed:', err)),
  );
  waitUntil(
    sendUserBookingReceived(bookingTyped)
      .catch((err) => console.error('sendUserBookingReceived failed:', err)),
  );

  return new Response(JSON.stringify({ ok: true, id: booking.id }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
