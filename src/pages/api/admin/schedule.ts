import type { APIRoute } from 'astro';
import sql from '../../../lib/db';
import { MOCK_API } from '../../../lib/config';
import { MOCK_SCHEDULE } from '../../../lib/slots';

export const GET: APIRoute = async () => {
  if (MOCK_API) {
    return new Response(JSON.stringify(MOCK_SCHEDULE), { headers: { 'Content-Type': 'application/json' } });
  }

  const rows = await sql`SELECT day_of_week, open_hour, close_hour FROM day_schedules ORDER BY day_of_week`;
  return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } });
};

export const PUT: APIRoute = async ({ request }) => {
  if (MOCK_API) {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  const { schedules } = await request.json() as {
    schedules: { day_of_week: number; open_hour: number; close_hour: number }[]
  };

  if (!Array.isArray(schedules) || schedules.length !== 7) {
    return new Response(JSON.stringify({ error: 'schedules must have 7 entries' }), { status: 400 });
  }

  for (const s of schedules) {
    await sql`
      INSERT INTO day_schedules (day_of_week, open_hour, close_hour)
      VALUES (${s.day_of_week}, ${s.open_hour}, ${s.close_hour})
      ON CONFLICT (day_of_week) DO UPDATE SET open_hour = ${s.open_hour}, close_hour = ${s.close_hour}
    `;
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
