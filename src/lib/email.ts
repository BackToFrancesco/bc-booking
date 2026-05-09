import nodemailer from 'nodemailer';
import { SLOT_DURATION_MINUTES } from './slots';

function getTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: import.meta.env.GMAIL_USER,
      pass: import.meta.env.GMAIL_APP_PASSWORD,
    },
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', {
    weekday: 'long', day: '2-digit', month: 'long',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Rome',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    timeZone: 'Europe/Rome',
  });
}

function nSlots(slot_start: string, slot_end: string): number {
  const ms = new Date(slot_end).getTime() - new Date(slot_start).getTime();
  return Math.round(ms / (SLOT_DURATION_MINUTES * 60 * 1000));
}

export async function sendAdminNewBooking(booking: {
  id: string;
  name: string;
  email: string;
  phone?: string;
  slot_start: string;
  slot_end: string;
}) {
  const transport = getTransport();
  const slots = nSlots(booking.slot_start, booking.slot_end);
  const price = Number(import.meta.env.BOOKING_PRICE ?? 10);
  const total = slots * price;

  await transport.sendMail({
    from: import.meta.env.GMAIL_USER,
    to: import.meta.env.ADMIN_EMAIL,
    subject: `BC Beach Volley — Nuova prenotazione — ${booking.name} — ${formatDate(booking.slot_start)}`,
    html: `
      <h2>Nuova richiesta di prenotazione</h2>
      <p><strong>Nome:</strong> ${booking.name}</p>
      <p><strong>Email:</strong> ${booking.email}</p>
      <p><strong>Telefono:</strong> ${booking.phone ?? 'Non fornito'}</p>
      <p><strong>Slot:</strong> ${formatDateTime(booking.slot_start)} – ${formatTime(booking.slot_end)}</p>
      <p><strong>Durata:</strong> ${slots * 30} min</p>
      <p><strong>Totale:</strong> €${total}</p>
      <p><strong>ID prenotazione:</strong> <code>${booking.id}</code></p>
      <p>Vai alla <a href="${import.meta.env.SITE_URL ?? 'https://bc-booking.vercel.app'}/admin">pagina admin</a> per approvare o rifiutare.</p>
    `,
  });
}

export async function sendUserApproved(booking: {
  id: string;
  name: string;
  email: string;
  slot_start: string;
  slot_end: string;
}) {
  const transport = getTransport();
  const slots = nSlots(booking.slot_start, booking.slot_end);
  const price = Number(import.meta.env.BOOKING_PRICE ?? 10);
  const total = slots * price;
  const handle = import.meta.env.PAYPAL_ME_HANDLE;
  if (!handle) throw new Error('PAYPAL_ME_HANDLE env var is required');
  const paypalLink = `https://www.paypal.me/${handle}`;

  await transport.sendMail({
    from: import.meta.env.GMAIL_USER,
    to: booking.email,
    subject: `BC Beach Volley — Prenotazione approvata — ${formatDate(booking.slot_start)}`,
    html: `
      <h2>La tua prenotazione è stata approvata!</h2>
      <p>Ciao ${booking.name},</p>
      <p><strong>Orario:</strong> ${formatDateTime(booking.slot_start)} – ${formatTime(booking.slot_end)}</p>
      <p><strong>Totale da pagare:</strong> €${total} (€${price} / 30 min)</p>
      <p style="background:#fff3cd;border-left:4px solid #f59e0b;padding:0.7rem 1rem;border-radius:4px;margin-bottom:0.75rem;">
        ⚠️ <strong>Importante:</strong> nella causale del pagamento inserisci il tuo nome e il codice <strong>${booking.id.slice(0, 8)}</strong>
      </p>
      <p>
        Completa la prenotazione inviando <strong>€${total}</strong> via PayPal a
        <a href="${paypalLink}">paypal.me/${handle}</a> — inserisci tu l'importo e la causale con nome e codice.<br>
        <a href="${paypalLink}" style="background:#0070ba;color:white;padding:10px 20px;border-radius:4px;text-decoration:none;display:inline-block;margin-top:10px;">
          Paga con PayPal
        </a>
      </p>
      <p>A presto,<br>Basket Conselve</p>
    `,
  });
}

export async function sendUserConfirmed(booking: {
  id: string;
  name: string;
  email: string;
  slot_start: string;
  slot_end: string;
}) {
  const transport = getTransport();

  await transport.sendMail({
    from: import.meta.env.GMAIL_USER,
    to: booking.email,
    subject: `BC Beach Volley — Pagamento confermato — ${formatDate(booking.slot_start)}`,
    html: `
      <h2>Pagamento ricevuto, prenotazione confermata!</h2>
      <p>Ciao ${booking.name},</p>
      <p>Abbiamo ricevuto il tuo pagamento. La prenotazione è confermata.</p>
      <p><strong>Orario:</strong> ${formatDateTime(booking.slot_start)} – ${formatTime(booking.slot_end)}</p>
      <p style="background:#fffbeb;border-left:3px solid #f59e0b;padding:0.6rem 0.9rem;font-size:0.95em;">
        <strong>⚠️ Importante:</strong> Non sono disponibili le docce interne. È presente un doccino esterno per togliersi la sabbia.
      </p>
      <p>Ti aspettiamo in campo. Buon divertimento!</p>
      <p style="font-size:0.9em;color:#666;">
        Codice prenotazione: <code>${booking.id.slice(0, 8)}</code>
      </p>
      <p>A presto,<br>Basket Conselve</p>
    `,
  });
}

export async function sendUserRescheduled(booking: {
  id: string;
  name: string;
  email: string;
  slot_start: string;
  slot_end: string;
  old_slot_start: string;
  old_slot_end: string;
}) {
  const transport = getTransport();

  await transport.sendMail({
    from: import.meta.env.GMAIL_USER,
    to: booking.email,
    subject: `BC Beach Volley — Orario aggiornato — ${formatDate(booking.slot_start)}`,
    html: `
      <h2>Il tuo orario è stato aggiornato</h2>
      <p>Ciao ${booking.name},</p>
      <p>L'orario della tua prenotazione è stato modificato:</p>
      <p>
        <strong>Vecchio orario:</strong> <s>${formatDateTime(booking.old_slot_start)} – ${formatTime(booking.old_slot_end)}</s><br />
        <strong>Nuovo orario:</strong> ${formatDateTime(booking.slot_start)} – ${formatTime(booking.slot_end)}
      </p>
      <p>Lo stato della prenotazione e l'eventuale pagamento restano validi.</p>
      <p style="font-size:0.9em;color:#666;">
        Codice prenotazione: <code>${booking.id.slice(0, 8)}</code>
      </p>
      <p>Per qualsiasi necessità, rispondi a questa email.</p>
      <p>A presto,<br>Basket Conselve</p>
    `,
  });
}

export async function sendUserRejected(booking: {
  id: string;
  name: string;
  email: string;
  slot_start: string;
  slot_end: string;
}) {
  const transport = getTransport();

  await transport.sendMail({
    from: import.meta.env.GMAIL_USER,
    to: booking.email,
    subject: `BC Beach Volley — Aggiornamento prenotazione — ${formatDate(booking.slot_start)}`,
    html: `
      <h2>Aggiornamento sulla tua prenotazione</h2>
      <p>Ciao ${booking.name},</p>
      <p>Purtroppo non è stato possibile confermare la tua richiesta per lo slot del ${formatDateTime(booking.slot_start)} – ${formatTime(booking.slot_end)}.</p>
      <p>Puoi effettuare una nuova prenotazione su un altro orario.</p>
      <p>Per informazioni, contattaci rispondendo a questa email.</p>
      <p>A presto,<br>Basket Conselve</p>
    `,
  });
}
