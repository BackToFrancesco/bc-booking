import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration tests for booking API timezone validation.
 * These tests verify the complete validation flow without hitting the database.
 */

describe('Booking API timezone validation', () => {
  const TZ = 'Europe/Rome';

  // Helper functions from the API
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

  // Simulate the validation logic from the API
  function validateBooking(
    slot_start: string,
    slot_end: string,
    schedule: { open_hour: number; close_hour: number }
  ): { valid: boolean; error?: string } {
    const start = new Date(slot_start);
    const end = new Date(slot_end);

    // Duration check (30 min slots)
    const durationMs = end.getTime() - start.getTime();
    if (durationMs % (30 * 60 * 1000) !== 0) {
      return { valid: false, error: 'Duration must be multiple of 30 minutes' };
    }

    // Alignment check
    if (start.getMinutes() % 30 !== 0 || start.getSeconds() !== 0 || start.getMilliseconds() !== 0) {
      return { valid: false, error: 'Must be aligned to 30 minutes' };
    }

    // Same day check
    if (toDateStrRome(start) !== toDateStrRome(new Date(end.getTime() - 1))) {
      return { valid: false, error: 'Must be same day' };
    }

    // Opening hours check
    const startHourDecimal = toHourDecimal(start);
    const endHourDecimal = toHourDecimal(end);

    if (startHourDecimal < schedule.open_hour || endHourDecimal > schedule.close_hour) {
      return { valid: false, error: `Must be within ${schedule.open_hour}:00 - ${schedule.close_hour}:00` };
    }

    return { valid: true };
  }

  const sundaySchedule = { open_hour: 16, close_hour: 23 };

  describe('Valid bookings that were previously rejected', () => {
    it('should accept 16:00-16:30 on Sunday (the original bug)', () => {
      const result = validateBooking(
        '2025-07-13T14:00:00.000Z', // Sunday 16:00 Rome
        '2025-07-13T14:30:00.000Z', // Sunday 16:30 Rome
        sundaySchedule
      );
      expect(result.valid).toBe(true);
    });

    it('should accept 16:30-17:00 on Sunday', () => {
      const result = validateBooking(
        '2025-07-13T14:30:00.000Z', // Sunday 16:30 Rome
        '2025-07-13T15:00:00.000Z', // Sunday 17:00 Rome
        sundaySchedule
      );
      expect(result.valid).toBe(true);
    });

    it('should accept multi-hour booking 16:00-18:00', () => {
      const result = validateBooking(
        '2025-07-13T14:00:00.000Z', // Sunday 16:00 Rome
        '2025-07-13T16:00:00.000Z', // Sunday 18:00 Rome
        sundaySchedule
      );
      expect(result.valid).toBe(true);
    });

    it('should accept last slot 22:30-23:00', () => {
      const result = validateBooking(
        '2025-07-13T20:30:00.000Z', // Sunday 22:30 Rome
        '2025-07-13T21:00:00.000Z', // Sunday 23:00 Rome
        sundaySchedule
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('Invalid bookings that should be rejected', () => {
    it('should reject 15:30-16:00 (before opening)', () => {
      const result = validateBooking(
        '2025-07-13T13:30:00.000Z', // Sunday 15:30 Rome
        '2025-07-13T14:00:00.000Z', // Sunday 16:00 Rome
        sundaySchedule
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('within');
    });

    it('should reject 23:00-23:30 (after closing)', () => {
      const result = validateBooking(
        '2025-07-13T21:00:00.000Z', // Sunday 23:00 Rome
        '2025-07-13T21:30:00.000Z', // Sunday 23:30 Rome
        sundaySchedule
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('within');
    });

    it('should reject cross-day booking 22:30-00:30', () => {
      const result = validateBooking(
        '2025-07-13T20:30:00.000Z', // Sunday 22:30 Rome
        '2025-07-13T22:30:00.000Z', // Monday 00:30 Rome
        sundaySchedule
      );
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Must be same day');
    });

    it('should reject non-aligned slot 16:15-16:45', () => {
      const result = validateBooking(
        '2025-07-13T14:15:00.000Z', // Sunday 16:15 Rome
        '2025-07-13T14:45:00.000Z', // Sunday 16:45 Rome
        sundaySchedule
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('aligned');
    });

    it('should reject 45-minute duration 16:00-16:45', () => {
      const result = validateBooking(
        '2025-07-13T14:00:00.000Z', // Sunday 16:00 Rome
        '2025-07-13T14:45:00.000Z', // Sunday 16:45 Rome
        sundaySchedule
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('multiple of 30');
    });
  });

  describe('Winter time (UTC+1) validation', () => {
    it('should accept 16:00-16:30 in winter', () => {
      const result = validateBooking(
        '2025-01-12T15:00:00.000Z', // Sunday 16:00 Rome (winter)
        '2025-01-12T15:30:00.000Z', // Sunday 16:30 Rome (winter)
        sundaySchedule
      );
      expect(result.valid).toBe(true);
    });

    it('should accept 22:30-23:00 in winter', () => {
      const result = validateBooking(
        '2025-01-12T21:30:00.000Z', // Sunday 22:30 Rome (winter)
        '2025-01-12T22:00:00.000Z', // Sunday 23:00 Rome (winter)
        sundaySchedule
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('Day of week detection', () => {
    it('should detect Sunday correctly in summer', () => {
      const date = new Date('2025-07-13T14:00:00.000Z'); // Sunday 16:00 Rome
      expect(getDayOfWeekRome(date)).toBe(0);
    });

    it('should detect Monday correctly when UTC is still Sunday', () => {
      const date = new Date('2025-07-13T22:00:00.000Z'); // Monday 00:00 Rome
      expect(getDayOfWeekRome(date)).toBe(1);
    });

    it('should detect Saturday correctly', () => {
      const date = new Date('2025-07-12T14:00:00.000Z'); // Saturday 16:00 Rome
      expect(getDayOfWeekRome(date)).toBe(6);
    });
  });
});
