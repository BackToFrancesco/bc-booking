import { MOCK_SCHEDULE, SLOT_DURATION_MINUTES, buildSlotDateTimes } from './slots';

type DisplayState = 'available' | 'reserved' | 'booked' | 'blocked' | 'past';

const colorMap: Record<DisplayState, string> = {
  available: '#22c55e',
  reserved:  '#eab308',
  booked:    '#dc2626',
  blocked:   '#374151',
  past:      '#e2e2e2',
};

const MOCK_STATES: Record<number, { state: DisplayState; reason?: string }> = {
  4:  { state: 'reserved' },
  10: { state: 'booked' },
  18: { state: 'blocked', reason: 'Maintenance' },
  25: { state: 'reserved' },
};

export function getMockSlotEvents(from: string, to: string) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setDate(toDate.getDate() + 1);

  const now = new Date();
  const events = [];
  let idx = 0;
  const cursor = new Date(fromDate);

  while (cursor < toDate) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const slots = buildSlotDateTimes(dateStr, MOCK_SCHEDULE);

    for (const { start, end } of slots) {
      const mock = MOCK_STATES[idx];
      let displayState: DisplayState;
      if (start < now) displayState = 'past';
      else displayState = mock?.state ?? 'available';

      events.push({
        id: start.toISOString(),
        title: '',
        start: start.toISOString(),
        end: end.toISOString(),
        backgroundColor: colorMap[displayState],
        borderColor: colorMap[displayState],
        extendedProps: { status: displayState, reason: mock?.reason ?? null },
      });
      idx++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return events;
}
