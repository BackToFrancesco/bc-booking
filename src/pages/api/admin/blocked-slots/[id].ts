import type { APIRoute } from 'astro';
import sql from '../../../../lib/db';
import { MOCK_API } from '../../../../lib/config';

export const DELETE: APIRoute = async ({ params }) => {
  const { id } = params;

  if (MOCK_API) return new Response(JSON.stringify({ ok: true }), { status: 200 });

  await sql`DELETE FROM blocked_slots WHERE id = ${id!}`;

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
