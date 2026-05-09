import { MOCK_SCHEDULE, buildSlotDateTimes, type DaySchedule } from './slots';

type MockState = 'reserved' | 'booked' | 'blocked';

const MOCK_STATES: Record<number, { state: MockState; reason?: string }> = {
  4:  { state: 'reserved' },
  6:  { state: 'booked' },   // gap test: 6 booked
  // 7 stays available — this is the "trapped" 30-min slot
  8:  { state: 'booked' },   // gap test: 8 booked
  10: { state: 'booked' },
  18: { state: 'blocked', reason: 'Maintenance' },
  25: { state: 'reserved' },
};

export type MockSlotData = {
  schedule: DaySchedule[];
  bookings: { slot_start: string; slot_end: string; status: string }[];
  blocked: { slot_start: string; slot_end: string; reason: string | null }[];
};

export function getMockSlotData(from: string, to: string): MockSlotData {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setDate(toDate.getDate() + 1);

  const bookings: MockSlotData['bookings'] = [];
  const blocked: MockSlotData['blocked'] = [];

  let idx = 0;
  const cursor = new Date(fromDate);
  while (cursor < toDate) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const slots = buildSlotDateTimes(dateStr, MOCK_SCHEDULE);
    for (const { start, end } of slots) {
      const mock = MOCK_STATES[idx];
      if (mock) {
        const slot_start = start.toISOString();
        const slot_end = end.toISOString();
        if (mock.state === 'reserved') {
          bookings.push({ slot_start, slot_end, status: 'pending' });
        } else if (mock.state === 'booked') {
          bookings.push({ slot_start, slot_end, status: 'confirmed' });
        } else if (mock.state === 'blocked') {
          blocked.push({ slot_start, slot_end, reason: mock.reason ?? null });
        }
      }
      idx++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return { schedule: MOCK_SCHEDULE, bookings, blocked };
}
