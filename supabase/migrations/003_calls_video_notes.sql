-- Round video messages and secured one-to-one call state.
-- Apply after 001 and 002. Safe to re-run; never replaces the realtime publication.

-- Validate the replacement before removing the production constraint. If an unexpected
-- legacy value exists, migration execution stops while the old constraint is still intact.
alter table public.messages drop constraint if exists messages_type_check_003;
alter table public.messages add constraint messages_type_check_003
  check (type in ('text', 'image', 'video', 'video_note', 'sticker', 'voice', 'system')) not valid;
alter table public.messages validate constraint messages_type_check_003;
alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages rename constraint messages_type_check_003 to messages_type_check;

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('audio', 'video')),
  status text not null default 'ringing' check (status in ('ringing', 'accepted', 'declined', 'missed', 'cancelled', 'ended', 'failed')),
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (caller_id <> callee_id)
);

create index if not exists calls_conversation_created_idx on public.calls(conversation_id, created_at desc, id desc);
create index if not exists calls_callee_status_idx on public.calls(callee_id, status, created_at desc);
-- The RPC's pre-insert check provides a friendly error; this index closes the
-- concurrent check-then-insert race at the database level.
create unique index if not exists calls_one_active_per_conversation_idx
  on public.calls(conversation_id) where status in ('ringing', 'accepted');
alter table public.calls enable row level security;

drop policy if exists "calls participants read" on public.calls;
create policy "calls participants read" on public.calls for select to authenticated using (
  auth.uid() in (caller_id, callee_id)
  and public.is_conversation_member(conversation_id, auth.uid())
);

-- Writes are RPC-only. This prevents clients from choosing arbitrary participants or states.
revoke all on table public.calls from anon, authenticated;
grant select on public.calls to authenticated;

create or replace function public.create_private_call(p_conversation_id uuid, p_callee_id uuid, p_type text)
returns public.calls
language plpgsql security definer set search_path = ''
as $$
declare v_call public.calls;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_type not in ('audio', 'video') or p_callee_id = auth.uid() then
    raise exception 'invalid call' using errcode = '22023';
  end if;
  if not public.is_conversation_member(p_conversation_id, auth.uid())
     or not public.is_conversation_member(p_conversation_id, p_callee_id) then
    raise exception 'not a conversation participant' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.calls c where c.conversation_id = p_conversation_id
      and c.status in ('ringing', 'accepted')
  ) then raise exception 'call already active' using errcode = '55000'; end if;
  insert into public.calls(conversation_id, caller_id, callee_id, type)
  values (p_conversation_id, auth.uid(), p_callee_id, p_type) returning * into v_call;
  return v_call;
end $$;

create or replace function public.transition_private_call(p_call_id uuid, p_status text)
returns public.calls
language plpgsql security definer set search_path = ''
as $$
declare v_call public.calls;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_status not in ('accepted', 'declined', 'cancelled', 'ended', 'failed') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  select * into v_call from public.calls where id = p_call_id for update;
  if not found or auth.uid() not in (v_call.caller_id, v_call.callee_id) then
    raise exception 'call not found' using errcode = 'P0002';
  end if;
  if v_call.status = p_status then return v_call; end if;
  if not (
    (v_call.status = 'ringing' and p_status = 'accepted' and auth.uid() = v_call.callee_id) or
    (v_call.status = 'ringing' and p_status = 'declined' and auth.uid() = v_call.callee_id) or
    (v_call.status = 'ringing' and p_status = 'cancelled' and auth.uid() = v_call.caller_id) or
    (v_call.status = 'ringing' and p_status = 'failed' and auth.uid() = v_call.caller_id) or
    (v_call.status = 'accepted' and p_status in ('ended', 'failed'))
  ) then raise exception 'invalid call transition' using errcode = '55000'; end if;
  update public.calls set status = p_status, updated_at = now(),
    answered_at = case when p_status = 'accepted' then now() else answered_at end,
    ended_at = case when p_status in ('declined','missed','cancelled','ended','failed') then now() else ended_at end
  where id = p_call_id returning * into v_call;
  return v_call;
end $$;

revoke all on function public.create_private_call(uuid, uuid, text) from public, anon;
revoke all on function public.transition_private_call(uuid, text) from public, anon;
grant execute on function public.create_private_call(uuid, uuid, text) to authenticated;
grant execute on function public.transition_private_call(uuid, text) to authenticated;

-- A participant may mark an abandoned ringing call missed after 40 seconds. This makes
-- timeout recovery work after refresh without trusting an immortal browser setTimeout.
create or replace function public.expire_private_call(p_call_id uuid)
returns public.calls language plpgsql security definer set search_path = ''
as $$
declare v_call public.calls;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into v_call from public.calls where id = p_call_id for update;
  if not found or auth.uid() not in (v_call.caller_id, v_call.callee_id) then
    raise exception 'call not found' using errcode = 'P0002';
  end if;
  if v_call.status = 'ringing' and v_call.created_at <= now() - interval '40 seconds' then
    update public.calls set status = 'missed', ended_at = now(), updated_at = now()
      where id = p_call_id returning * into v_call;
  end if;
  return v_call;
end $$;
revoke all on function public.expire_private_call(uuid) from public, anon;
grant execute on function public.expire_private_call(uuid) to authenticated;

-- Private Broadcast authorization for WebRTC offer/answer/ICE. Topic format is
-- calls:{conversation_uuid}; only members may send or receive signaling.
drop policy if exists "call members receive signaling" on realtime.messages;
create policy "call members receive signaling" on realtime.messages
for select to authenticated using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) ~ '^calls:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.is_conversation_member(split_part((select realtime.topic()), ':', 2)::uuid, auth.uid())
);
drop policy if exists "call members send signaling" on realtime.messages;
create policy "call members send signaling" on realtime.messages
for insert to authenticated with check (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) ~ '^calls:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.is_conversation_member(split_part((select realtime.topic()), ':', 2)::uuid, auth.uid())
);

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'calls'
  ) then alter publication supabase_realtime add table public.calls; end if;
end $$;
