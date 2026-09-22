# CLAUDE.md — Benteen Events

## What is this project?

Standalone e-vites. A **host** signs in with Google, creates an **event**, designs
an **invitation**, sends it to a **guest list**, and tracks the **RSVPs**. Guests
never sign in — they answer from their inbox with an opaque token.

Extracted from the e-vite half of `~/code/benteen-screen` (a movie-night voting
app) and generalized. If you find anything that assumes movie nights — a poster,
a lineup, a vote, a club allowlist, a global admin role — it is a leftover to
remove, not a pattern to follow.

## ⚠️ Product Invariants — DO NOT VIOLATE

1. **RLS is the authorization boundary.** The model is ownership: every row
   belongs to a host, and `public.owns_event()` scopes the rows hanging off an
   event. `requireEventHost` in a server route is defense in depth, not the gate.
   Every new table, column, or access pattern needs a matching policy. Never relax
   a policy to make a feature work; tighten the feature instead.

2. **The Resend API key and the Supabase service-role key are server-only.** They
   live in `server/api/**` alone (`runtimeConfig.resendApiKey`,
   `serverSupabaseServiceRole`). The **anon key** (`SUPABASE_KEY`) is public by
   design — safe in the client, protected by RLS, not by secrecy.

3. **Only three routes may run below RLS**, because none of them has a session:
   `POST /api/rsvp` (authenticated by the guest's token), `POST
   /api/webhooks/resend` (by the Svix signature), and `GET /api/crons/reminders`
   (by the `CRON_SECRET` bearer token). Do not add a fourth without a reason of
   the same kind. Everything host-facing runs on the caller's own RLS-scoped
   client.

4. **The invite token is a credential.** It is DB-generated
   (`encode(gen_random_bytes(16), 'hex')`), unguessable, and grants exactly one
   power: answering that one invitation. Never widen what a token can do, never
   generate one client-side, and never put one in a log.

5. **The cron acts for every host at once.** It groups by host *before* selecting,
   sending, or digesting. That grouping is the only thing keeping one host's
   guests and summary from reaching another — treat it as load-bearing.

6. **Email HTML is built, never trusted.** `sanitizeEmailHtml` escapes everything
   then restores an allow-list of attribute-less tags; a tag with any attribute
   can never survive. Stored rich text rendered in the browser goes through
   `sanitizeHtml` (DOMPurify) instead. The two are not interchangeable.

7. **The preview and the send share one builder.** `buildEventInviteEmail` lives
   in `shared/` precisely so the design editor's `iframe srcdoc` and the server's
   outgoing mail are byte-identical. Do not fork it for either side.

## Tech Stack

- **Framework**: Nuxt 4 (Vue 3, `<script setup>`, TypeScript strict), `ssr: false`
- **UI**: Nuxt UI 4 (Tailwind v4 + Reka UI) — `U*` components, theme in `app/app.config.ts`
- **Backend**: Supabase — Auth (Google), Postgres + RLS, Realtime
- **Email**: Resend, via `server/utils/email.ts`
- **Testing**: Vitest (`@nuxt/test-utils`)
- **Deploy**: Vercel (SPA + serverless `/api`, cron in `vercel.json`)

## Common Commands

```bash
npm install
npm run dev          # http://localhost:3000
npm run build
npm run lint
npm run typecheck
npm test
```

## Project Structure

```
app/
├── components/      EventInviteManager (the centerpiece), ContactsComposer,
│                    EventAnnounceComposer, EventFormModal, RsvpRoster, …
├── composables/     useEvents, useEventInvites, useEventRsvps, useContacts,
│                    useCommsLog, useCommsTemplates, useHostSettings, …
├── pages/           index, login, confirm, events/, events/[id], people,
│                    settings, rsvp (public)
└── utils/           sanitize (DOMPurify, for v-html), datetime
server/
├── api/             events/[id]/invites/send, events/[id]/reminders/send,
│                    events/announce, contacts/bulk, rsvp, webhooks/resend,
│                    crons/reminders
└── utils/           auth (requireUser, requireEventHost), email (Resend
                     transport + batch orchestration), webhook, userId
shared/
├── types/           event, event-invite, contact, invite-options, rsvp, …
└── utils/           email (ALL the builders — pure, shared with the client),
                     roster (the paste parser), reminders (due-selection), …
supabase/migrations/ ⭐ schema + RLS + triggers — the authorization source of truth
```

## Architecture Notes

### Data model

```
profiles(id→auth.users, email, display_name, avatar_url)
events(id, host_id→profiles, title, description, event_date, start_time,
       location, location_url, cover_image_url, invite_options jsonb,
       reminders_enabled)
contacts(id, host_id→profiles, email, display_name)          unique(host_id, email)
event_invites(id, event_id→events, email, token, rsvp, plus_ones, resend_id,
              sent_at, delivered_at, opened_at, clicked_at, bounced_at,
              reminded_at)                                    unique(event_id, email)
comms_log(id, event_id, kind, scope, recipient_count, failed_count, status, error)
comms_templates(id, host_id, name, subject, body)             unique(host_id, name)
host_settings(host_id, reminder_days int[])
```

**`event_invites` is the single source of truth for both the invitation and the
answer.** The source app had two RSVP stores (a members table plus the e-vite
table) reconciled at read time and kept in step by a pair of triggers. Guests here
have no accounts, so that whole apparatus collapses into one table. Do not
reintroduce a second store.

### Sending

`server/utils/email.ts` owns the Resend transport. Two different Resend APIs, two
different limits, and they are easy to confuse:

- **Batch endpoint** — up to 100 *distinct* emails per request. Used for e-vites
  and reminders, because every recipient's token link differs.
- **Single send with BCC** — max 50 recipients across to + cc + bcc. We always set
  one `to`, so only **49** BCC fit. Used for announcements.

Both pace themselves between batches to stay under the rate limit.

Delivery is **at-least-once**: a batch is sent as a unit, and if Resend accepts it
but the stamp write then fails, those emails went out yet still read as unsent. The
returned `error` is the operator's signal that retrying may duplicate. A real fix
needs a transactional outbox.

### Realtime

`event_invites`, `comms_log`, `events`, and `contacts` are in the
`supabase_realtime` publication. On a change the composables re-query rather than
patching state — simple and reliable at this scale, and it means the tracker
updates itself while a blast is running.

## Conventions

- Vue 3 `<script setup lang="ts">` only. Composables for shared logic.
- Nuxt UI components over hand-rolled markup; theme via `app.config.ts`.
- Auto-imports are on — don't import `ref`, `computed`, components, or composables.
- Mobile-first; verify both viewports for any UI change.
- **Write click handlers as named functions, not inline assignments.**
  `@click="x = y"` evaluates to the assigned value, which a strict `vue-tsc`
  rejects against the `=> void` handler type. Prefer `@click="setX(y)"`.

## Code Standards

- **DRY**, **SRP**, small functions. If a function needs an "and" to describe it,
  split it.
- **Never over-engineer.** The minimum code that solves the problem correctly.
- **No dead code.** No TODOs without action.

## Testing

No PR is mergeable without tests for the behavior it changes. Follow the pyramid:
mostly unit, fewer integration, a handful of E2E on the critical paths.

- Test behavior, not implementation. A test that breaks on a rename tests the
  wrong thing.
- Mock at integration boundaries (the Supabase client, `$fetch`, Resend, time) —
  never your own collaborators.
- **A test that cannot fail is not a test.** Break the implementation once to
  confirm it fails.
- Name them like documentation: `it('lists a guest as no-reply only once an
  e-vite has actually been sent to them')`.
- RLS deserves integration coverage against Supabase local — policy bugs are
  exactly what unit tests cannot catch.

## Security

- RLS policies are the boundary (Invariant 1). Every table needs them.
- Never commit secrets. `.env` is gitignored; `.env.example` holds placeholders.
- Validate and sanitize at every boundary: request bodies (zod), pasted rosters,
  and especially stored rich text before it is rendered or emailed.
- Guest email addresses are the sensitive data here. A leak across hosts is the
  worst thing this app could do — which is what Invariants 1 and 5 exist to prevent.

## Deployment & infrastructure

Everything is code, split across three systems that deliberately do not overlap:

- **`infra/*.tf`** — provisioning only (Supabase + Vercel projects, settings, env
  vars, domain). Runs rarely.
- **`supabase/migrations/*.sql`** — schema, RLS, triggers. Every merge.
- **`supabase/config.toml`** — auth provider, site URL, redirect allow-list.
  Every merge.

Do not move schema into Terraform, and do not duplicate auth settings into
`supabase_settings.auth`. Terraform running rarely is what keeps a schema change
from being gated behind an apply, and two systems writing the same field fight.

CI/CD comes from [actions-toolkit](https://github.com/patrickisgreat/actions-toolkit)
by reference. Change the pipeline there, not here; this repo only supplies inputs.
The workflow refs are pinned to `@main` until the toolkit cuts a `v1` tag — move
them to `@v1` when it does.

**The Supabase Terraform provider exposes only `id` on `supabase_project`** — not
the anon key, service-role key, or URL. That is why bootstrapping is two applies,
and why the keys are input variables rather than resource reads. See
`infra/README.md` before changing anything there.

## Git Workflow

- Always work from a feature branch; never commit to `main` directly.
- **Many small logical commits per PR**, each one coherent, buildable, and
  independently revertible.
- Conventional messages: `feat:` `fix:` `refactor:` `test:` `chore:` `docs:`
  `perf:` `style:`. Say *what* and *why*, not *how*.
- Open PRs against `main` with `gh pr create`. The user reviews before merge.
- **NEVER add `Co-Authored-By` or "Generated with Claude Code".**
