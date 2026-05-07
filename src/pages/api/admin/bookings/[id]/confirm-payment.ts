import type { APIRoute } from 'astro';
import sql from '../../../../../lib/db';
import { MOCK_API } from '../../../../../lib/config';

export const POST: APIRoute = async ({ params }) => {
  const { id } = params;

  if (MOCK_API) return new Response(JSON.stringify({ ok: true }), { status: 200 });

  const [booking] = await sql`
    UPDATE bookings SET status = 'confirmed'
    WHERE id = ${id!} AND status = 'approved'
    RETURNING id
  `;

  if (!booking) {
    return new Response(JSON.stringify({ error: 'Prenotazione non trovata o non in stato approved' }), { status: 404 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
