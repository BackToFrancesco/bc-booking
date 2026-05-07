import type { APIRoute } from 'astro';
import sql from '../../../lib/db';
import { sendAdminNewBooking } from '../../../lib/email';
import { MOCK_API } from '../../../lib/config';

export const POST: APIRoute = async ({ request }) => {
  let body: { name?: string; email?: string; phone?: string; slot_start?: string; slot_end?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
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

  if (!name || !email || !slot_start || !slot_end) {
    return new Response(JSON.stringify({ error: 'name, email, slot_start and slot_end are required' }), { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return new Response(JSON.stringify({ error: 'Invalid email format' }), { status: 400 });
  }
  if (name.length < 2) {
    return new Response(JSON.stringify({ error: 'Name too short' }), { status: 400 });
  }

  const start = new Date(slot_start);
  const end = new Date(slot_end);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return new Response(JSON.stringify({ error: 'Invalid slot range' }), { status: 400 });
  }

  // Check overlap with existing bookings
  const existing = await sql`
    SELECT id FROM bookings
    WHERE slot_start < ${end} AND slot_end > ${start}
      AND status != 'rejected'
    LIMIT 1
  `;
  if (existing.length > 0) {
    return new Response(JSON.stringify({ error: 'Slot not available' }), { status: 409 });
  }

  // Check overlap with blocked slots
  const isBlocked = await sql`
    SELECT id FROM blocked_slots
    WHERE slot_start < ${end} AND slot_end > ${start}
    LIMIT 1
  `;
  if (isBlocked.length > 0) {
    return new Response(JSON.stringify({ error: 'Slot not available' }), { status: 409 });
  }

  const [booking] = await sql`
    INSERT INTO bookings (name, email, phone, slot_start, slot_end, status)
    VALUES (${name}, ${email}, ${phone || null}, ${start}, ${end}, 'pending')
    RETURNING id, name, email, phone, slot_start, slot_end, status
  `;

  await sendAdminNewBooking(booking as { id: string; name: string; email: string; phone?: string; slot_start: string; slot_end: string });

  return new Response(JSON.stringify({ ok: true, id: booking.id }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
