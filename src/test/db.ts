import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Postgres in memoria (PGlite) con lo schema vero del progetto, al posto di Neon.
// gen_random_uuid() è nativo da PG13, quindi l'estensione pgcrypto non serve.
const schema = readFileSync(resolve(__dirname, '../../schema.sql'), 'utf8')
  .replace(/CREATE EXTENSION[^;]*;/i, '');

const ready = (async () => {
  const db = await PGlite.create();
  await db.exec(schema);
  return db;
})();

/** Stessa interfaccia del tag `sql` di postgres.js usato dalle rotte (solo query parametrizzate). */
export async function sql(strings: TemplateStringsArray, ...values: unknown[]): Promise<any[]> {
  const db = await ready;
  const text = strings.reduce((acc, s, i) => acc + (i > 0 ? `$${i}` : '') + s, '');
  const res = await db.query(text, values as any[]);
  return res.rows as any[];
}

export async function resetDb(): Promise<void> {
  const db = await ready;
  await db.exec(`
    TRUNCATE bookings, blocked_slots;
    DELETE FROM day_schedules;
    INSERT INTO day_schedules (day_of_week, open_hour, close_hour) VALUES
      (0, 16, 23), (1, 18, 23), (2, 18, 23), (3, 18, 23), (4, 18, 23), (5, 18, 23), (6, 16, 23);
  `);
}

export async function insertBooking(
  slot: { slot_start: string; slot_end: string },
  status = 'pending',
  name = 'Mario Rossi',
): Promise<string> {
  const [row] = await sql`
    INSERT INTO bookings (name, email, phone, slot_start, slot_end, status)
    VALUES (${name}, ${'mario@example.com'}, ${'+393331234567'}, ${slot.slot_start}, ${slot.slot_end}, ${status})
    RETURNING id
  `;
  return row.id;
}

export async function insertBlock(slot: { slot_start: string; slot_end: string }, reason = 'Manutenzione'): Promise<string> {
  const [row] = await sql`
    INSERT INTO blocked_slots (slot_start, slot_end, reason)
    VALUES (${slot.slot_start}, ${slot.slot_end}, ${reason})
    RETURNING id
  `;
  return row.id;
}

export async function getBooking(id: string) {
  const [row] = await sql`SELECT * FROM bookings WHERE id = ${id}`;
  return row as { id: string; status: string; slot_start: Date; slot_end: Date } | undefined;
}

export async function countBookings(): Promise<number> {
  const [row] = await sql`SELECT count(*)::int AS n FROM bookings`;
  return row.n;
}
