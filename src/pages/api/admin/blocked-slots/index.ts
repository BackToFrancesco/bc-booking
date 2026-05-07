import type { APIRoute } from 'astro';
import sql from '../../../../lib/db';

export const POST: APIRoute = async ({ request }) => {
  const { slot_start, slot_end, reason } = await request.json();
  if (!slot_start || !slot_end) {
    return new Response(JSON.stringify({ error: 'slot_start e slot_end obbligatori' }), { status: 400 });
  }

  const start = new Date(slot_start);
  const end = new Date(slot_end);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return new Response(JSON.stringify({ error: 'Date non valide' }), { status: 400 });
  }
  if (end <= start) {
    return new Response(JSON.stringify({ error: 'slot_end deve essere dopo slot_start' }), { status: 400 });
  }

  const [row] = await sql`
    INSERT INTO blocked_slots (slot_start, slot_end, reason)
    VALUES (${start}, ${end}, ${reason ?? null})
    RETURNING id
  `;

  return new Response(JSON.stringify({ ok: true, id: row.id }), { status: 201 });
};
