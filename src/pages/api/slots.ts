import type { APIRoute } from 'astro';
import sql from '../../lib/db';
import type { DaySchedule } from '../../lib/slots';
import { getMockSlotData } from '../../lib/mock';
import { MOCK_API } from '../../lib/config';

export const GET: APIRoute = async ({ url }) => {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  if (!from || !to) {
    return new Response(JSON.stringify({ error: 'from and to required' }), { status: 400 });
  }

  if (MOCK_API) {
    return new Response(JSON.stringify(getMockSlotData(from, to)), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setDate(toDate.getDate() + 1);

  const [schedule, bookings, blocked] = await Promise.all([
    sql<DaySchedule[]>`
      SELECT day_of_week, open_hour, close_hour FROM day_schedules ORDER BY day_of_week
    `,
    sql<{ slot_start: Date; slot_end: Date; status: string }[]>`
      SELECT slot_start, slot_end, status FROM bookings
      WHERE slot_start < ${toDate} AND slot_end > ${fromDate}
        AND status != 'rejected'
    `,
    sql<{ slot_start: Date; slot_end: Date; reason: string | null }[]>`
      SELECT slot_start, slot_end, reason FROM blocked_slots
      WHERE slot_start < ${toDate} AND slot_end > ${fromDate}
    `,
  ]);

  return new Response(JSON.stringify({ schedule, bookings, blocked }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
