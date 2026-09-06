-- ============================================================================
-- Benteen Events — initial schema, RLS, triggers, realtime.
--
-- Standalone e-vites: a host signs in, creates an event, designs an
-- invitation, sends it, and watches the RSVPs land. Guests never sign in —
-- they answer from their inbox with an opaque token.
--
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.
--
-- RLS is the authorization boundary. Every table is scoped to the host who
-- owns the row (or owns the event the row hangs off). The two public routes
-- (POST /api/rsvp, POST /api/webhooks/resend) have no session at all and run
-- below RLS with the service role, authenticated by the token / the Svix
-- signature instead. That is deliberate and is the ONLY thing that may do so.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- profiles: one row per auth user (a host), auto-created on signup.
-- There is no role column: a host's authority is ownership of their own rows,
-- so there is no privilege here for a user to escalate into.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- events: any kind of gathering. Owned by exactly one host.
create table public.events (
  id                uuid primary key default gen_random_uuid(),
  host_id           uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title             text not null check (length(trim(title)) > 0),
  -- Rich text from the editor. Sanitized before render and before it goes
  -- into an email — never inlined into HTML raw.
  description       text,
  event_date        date not null,
  -- null = all-day / time TBD.
  start_time        time,
  location          text,
  location_url      text,
  cover_image_url   text,
  -- The e-vite design (theme/accent/note/toggles). Untyped jsonb on purpose;
  -- always read through normalizeInviteOptions, which fills any gap.
  invite_options    jsonb,
  reminders_enabled boolean not null default true,
  created_at        timestamptz not null default now()
);
create index events_host_date_idx on public.events (host_id, event_date desc);

-- contacts: a host's reusable address book, so a guest list can be assembled
-- without retyping. Scoped per host — there is no global roster in this app.
create table public.contacts (
  id           uuid primary key default gen_random_uuid(),
  host_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  email        text not null,
  display_name text,
  created_at   timestamptz not null default now(),
  unique (host_id, email)
);
create index contacts_host_idx on public.contacts (host_id);

-- event_invites: the guest list for one event. This is the single source of
-- truth for who was invited AND what they answered — guests have no accounts,
-- so unlike a member-based app there is no second RSVP store to keep in sync.
create table public.event_invites (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  email         text not null,
  display_name  text,
  -- Opaque, unguessable token for the one-click RSVP link. DB-generated so it
  -- never depends on the client for its randomness.
  token         text not null unique default encode(gen_random_bytes(16), 'hex'),
  rsvp          text check (rsvp in ('going', 'maybe', 'no')),
  rsvp_at       timestamptz,
  -- Additional guests. The bound mirrors MAX_PLUS_ONES in shared/types/rsvp.ts.
  plus_ones     int not null default 0 check (plus_ones >= 0 and plus_ones <= 10),
  invited_by    uuid references public.profiles (id) on delete set null,
  -- Resend's id for this message, and the engagement stamps its webhook sets.
  resend_id     text,
  sent_at       timestamptz,
  delivered_at  timestamptz,
  opened_at     timestamptz,
  clicked_at    timestamptz,
  bounced_at    timestamptz,
  reminded_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (event_id, email)
);
create index event_invites_event_id_idx on public.event_invites (event_id);
create index event_invites_resend_id_idx on public.event_invites (resend_id);

-- comms_log: an audit trail of every blast, so a host can see what went out —
-- including the reminders the nightly cron sends that they never triggered.
create table public.comms_log (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid references public.events (id) on delete cascade,
  kind            text not null check (kind in ('invite', 'announcement', 'reminder')),
  scope           text,
  subject         text,
  recipient_count int not null default 0,
  failed_count    int not null default 0,
  status          text not null default 'sent' check (status in ('sent', 'partial', 'failed')),
  error           text,
  sent_by         uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index comms_log_event_id_idx on public.comms_log (event_id, created_at desc);

-- comms_templates: reusable announcement bodies, per host.
create table public.comms_templates (
  id         uuid primary key default gen_random_uuid(),
  host_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name       text not null,
  subject    text,
  body       text not null,
  created_at timestamptz not null default now(),
  unique (host_id, name)
);

-- host_settings: per-host preferences. reminder_days are the "days before the
-- event" checkpoints the cron fires on; an empty array turns reminders off.
create table public.host_settings (
  host_id       uuid primary key references public.profiles (id) on delete cascade,
  reminder_days int[] not null default '{7,3,1}',
  updated_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------

-- Does the current user host this event? SECURITY DEFINER so it reads `events`
-- without RLS and can't recurse through the policies that call it.
create function public.owns_event(target_event_id uuid) returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.events e
    where e.id = target_event_id and e.host_id = auth.uid()
  );
$$;
revoke all on function public.owns_event(uuid) from public;
grant execute on function public.owns_event(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Triggers
-- ----------------------------------------------------------------------------

-- Create a profile row from the OAuth metadata when a host first signs in.
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Normalize email keys so casing/whitespace can't create a duplicate contact
-- or let the same person be invited twice (BobX@x.com === bobx@x.com).
create function public.normalize_email() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;
create trigger contacts_normalize_email before insert or update on public.contacts
  for each row execute function public.normalize_email();
create trigger event_invites_normalize_email before insert or update on public.event_invites
  for each row execute function public.normalize_email();

-- Give every new host a settings row so the cron always finds their checkpoints.
create function public.handle_new_profile() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.host_settings (host_id) values (new.id) on conflict (host_id) do nothing;
  return new;
end;
$$;
create trigger on_profile_created after insert on public.profiles
  for each row execute function public.handle_new_profile();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.events          enable row level security;
alter table public.contacts        enable row level security;
alter table public.event_invites   enable row level security;
alter table public.comms_log       enable row level security;
alter table public.comms_templates enable row level security;
alter table public.host_settings   enable row level security;

grant select, insert, update, delete on public.events          to authenticated;
grant select, insert, update, delete on public.contacts        to authenticated;
grant select, insert, update, delete on public.event_invites   to authenticated;
grant select, insert                 on public.comms_log       to authenticated;
grant select, insert, update, delete on public.comms_templates to authenticated;
grant select, insert, update         on public.host_settings   to authenticated;
grant select, update                 on public.profiles        to authenticated;

-- profiles: you can see and edit yourself, and nobody else.
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- events: a host reads and writes only their own events.
create policy "events: host all" on public.events
  for all to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());

-- contacts: same.
create policy "contacts: host all" on public.contacts
  for all to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());

-- event_invites: reachable only through an event you host. This is what keeps
-- one host's guest list — email addresses and all — invisible to every other.
create policy "event_invites: host all" on public.event_invites
  for all to authenticated
  using (public.owns_event(event_id))
  with check (public.owns_event(event_id));

-- comms_log: append-only from the app's point of view; no update, no delete.
create policy "comms_log: host read" on public.comms_log
  for select to authenticated using (public.owns_event(event_id));
create policy "comms_log: host insert" on public.comms_log
  for insert to authenticated with check (public.owns_event(event_id));

create policy "comms_templates: host all" on public.comms_templates
  for all to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());

create policy "host_settings: read own" on public.host_settings
  for select to authenticated using (host_id = auth.uid());
create policy "host_settings: insert own" on public.host_settings
  for insert to authenticated with check (host_id = auth.uid());
create policy "host_settings: update own" on public.host_settings
  for update to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());

-- The service role backs exactly three things that have no session: the public
-- RSVP route, the Resend webhook, and the nightly reminder cron.
grant select, insert, update, delete on all tables in schema public to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

-- ----------------------------------------------------------------------------
-- Realtime — the guest-list and log views update live while a send is running.
-- ----------------------------------------------------------------------------

alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.contacts;
alter publication supabase_realtime add table public.event_invites;
alter publication supabase_realtime add table public.comms_log;
