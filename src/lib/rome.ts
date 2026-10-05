import { DateTime } from 'luxon';

// Il campo è a Conselve: ogni orario mostrato o calcolato è in ora italiana,
// indipendentemente dal fuso del browser o del server.
export const TZ = 'Europe/Rome';

/** Istante corrispondente a `dateStr` (YYYY-MM-DD) alle hour:minute ora di Roma. */
export function romeDateTime(dateStr: string, hour: number, minute = 0): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return DateTime.fromObject({ year, month, day, hour, minute }, { zone: TZ }).toJSDate();
}

/** Data YYYY-MM-DD a Roma per l'istante dato. */
export function romeDateStr(d: Date): string {
  return DateTime.fromJSDate(d, { zone: TZ }).toISODate()!;
}

/** Giorno della settimana a Roma (0 = domenica … 6 = sabato). */
export function romeDayOfWeek(d: Date): number {
  return DateTime.fromJSDate(d, { zone: TZ }).weekday % 7;
}

/** Date YYYY-MM-DD (a Roma) toccate dall'intervallo [start, end). */
export function romeDatesInRange(start: Date, end: Date): string[] {
  const dates: string[] = [];
  let cur = DateTime.fromJSDate(start, { zone: TZ }).startOf('day');
  const last = DateTime.fromJSDate(end, { zone: TZ });
  while (cur < last) {
    dates.push(cur.toISODate()!);
    cur = cur.plus({ days: 1 });
  }
  return dates;
}

/** Valore per <input type="datetime-local"> in ora di Roma. */
export function toRomeInput(d: Date): string {
  return DateTime.fromJSDate(d, { zone: TZ }).toFormat("yyyy-LL-dd'T'HH:mm");
}

/** Interpreta il valore di un <input type="datetime-local"> come ora di Roma. */
export function fromRomeInput(value: string): Date {
  return DateTime.fromISO(value, { zone: TZ }).toJSDate();
}
