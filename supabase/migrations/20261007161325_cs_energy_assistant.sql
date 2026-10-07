-- Additive assistant storage. Existing CRM JSON, bookings and invoices are untouched.
-- All writes go through the authenticated server; neither anon nor authenticated
-- clients can mutate or read the approval ledger / PIN hashes directly.
create table public.cs_energy_assistant_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  phone_e164 text unique check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  pin_hash text,
  failed_pin_attempts integer not null default 0,
  pin_locked_until timestamptz,
  created_at timestamptz not null default now()
);
create table public.cs_energy_assistant_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.cs_energy_assistant_access(user_id) on delete cascade,
  channel text not null check (channel in ('web','phone')),
  provider_id text unique,
  transcript jsonb not null default '[]'::jsonb,
  turn_count integer not null default 0,
  pending_action_id uuid,
  phone_authenticated boolean not null default false,
  voice_nonce uuid not null default gen_random_uuid(),
  last_voice_nonce uuid,
  last_voice_response text,
  lock_until timestamptz,
  lock_token uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique(id,owner_user_id)
);
create table public.cs_energy_assistant_actions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.cs_energy_assistant_access(user_id) on delete cascade,
  session_id uuid not null,
  kind text not null check (kind in ('email','whatsapp')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','executing','submitted','failed','unknown','cancelled')),
  provider_id text,
  provider_status text,
  error text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_at timestamptz,
  completed_at timestamptz,
  foreign key(session_id,owner_user_id) references public.cs_energy_assistant_sessions(id,owner_user_id) on delete cascade
);
create table public.cs_energy_assistant_messages (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.cs_energy_assistant_access(user_id) on delete cascade,
  provider_id text not null unique,
  from_phone text not null,
  body text not null,
  received_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table public.cs_energy_assistant_rate_limits (
  owner_user_id uuid primary key references public.cs_energy_assistant_access(user_id) on delete cascade,
  bucket timestamptz not null,
  requests integer not null
);
create index cs_assistant_session_owner on public.cs_energy_assistant_sessions(owner_user_id,created_at desc);
create index cs_assistant_action_owner on public.cs_energy_assistant_actions(owner_user_id,created_at desc);
create index cs_assistant_action_session on public.cs_energy_assistant_actions(session_id,owner_user_id);
create index cs_assistant_action_provider on public.cs_energy_assistant_actions(provider_id) where provider_id is not null;
create index cs_assistant_message_owner on public.cs_energy_assistant_messages(owner_user_id,received_at desc);
create index cs_assistant_message_phone on public.cs_energy_assistant_messages(owner_user_id,from_phone,received_at desc);
alter table public.cs_energy_assistant_access enable row level security;
alter table public.cs_energy_assistant_sessions enable row level security;
alter table public.cs_energy_assistant_actions enable row level security;
alter table public.cs_energy_assistant_messages enable row level security;
alter table public.cs_energy_assistant_rate_limits enable row level security;
revoke all on public.cs_energy_assistant_access,public.cs_energy_assistant_sessions,
  public.cs_energy_assistant_actions,public.cs_energy_assistant_messages,public.cs_energy_assistant_rate_limits from public,anon,authenticated;
grant all on public.cs_energy_assistant_access,public.cs_energy_assistant_sessions,
  public.cs_energy_assistant_actions,public.cs_energy_assistant_messages,public.cs_energy_assistant_rate_limits to service_role;

create function public.cs_energy_assistant_rate(p_owner uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare hits integer;
begin
  insert into public.cs_energy_assistant_rate_limits(owner_user_id,bucket,requests)
  values(p_owner,date_trunc('minute',now()),1)
  on conflict(owner_user_id) do update set
    requests=case when cs_energy_assistant_rate_limits.bucket=date_trunc('minute',now()) then cs_energy_assistant_rate_limits.requests+1 else 1 end,
    bucket=date_trunc('minute',now()) returning requests into hits;
  return hits <= 30;
end; $$;
create function public.cs_energy_assistant_pin_attempt(p_owner uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare current_row public.cs_energy_assistant_access; attempts integer;
begin
  select * into current_row from public.cs_energy_assistant_access where user_id=p_owner and enabled for update;
  if not found then return false; end if;
  if current_row.pin_locked_until > now() then return false; end if;
  attempts=case when current_row.pin_locked_until is not null then 1 else current_row.failed_pin_attempts+1 end;
  update public.cs_energy_assistant_access set failed_pin_attempts=attempts,
    pin_locked_until=case when attempts >= 5 then now()+interval '15 minutes' else null end where user_id=p_owner;
  return attempts <= 5;
end; $$;
revoke all on function public.cs_energy_assistant_rate(uuid),public.cs_energy_assistant_pin_attempt(uuid) from public,anon,authenticated;
grant execute on function public.cs_energy_assistant_rate(uuid),public.cs_energy_assistant_pin_attempt(uuid) to service_role;
