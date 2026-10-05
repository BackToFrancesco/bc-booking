import { describe, it, expect } from 'vitest';
import { romeDateTime, romeDateStr, romeDayOfWeek, romeDatesInRange, toRomeInput, fromRomeInput } from './rome';
import { buildSlotDateTimes, MOCK_SCHEDULE } from './slots';

// Eseguiti anche con TZ=Europe/Dublin: il risultato non deve dipendere dal fuso della macchina.
describe('rome helpers', () => {
  it('romeDateTime converte l\'ora di Roma nell\'istante giusto (estate e inverno)', () => {
    expect(romeDateTime('2026-07-10', 18).toISOString()).toBe('2026-07-10T16:00:00.000Z');
    expect(romeDateTime('2026-01-10', 18, 30).toISOString()).toBe('2026-01-10T17:30:00.000Z');
  });

  it('gestisce il cambio ora (25 ottobre 2026)', () => {
    expect(romeDateTime('2026-10-24', 18).toISOString()).toBe('2026-10-24T16:00:00.000Z');
    expect(romeDateTime('2026-10-25', 18).toISOString()).toBe('2026-10-25T17:00:00.000Z');
  });

  it('romeDateStr e romeDayOfWeek usano il giorno di Roma, non UTC', () => {
    const d = new Date('2026-07-12T22:30:00.000Z'); // lunedì 00:30 a Roma
    expect(romeDateStr(d)).toBe('2026-07-13');
    expect(romeDayOfWeek(d)).toBe(1);
  });

  it('romeDatesInRange elenca i giorni di Roma', () => {
    const start = romeDateTime('2026-10-24', 0);
    const end = romeDateTime('2026-10-27', 0);
    expect(romeDatesInRange(start, end)).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
  });

  it('input datetime-local andata e ritorno in ora di Roma', () => {
    const d = new Date('2026-07-10T16:30:00.000Z');
    expect(toRomeInput(d)).toBe('2026-07-10T18:30');
    expect(fromRomeInput('2026-07-10T18:30').getTime()).toBe(d.getTime());
  });

  it('buildSlotDateTimes genera gli slot in ora di Roma', () => {
    const slots = buildSlotDateTimes('2026-07-10', MOCK_SCHEDULE); // venerdì 18–23
    expect(slots[0].start.toISOString()).toBe('2026-07-10T16:00:00.000Z');
    expect(slots.at(-1)!.end.toISOString()).toBe('2026-07-10T21:00:00.000Z');
  });
});
