# Benteen Events

Standalone e-vites. Create an event, design an invitation, send it to everyone at
once, and watch the RSVPs land. Your guests answer straight from their inbox —
no account, no password, one click.

Extracted from the e-vite half of [benteen-screen](https://github.com/patrickisgreat/benteen-screen),
generalized so it can front any event rather than one club's movie nights.

## What it does

- **Design the invitation.** Three themes, five accents, an optional cover image
  and personal note, with a live preview rendered by the exact same code that
  builds the email that gets sent.
- **Build the guest list.** Add people one at a time, paste a block of addresses,
  or pull in your saved contacts / last event's list in one click.
- **Send and track.** One-click RSVP buttons in the email, plus delivery, open,
  and click tracking fed back from Resend's webhook.
- **Chase the stragglers.** Automatic reminders on the day-count checkpoints you
  choose, or a manual "remind the non-responders" button.
- **Blast an update.** A rich-text announcement to everyone invited, only the
  people coming, or only the people who haven't answered.

## Stack

Nuxt 4 (Vue 3, `<script setup>`, TypeScript strict) · Nuxt UI 4 · Supabase
(Auth + Postgres + RLS + Realtime) · Resend · Vitest · Vercel.

Client-rendered (`ssr: false`); Nitro serves `/api/*` so the Resend and
service-role keys never reach the browser.

## Getting started

```bash
npm install
cp .env.example .env      # fill in Supabase + Resend
npm run dev               # http://localhost:3000
```

Apply the schema to a fresh Supabase project:

```bash
supabase db push          # or paste supabase/migrations/*.sql into the SQL editor
```

Then enable Google as an auth provider in the Supabase dashboard, and point a
Resend webhook at `https://<your-host>/api/webhooks/resend` for the delivery and
open tracking.

## Commands

```bash
npm run dev         # dev server
npm run build       # production build
npm run lint        # ESLint
npm run typecheck   # vue-tsc
npm test            # Vitest
```

## How authorization works

RLS is the boundary, and the model is ownership: every row belongs to a host, and
`owns_event()` scopes the rows that hang off an event. There is no admin role to
escalate into — a host can only ever reach their own events, guests, and contacts.

Exactly three things run below RLS with the service role, because none of them has
a session:

| Route | Authenticated by |
| --- | --- |
| `POST /api/rsvp` | the guest's opaque invite token |
| `POST /api/webhooks/resend` | the Svix signature |
| `GET /api/crons/reminders` | the `CRON_SECRET` bearer token |

The cron acts for every host at once, so it groups by host before doing anything —
that grouping is what keeps one host's guests and digest from reaching another.

## Notes

Delivery is **at-least-once, not exactly-once**. A batch is sent as a unit; if
Resend accepts it and the follow-up stamp write fails, those emails went out but
still read as unsent, so a retry re-delivers them. The `error` a send returns is
the signal that a blanket retry may duplicate. Fixing that properly needs a
transactional outbox.
