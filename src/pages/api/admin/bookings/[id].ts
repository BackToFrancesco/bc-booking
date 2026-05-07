import type { APIRoute } from 'astro';
import sql from '../../../../lib/db';
import { MOCK_API } from '../../../../lib/config';

export const DELETE: APIRoute = async ({ params }) => {
  const { id } = params;

  if (MOCK_API) return new Response(JSON.stringify({ ok: true }), { status: 200 });

  const [booking] = await sql`
    SELECT id, slot_start FROM bookings WHERE id = ${id!}
  `;

  if (!booking) {
    return new Response(JSON.stringify({ error: 'Booking not found' }), { status: 404 });
  }

  if (new Date(booking.slot_start as string) <= new Date()) {
    return new Response(JSON.stringify({ error: 'Cannot cancel a past booking' }), { status: 400 });
  }

  await sql`DELETE FROM bookings WHERE id = ${id!}`;

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
