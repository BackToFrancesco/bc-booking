import type { APIRoute } from 'astro';
import sql from '../../../../lib/db';

export const POST: APIRoute = async ({ request }) => {
  let slot_start: string | undefined;
  let slot_end: string | undefined;
  let reason: string | undefined;
  try {
    const body = await request.json();
    slot_start = body.slot_start;
    slot_end = body.slot_end;
    reason = body.reason;
  } catch {
    return new Response(JSON.stringify({ error: 'JSON non valido' }), { status: 400 });
  }

  if (!slot_start || !slot_end) {
    return new Response(JSON.stringify({ error: 'slot_start e slot_end sono obbligatori' }), { status: 400 });
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
