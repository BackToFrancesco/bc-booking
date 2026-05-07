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
      <p><strong>Durata:</strong> ${slots} × 30 min</p>
      <p><strong>Totale:</strong> €${total}</p>
      <p><strong>ID prenotazione:</strong> <code>${booking.id}</code></p>
      <p>Vai alla <a href="${import.meta.env.SITE_URL ?? 'http://localhost:4321'}/admin">pagina admin</a> per approvare o rifiutare.</p>
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
  const paypalLink = `https://www.paypal.me/${handle}/${total}`;

  await transport.sendMail({
    from: import.meta.env.GMAIL_USER,
    to: booking.email,
    subject: `BC Beach Volley — Prenotazione approvata — ${formatDate(booking.slot_start)}`,
    html: `
      <h2>La tua prenotazione è stata approvata!</h2>
      <p>Ciao ${booking.name},</p>
      <p><strong>Orario:</strong> ${formatDateTime(booking.slot_start)} – ${formatTime(booking.slot_end)}</p>
      <p><strong>Totale da pagare:</strong> €${total} (${slots} × €${price})</p>
      <p>
        Completa la prenotazione effettuando il pagamento via PayPal:<br>
        <a href="${paypalLink}" style="background:#0070ba;color:white;padding:10px 20px;border-radius:4px;text-decoration:none;display:inline-block;margin-top:10px;">
          Paga €${total} con PayPal
        </a>
      </p>
      <p style="font-size:0.9em;color:#666;">
        Nella causale inserisci il tuo nome e il codice: <code>${booking.id.slice(0, 8)}</code>
      </p>
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
