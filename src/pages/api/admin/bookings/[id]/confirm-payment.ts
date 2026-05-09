import type { APIRoute } from 'astro';
import { waitUntil } from '@vercel/functions';
import sql from '../../../../../lib/db';
import { sendUserConfirmed } from '../../../../../lib/email';
import { MOCK_API } from '../../../../../lib/config';

export const POST: APIRoute = async ({ params }) => {
  const { id } = params;

  if (MOCK_API) return new Response(JSON.stringify({ ok: true }), { status: 200 });

  const [booking] = await sql`
    UPDATE bookings SET status = 'confirmed'
    WHERE id = ${id!} AND status = 'approved'
    RETURNING id, name, email, slot_start, slot_end
  `;

  if (!booking) {
    return new Response(JSON.stringify({ error: 'Prenotazione non trovata o non in stato approved' }), { status: 404 });
  }

  waitUntil(
    sendUserConfirmed(booking as { id: string; name: string; email: string; slot_start: string; slot_end: string })
      .catch((err) => console.error('sendUserConfirmed failed:', err)),
  );

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
