import type { APIRoute } from 'astro';
import sql from '../../../lib/db';
import { MOCK_API } from '../../../lib/config';

const STATUS_COLOR: Record<string, string> = {
  pending:   '#eab308',
  approved:  '#f97316',
  confirmed: '#dc2626',
  rejected:  '#9ca3af',
};

export const GET: APIRoute = async ({ url }) => {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!from || !to) return new Response(JSON.stringify([]), { status: 200 });

  if (MOCK_API) {
    const events = [
      {
        id: 'mock-1',
        title: 'Mario Rossi',
        start: '2026-05-06T18:00:00.000Z',
        end: '2026-05-06T19:30:00.000Z',
        backgroundColor: STATUS_COLOR.pending,
        borderColor: STATUS_COLOR.pending,
        extendedProps: { type: 'booking', bookingId: 'mock-1', name: 'Mario Rossi', email: 'mario@example.com', phone: '+39 333 123 4567', status: 'pending' },
      },
      {
        id: 'mock-2',
        title: 'Giulia Bianchi',
        start: '2026-05-07T20:00:00.000Z',
        end: '2026-05-07T21:00:00.000Z',
        backgroundColor: STATUS_COLOR.approved,
        borderColor: STATUS_COLOR.approved,
        extendedProps: { type: 'booking', bookingId: 'mock-2', name: 'Giulia Bianchi', email: 'giulia@example.com', phone: null, status: 'approved' },
      },
      {
        id: 'blocked-mock-1',
        title: 'Maintenance',
        start: '2026-05-09T16:00:00.000Z',
        end: '2026-05-09T18:00:00.000Z',
        backgroundColor: '#374151',
        borderColor: '#374151',
        extendedProps: { type: 'blocked', bookingId: 'mock-b1', reason: 'Maintenance' },
      },
    ];
    return new Response(JSON.stringify(events), { headers: { 'Content-Type': 'application/json' } });
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setDate(toDate.getDate() + 1);

  const [bookings, blocked] = await Promise.all([
    sql<{ id: string; name: string; email: string; phone: string | null; slot_start: Date; slot_end: Date; status: string }[]>`
      SELECT id, name, email, phone, slot_start, slot_end, status
      FROM bookings
      WHERE slot_start < ${toDate} AND slot_end > ${fromDate}
        AND status != 'rejected'
      ORDER BY slot_start
    `,
    sql<{ id: string; slot_start: Date; slot_end: Date; reason: string | null }[]>`
      SELECT id, slot_start, slot_end, reason
      FROM blocked_slots
      WHERE slot_start < ${toDate} AND slot_end > ${fromDate}
      ORDER BY slot_start
    `,
  ]);

  const events = [
    ...bookings.map((b) => ({
      id: b.id,
      title: b.name,
      start: new Date(b.slot_start).toISOString(),
      end: new Date(b.slot_end).toISOString(),
      backgroundColor: STATUS_COLOR[b.status] ?? '#9ca3af',
      borderColor: STATUS_COLOR[b.status] ?? '#9ca3af',
      extendedProps: { type: 'booking', bookingId: b.id, name: b.name, email: b.email, phone: b.phone, status: b.status },
    })),
    ...blocked.map((b) => ({
      id: `blocked-${b.id}`,
      title: b.reason ?? 'Bloccato',
      start: new Date(b.slot_start).toISOString(),
      end: new Date(b.slot_end).toISOString(),
      backgroundColor: '#374151',
      borderColor: '#374151',
      extendedProps: { type: 'blocked', bookingId: b.id, reason: b.reason },
    })),
  ];

  return new Response(JSON.stringify(events), { headers: { 'Content-Type': 'application/json' } });
};
