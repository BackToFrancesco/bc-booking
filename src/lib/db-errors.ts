/** Violazione del vincolo `bookings_no_overlap` (exclusion_violation): lo slot è stato preso nel frattempo. */
export function isOverlapViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '23P01';
}
