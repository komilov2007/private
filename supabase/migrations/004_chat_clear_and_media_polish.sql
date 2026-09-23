-- Secure whole-chat history clearing. Apply after 003.
-- This migration never deletes conversations, members, profiles, contacts, stories,
-- backgrounds, avatars, or Storage objects. Exact message attachment paths are returned
-- to the authenticated client for deletion through the supported Storage API.

alter table public.conversations add column if not exists history_version bigint not null default 0;
alter table public.conversations add column if not exists history_cleared_at timestamptz;

create table if not exists public.message_media_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, storage_path)
);
create index if not exists message_media_cleanup_owner_idx on public.message_media_cleanup_jobs(owner_id, conversation_id, created_at);
alter table public.message_media_cleanup_jobs enable row level security;
drop policy if exists "media cleanup owner read" on public.message_media_cleanup_jobs;
create policy "media cleanup owner read" on public.message_media_cleanup_jobs for select to authenticated
  using (owner_id = auth.uid() and public.is_conversation_member(conversation_id, auth.uid()));
drop policy if exists "media cleanup owner delete" on public.message_media_cleanup_jobs;
create policy "media cleanup owner delete" on public.message_media_cleanup_jobs for delete to authenticated
  using (owner_id = auth.uid() and public.is_conversation_member(conversation_id, auth.uid()));
revoke all on table public.message_media_cleanup_jobs from anon, authenticated;
grant select, delete on public.message_media_cleanup_jobs to authenticated;

create or replace function public.clear_conversation_history(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paths text[] := array[]::text[];
  v_cleared_at timestamptz := clock_timestamp();
  v_version bigint;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Serialize clear operations for this conversation and verify it exists.
  perform 1 from public.conversations c where c.id = p_conversation_id for update;
  if not found or not public.is_conversation_member(p_conversation_id, auth.uid()) then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;

  insert into public.message_media_cleanup_jobs(conversation_id, owner_id, storage_path)
  select distinct p_conversation_id, m.sender_id, a.storage_path
  from public.message_attachments a
  join public.messages m on m.id = a.message_id
  where m.conversation_id = p_conversation_id and a.storage_path is not null
  on conflict (owner_id, storage_path) do nothing;

  select coalesce(array_agg(j.storage_path), array[]::text[]) into v_paths
  from public.message_media_cleanup_jobs j
  where j.conversation_id = p_conversation_id and j.owner_id = auth.uid();

  -- Preserve ringing/accepted rows so clearing history cannot terminate an active call.
  delete from public.calls c
  where c.conversation_id = p_conversation_id
    and c.status not in ('ringing', 'accepted');

  -- Reads and attachment metadata cascade from messages. Replies are part of the same history.
  delete from public.messages m where m.conversation_id = p_conversation_id;

  update public.conversations c
  set history_version = c.history_version + 1,
      history_cleared_at = v_cleared_at
  where c.id = p_conversation_id
  returning c.history_version into v_version;

  return jsonb_build_object(
    'storage_paths', to_jsonb(v_paths),
    'cleared_at', v_cleared_at,
    'history_version', v_version
  );
end;
$$;

revoke all on function public.clear_conversation_history(uuid) from public, anon;
grant execute on function public.clear_conversation_history(uuid) to authenticated;

-- One lightweight conversation UPDATE tells both clients and Home to reset history.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end $$;
