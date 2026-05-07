export const SLOT_DURATION_MINUTES = 30;

export type DaySchedule = {
  day_of_week: number;
  open_hour: number;
  close_hour: number;
};

export const MOCK_SCHEDULE: DaySchedule[] = [
  { day_of_week: 0, open_hour: 16, close_hour: 23 },
  { day_of_week: 1, open_hour: 18, close_hour: 23 },
  { day_of_week: 2, open_hour: 18, close_hour: 23 },
  { day_of_week: 3, open_hour: 18, close_hour: 23 },
  { day_of_week: 4, open_hour: 18, close_hour: 23 },
  { day_of_week: 5, open_hour: 18, close_hour: 23 },
  { day_of_week: 6, open_hour: 16, close_hour: 23 },
];

export function buildSlotDateTimes(
  dateStr: string,
  schedule: DaySchedule[]
): { start: Date; end: Date }[] {
  const date = new Date(`${dateStr}T00:00:00`);
  const dow = date.getDay();
  const day = schedule.find((s) => s.day_of_week === dow);
  if (!day) return [];

  const slots: { start: Date; end: Date }[] = [];
  // Generate 30-min slots from open_hour:00 up to (but not including) close_hour:00
  for (let h = day.open_hour; h < day.close_hour; h++) {
    for (const m of [0, 30]) {
      const start = new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
      const end = new Date(start.getTime() + SLOT_DURATION_MINUTES * 60 * 1000);
      slots.push({ start, end });
    }
  }
  return slots;
}
