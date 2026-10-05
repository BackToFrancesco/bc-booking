import { vi } from 'vitest';
import type { APIRoute } from 'astro';
import { romeDateTime } from '../lib/rome';

/** "Adesso" nei test: lunedì 5 ottobre 2026, 10:00 a Roma. */
export const NOW = romeDateTime('2026-10-05', 10);
export const WED = '2026-10-07'; // mercoledì: aperto 18–23

export function freezeTime(at: Date = NOW) {
  vi.useFakeTimers({ toFake: ['Date'], now: at });
}

/** Slot in ora di Roma: `dateStr` alle h:m per `minutes` minuti, come lo manda il browser (ISO UTC). */
export function slot(dateStr: string, h: number, m = 0, minutes = 60) {
  const start = romeDateTime(dateStr, h, m);
  const end = new Date(start.getTime() + minutes * 60_000);
  return { slot_start: start.toISOString(), slot_end: end.toISOString() };
}

export function cookieJar(initial: Record<string, string> = {}) {
  const jar = new Map(Object.entries(initial));
  return {
    get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
    set: vi.fn((name: string, value: string) => void jar.set(name, value)),
    delete: vi.fn((name: string) => void jar.delete(name)),
    jar,
  };
}

/** Chiama una rotta Astro come farebbe il server. */
export async function call(
  handler: APIRoute,
  opts: { body?: unknown; params?: Record<string, string>; method?: string; url?: string; cookies?: ReturnType<typeof cookieJar> } = {},
) {
  const url = opts.url ?? 'http://localhost/api/test';
  const request = new Request(url, {
    method: opts.method ?? 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body === undefined ? undefined : typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body),
  });
  const res = await handler({
    request,
    params: opts.params ?? {},
    url: new URL(url),
    cookies: opts.cookies ?? cookieJar(),
  } as any);
  return { status: res.status, body: await res.json().catch(() => null) };
}
