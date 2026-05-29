import { describe, it, expect } from 'vitest';

/**
 * These are the timezone-sensitive helper functions extracted from the booking API.
 * They ensure all date/time operations use Europe/Rome timezone regardless of server location.
 */

const TZ = 'Europe/Rome';

function toHourDecimal(d: Date): number {
  const parts = new Intl.DateTimeFormat('en', { 
    hour: 'numeric', 
    minute: 'numeric', 
    hour12: false, 
    timeZone: TZ 
  }).formatToParts(d);
  const h = Number(parts.find(p => p.type === 'hour')!.value);
  const m = Number(parts.find(p => p.type === 'minute')!.value);
  return h + m / 60;
}

function toDateStrRome(d: Date): string {
  return d.toLocaleDateString('sv', { timeZone: TZ });
}

function getDayOfWeekRome(d: Date): number {
  const dowStr = new Intl.DateTimeFormat('en', { 
    weekday: 'short', 
    timeZone: TZ 
  }).format(d);
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(dowStr);
}

describe('Timezone-aware booking validation', () => {
  describe('toHourDecimal - converts UTC timestamp to Rome hour decimal', () => {
    it('should convert 16:00 Rome (14:00 UTC in summer) to 16.0', () => {
      // Summer time: Rome is UTC+2
      const date = new Date('2025-07-10T14:00:00.000Z'); // 16:00 Rome
      expect(toHourDecimal(date)).toBe(16.0);
    });

    it('should convert 16:30 Rome (14:30 UTC in summer) to 16.5', () => {
      const date = new Date('2025-07-10T14:30:00.000Z'); // 16:30 Rome
      expect(toHourDecimal(date)).toBe(16.5);
    });

    it('should convert 17:00 Rome (15:00 UTC in summer) to 17.0', () => {
      const date = new Date('2025-07-10T15:00:00.000Z'); // 17:00 Rome
      expect(toHourDecimal(date)).toBe(17.0);
    });

    it('should convert 22:30 Rome (20:30 UTC in summer) to 22.5', () => {
      const date = new Date('2025-07-10T20:30:00.000Z'); // 22:30 Rome
      expect(toHourDecimal(date)).toBe(22.5);
    });

    it('should convert 23:00 Rome (21:00 UTC in summer) to 23.0', () => {
      const date = new Date('2025-07-10T21:00:00.000Z'); // 23:00 Rome
      expect(toHourDecimal(date)).toBe(23.0);
    });

    it('should handle winter time: 16:00 Rome (15:00 UTC) to 16.0', () => {
      // Winter time: Rome is UTC+1
      const date = new Date('2025-01-10T15:00:00.000Z'); // 16:00 Rome
      expect(toHourDecimal(date)).toBe(16.0);
    });

    it('should handle winter time: 16:30 Rome (15:30 UTC) to 16.5', () => {
      const date = new Date('2025-01-10T15:30:00.000Z'); // 16:30 Rome
      expect(toHourDecimal(date)).toBe(16.5);
    });
  });

  describe('toDateStrRome - converts UTC timestamp to Rome date string', () => {
    it('should return same date for daytime slots', () => {
      const date = new Date('2025-07-10T14:00:00.000Z'); // 16:00 Rome, July 10
      expect(toDateStrRome(date)).toBe('2025-07-10');
    });

    it('should return same date for evening slots', () => {
      const date = new Date('2025-07-10T20:30:00.000Z'); // 22:30 Rome, July 10
      expect(toDateStrRome(date)).toBe('2025-07-10');
    });

    it('should handle date boundary: 23:00 Rome is still same day', () => {
      const date = new Date('2025-07-10T21:00:00.000Z'); // 23:00 Rome, July 10
      expect(toDateStrRome(date)).toBe('2025-07-10');
    });

    it('should handle midnight UTC being previous day in Rome (winter)', () => {
      // 00:00 UTC = 01:00 Rome (winter), so it's the same calendar day
      const date = new Date('2025-01-10T00:00:00.000Z'); // 01:00 Rome, Jan 10
      expect(toDateStrRome(date)).toBe('2025-01-10');
    });

    it('should handle late evening UTC being next day in Rome (summer)', () => {
      // 22:00 UTC = 00:00 Rome (summer), so it's the next calendar day
      const date = new Date('2025-07-10T22:00:00.000Z'); // 00:00 Rome, July 11
      expect(toDateStrRome(date)).toBe('2025-07-11');
    });
  });

  describe('getDayOfWeekRome - gets correct weekday in Rome timezone', () => {
    it('should return 0 for Sunday in Rome', () => {
      const date = new Date('2025-07-13T14:00:00.000Z'); // Sunday 16:00 Rome
      expect(getDayOfWeekRome(date)).toBe(0);
    });

    it('should return 1 for Monday in Rome', () => {
      const date = new Date('2025-07-14T14:00:00.000Z'); // Monday 16:00 Rome
      expect(getDayOfWeekRome(date)).toBe(1);
    });

    it('should return 6 for Saturday in Rome', () => {
      const date = new Date('2025-07-12T14:00:00.000Z'); // Saturday 16:00 Rome
      expect(getDayOfWeekRome(date)).toBe(6);
    });

    it('should handle day boundary: late Sunday UTC is Monday in Rome', () => {
      // Sunday 22:00 UTC = Monday 00:00 Rome (summer)
      const date = new Date('2025-07-13T22:00:00.000Z'); // Monday 00:00 Rome
      expect(getDayOfWeekRome(date)).toBe(1);
    });
  });

  describe('Integration: booking slot validation scenarios', () => {
    const OPEN_HOUR = 16;
    const CLOSE_HOUR = 23;

    it('should accept 16:00-16:30 booking (first slot of the day)', () => {
      const start = new Date('2025-07-10T14:00:00.000Z'); // 16:00 Rome
      const end = new Date('2025-07-10T14:30:00.000Z');   // 16:30 Rome
      
      const startHour = toHourDecimal(start);
      const endHour = toHourDecimal(end);
      
      expect(startHour).toBe(16.0);
      expect(endHour).toBe(16.5);
      expect(startHour >= OPEN_HOUR).toBe(true);
      expect(endHour <= CLOSE_HOUR).toBe(true);
    });

    it('should accept 16:30-17:00 booking', () => {
      const start = new Date('2025-07-10T14:30:00.000Z'); // 16:30 Rome
      const end = new Date('2025-07-10T15:00:00.000Z');   // 17:00 Rome
      
      const startHour = toHourDecimal(start);
      const endHour = toHourDecimal(end);
      
      expect(startHour).toBe(16.5);
      expect(endHour).toBe(17.0);
      expect(startHour >= OPEN_HOUR).toBe(true);
      expect(endHour <= CLOSE_HOUR).toBe(true);
    });

    it('should accept 22:30-23:00 booking (last slot of the day)', () => {
      const start = new Date('2025-07-10T20:30:00.000Z'); // 22:30 Rome
      const end = new Date('2025-07-10T21:00:00.000Z');   // 23:00 Rome
      
      const startHour = toHourDecimal(start);
      const endHour = toHourDecimal(end);
      
      expect(startHour).toBe(22.5);
      expect(endHour).toBe(23.0);
      expect(startHour >= OPEN_HOUR).toBe(true);
      expect(endHour <= CLOSE_HOUR).toBe(true);
    });

    it('should reject 15:30-16:00 booking (before opening)', () => {
      const start = new Date('2025-07-10T13:30:00.000Z'); // 15:30 Rome
      const end = new Date('2025-07-10T14:00:00.000Z');   // 16:00 Rome
      
      const startHour = toHourDecimal(start);
      
      expect(startHour).toBe(15.5);
      expect(startHour < OPEN_HOUR).toBe(true);
    });

    it('should reject 23:00-23:30 booking (after closing)', () => {
      const start = new Date('2025-07-10T21:00:00.000Z'); // 23:00 Rome
      const end = new Date('2025-07-10T21:30:00.000Z');   // 23:30 Rome
      
      const endHour = toHourDecimal(end);
      
      expect(endHour).toBe(23.5);
      expect(endHour > CLOSE_HOUR).toBe(true);
    });

    it('should verify same-day constraint for valid booking', () => {
      const start = new Date('2025-07-10T14:00:00.000Z'); // 16:00 Rome, July 10
      const end = new Date('2025-07-10T21:00:00.000Z');   // 23:00 Rome, July 10
      
      expect(toDateStrRome(start)).toBe('2025-07-10');
      expect(toDateStrRome(new Date(end.getTime() - 1))).toBe('2025-07-10');
      expect(toDateStrRome(start)).toBe(toDateStrRome(new Date(end.getTime() - 1)));
    });

    it('should detect cross-day booking attempt', () => {
      const start = new Date('2025-07-10T20:00:00.000Z'); // 22:00 Rome, July 10
      const end = new Date('2025-07-10T22:00:00.000Z');   // 00:00 Rome, July 11
      
      expect(toDateStrRome(start)).toBe('2025-07-10');
      expect(toDateStrRome(new Date(end.getTime() - 1))).toBe('2025-07-10');
      // end itself would be July 11
      expect(toDateStrRome(end)).toBe('2025-07-11');
    });
  });
});
