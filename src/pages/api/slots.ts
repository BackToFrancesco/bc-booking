import type { APIRoute } from 'astro';
import sql from '../../lib/db';
import { buildSlotDateTimes, type DaySchedule } from '../../lib/slots';
import { getMockSlotEvents } from '../../lib/mock';
import { MOCK_API } from '../../lib/config';

export const GET: APIRoute = async ({ url }) => {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  if (!from || !to) {
    return new Response(JSON.stringify({ error: 'from and to required' }), { status: 400 });
  }

  if (MOCK_API) {
    return new Response(JSON.stringify(getMockSlotEvents(from, to)), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setDate(toDate.getDate() + 1);

  const schedule = await sql<DaySchedule[]>`
    SELECT day_of_week, open_hour, close_hour FROM day_schedules ORDER BY day_of_week
  `;

  const allSlots: { start: Date; end: Date }[] = [];
  const cursor = new Date(fromDate);
  while (cursor < toDate) {
    const dateStr = cursor.toISOString().slice(0, 10);
    allSlots.push(...buildSlotDateTimes(dateStr, schedule));
    cursor.setDate(cursor.getDate() + 1);
  }

  const bookings = await sql<{ slot_start: Date; slot_end: Date; status: string }[]>`
    SELECT slot_start, slot_end, status FROM bookings
    WHERE slot_start < ${toDate} AND slot_end > ${fromDate}
      AND status != 'rejected'
  `;

  const blocked = await sql<{ slot_start: Date; slot_end: Date; reason: string | null }[]>`
    SELECT slot_start, slot_end, reason FROM blocked_slots
    WHERE slot_start < ${toDate} AND slot_end > ${fromDate}
  `;

  type DisplayState = 'available' | 'reserved' | 'booked' | 'blocked' | 'past';

  function toDisplayState(status: string): DisplayState {
    if (status === 'pending' || status === 'approved') return 'reserved';
    if (status === 'confirmed') return 'booked';
    return 'available';
  }

  const colorMap: Record<DisplayState, string> = {
    available: '#22c55e',
    reserved:  '#eab308',
    booked:    '#dc2626',
    blocked:   '#374151',
    past:      '#e2e2e2',
  };

  const now = new Date();

  const events = allSlots.map(({ start, end }) => {
    let displayState: DisplayState = 'available';
    let reason: string | null = null;

    if (start < now) {
      displayState = 'past';
    } else {
      const block = blocked.find(
        (b) => new Date(b.slot_start) < end && new Date(b.slot_end) > start
      );
      if (block) {
        displayState = 'blocked';
        reason = block.reason;
      } else {
        const booking = bookings.find(
          (b) => new Date(b.slot_start) < end && new Date(b.slot_end) > start
        );
        if (booking) displayState = toDisplayState(booking.status);
      }
    }

    return {
      id: start.toISOString(),
      title: '',
      start: start.toISOString(),
      end: end.toISOString(),
      backgroundColor: colorMap[displayState],
      borderColor: colorMap[displayState],
      extendedProps: { status: displayState, reason },
    };
  });

  return new Response(JSON.stringify(events), {
    headers: { 'Content-Type': 'application/json' },
  });
};
