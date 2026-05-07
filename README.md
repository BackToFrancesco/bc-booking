# BC Beach Volley Booking

Online booking system for the beach volley court of **Basket Conselve ASD**.

## Stack

Astro (SSR, Vercel adapter) · TypeScript · PostgreSQL (Neon) · FullCalendar v6 · Nodemailer (Gmail)

## Features

User-facing booking flow with calendar, multi-slot selection and live price preview. Admin panel with bookings management, drag-to-block slots and per-weekday hours config. Status flow: `pending → approved → confirmed`, with email notifications at each step and a PayPal.me link for payment.

## Setup

### Prerequisites
- Node.js >= 22.12
- PostgreSQL database (e.g. [Neon](https://neon.tech/))
- Gmail account with an [App Password](https://support.google.com/accounts/answer/185833)
- PayPal.me handle

### Install
```bash
git clone <repo-url>
cd bc-booking
npm install
cp .env.example .env       # fill in all values
psql $DATABASE_URL < schema.sql
npm run dev                # localhost:4321
```

> 💡 Set `MOCK_API = true` in `src/lib/config.ts` to develop without DB/email.

### Environment

```env
DATABASE_URL=postgresql://...
ADMIN_PASSWORD=...
ADMIN_EMAIL=...
GMAIL_USER=...
GMAIL_APP_PASSWORD=...      # 16 chars
PAYPAL_ME_HANDLE=...
BOOKING_PRICE=10            # € per 30-min slot
```

### Deploy
Preconfigured for Vercel. Connect the repo and set the env vars in the dashboard.

## Project layout

```
src/
├── pages/
│   ├── index.astro              # user page
│   ├── admin.astro              # admin panel
│   └── api/                     # slots, bookings, admin endpoints
├── lib/                         # db, email, slots, config, mock
└── middleware.ts                # admin auth
public/photos/                   # field photos (WebP)
schema.sql                       # DB schema
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the build |

## Notes

- UI in `Europe/Rome`, DB stores UTC (`TIMESTAMPTZ`).
- Slot duration is 30 minutes, hardcoded in `src/lib/slots.ts`.
- PayPal.me does not lock the amount: the admin must verify the received amount before confirming.
