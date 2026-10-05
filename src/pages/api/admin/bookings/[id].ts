import type { APIRoute } from 'astro';
import { waitUntil } from '@vercel/functions';
import sql from '../../../../lib/db';
import {
  sendUserApproved,
  sendUserConfirmed,
  sendUserRejected,
  sendUserRescheduled,
} from '../../../../lib/email';
import { MOCK_API } from '../../../../lib/config';
import { isOverlapViolation } from '../../../../lib/db-errors';

const ALLOWED_STATUSES = new Set(['pending', 'approved', 'confirmed', 'rejected']);

export const DELETE: APIRoute = async ({ params }) => {
  const { id } = params;

  if (MOCK_API) return new Response(JSON.stringify({ ok: true }), { status: 200 });

  const [booking] = await sql`
    SELECT id, slot_start FROM bookings WHERE id = ${id!}
  `;

  if (!booking) {
    return new Response(JSON.stringify({ error: 'Prenotazione non trovata' }), { status: 404 });
  }

  if (new Date(booking.slot_start as string) <= new Date()) {
    return new Response(JSON.stringify({ error: 'Non è possibile cancellare una prenotazione passata' }), { status: 400 });
  }

  await sql`DELETE FROM bookings WHERE id = ${id!}`;

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const { id } = params;

  let body: { status?: string; slot_start?: string; slot_end?: string; notify?: boolean };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON non valido' }), { status: 400 });
  }

  const { status, slot_start, slot_end, notify = true } = body;
  const wantsStatus = typeof status === 'string';
  const wantsTime = typeof slot_start === 'string' || typeof slot_end === 'string';

  if (!wantsStatus && !wantsTime) {
    return new Response(JSON.stringify({ error: 'Nessun dato da aggiornare' }), { status: 400 });
  }

  if (wantsStatus && !ALLOWED_STATUSES.has(status!)) {
    return new Response(JSON.stringify({ error: 'Stato non valido' }), { status: 400 });
  }

  let newStart: Date | null = null;
  let newEnd: Date | null = null;
  if (wantsTime) {
    if (!slot_start || !slot_end) {
      return new Response(JSON.stringify({ error: 'slot_start e slot_end sono entrambi obbligatori' }), { status: 400 });
    }
    newStart = new Date(slot_start);
    newEnd = new Date(slot_end);
    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime()) || newEnd <= newStart) {
      return new Response(JSON.stringify({ error: 'Intervallo slot non valido' }), { status: 400 });
    }
    if (newStart <= new Date()) {
      return new Response(JSON.stringify({ error: 'Non è possibile spostare la prenotazione nel passato' }), { status: 400 });
    }
  }

  if (MOCK_API) return new Response(JSON.stringify({ ok: true }), { status: 200 });

  const [existing] = await sql<{
    id: string; name: string; email: string;
    slot_start: Date; slot_end: Date; status: string;
  }[]>`
    SELECT id, name, email, slot_start, slot_end, status
    FROM bookings WHERE id = ${id!}
  `;
  if (!existing) {
    return new Response(JSON.stringify({ error: 'Prenotazione non trovata' }), { status: 404 });
  }

  const newStatus = wantsStatus ? status! : existing.status;
  const startToWrite = newStart ?? existing.slot_start;
  const endToWrite = newEnd ?? existing.slot_end;
  // Una prenotazione rifiutata non occupa lo slot: riattivarla equivale a prenotarlo di nuovo
  const reactivating = existing.status === 'rejected' && newStatus !== 'rejected';

  if (wantsTime || reactivating) {
    const [conflictBooking] = await sql`
      SELECT id FROM bookings
      WHERE slot_start < ${endToWrite} AND slot_end > ${startToWrite}
        AND status != 'rejected'
        AND id != ${id!}
      LIMIT 1
    `;
    if (conflictBooking) {
      return new Response(JSON.stringify({ error: 'Slot non disponibile (sovrapposizione con un\'altra prenotazione)' }), { status: 409 });
    }
    const [conflictBlocked] = await sql`
      SELECT id FROM blocked_slots
      WHERE slot_start < ${endToWrite} AND slot_end > ${startToWrite}
      LIMIT 1
    `;
    if (conflictBlocked) {
      return new Response(JSON.stringify({ error: 'Slot non disponibile (sovrapposizione con uno slot bloccato)' }), { status: 409 });
    }
  }

  let updated: { id: string; name: string; email: string; slot_start: Date; slot_end: Date; status: string };
  try {
    [updated] = await sql<typeof updated[]>`
      UPDATE bookings
      SET status = ${newStatus}, slot_start = ${startToWrite}, slot_end = ${endToWrite}
      WHERE id = ${id!}
      RETURNING id, name, email, slot_start, slot_end, status
    `;
  } catch (err) {
    if (isOverlapViolation(err)) {
      return new Response(JSON.stringify({ error: 'Slot non disponibile (sovrapposizione con un\'altra prenotazione)' }), { status: 409 });
    }
    throw err;
  }

  if (notify !== false) {
    const statusChanged = wantsStatus && status !== existing.status;
    const timeChanged = wantsTime && (
      new Date(existing.slot_start).getTime() !== startToWrite.getTime() ||
      new Date(existing.slot_end).getTime() !== endToWrite.getTime()
    );

    const payload = {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      slot_start: new Date(updated.slot_start).toISOString(),
      slot_end: new Date(updated.slot_end).toISOString(),
    };

    if (statusChanged) {
      // Status email already includes the (possibly updated) slot times via formatDateTime in the template.
      let emailPromise: Promise<void> | null = null;
      if (status === 'approved') emailPromise = sendUserApproved(payload);
      else if (status === 'confirmed') emailPromise = sendUserConfirmed(payload);
      else if (status === 'rejected') emailPromise = sendUserRejected(payload);
      // 'pending' has no template — silent
      if (emailPromise) {
        waitUntil(emailPromise.catch((err) => console.error('status email failed:', err)));
      }
    } else if (timeChanged) {
      waitUntil(
        sendUserRescheduled({
          ...payload,
          old_slot_start: new Date(existing.slot_start).toISOString(),
          old_slot_end: new Date(existing.slot_end).toISOString(),
        }).catch((err) => console.error('sendUserRescheduled failed:', err)),
      );
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
