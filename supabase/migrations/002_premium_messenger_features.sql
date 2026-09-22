-- Premium messenger features: profiles bio, contacts, stories, shared backgrounds.
-- Safe to run once on top of 001. Re-running is also safe (idempotent guards).

alter table public.profiles add column if not exists bio text;

alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages add constraint messages_type_check
  check (type in ('text', 'image', 'video', 'sticker', 'voice', 'system'));

create table if not exists public.contacts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references auth.users(id) on delete cascade,
  nickname text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, contact_id),
  check (owner_id <> contact_id)
);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  storage_path text not null,
  media_type text not null check (media_type in ('image', 'video')),
  caption text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create table if not exists public.story_likes (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create table if not exists public.conversation_settings (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  shared_background text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.background_proposals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  proposer_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  background_id text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (proposer_id <> recipient_id)
);

create index if not exists stories_active_idx on public.stories(conversation_id, expires_at desc);
create index if not exists story_views_story_idx on public.story_views(story_id);
create index if not exists story_likes_story_idx on public.story_likes(story_id);
create index if not exists background_proposals_recipient_idx on public.background_proposals(recipient_id, status);

alter table public.contacts enable row level security;
alter table public.stories enable row level security;
alter table public.story_views enable row level security;
alter table public.story_likes enable row level security;
alter table public.conversation_settings enable row level security;
alter table public.background_proposals enable row level security;

-- A private nickname may only be saved for the other member of a shared conversation.
drop policy if exists "contacts owner access" on public.contacts;
create policy "contacts owner access" on public.contacts for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid() and exists (
      select 1 from public.conversation_members mine
      join public.conversation_members theirs on theirs.conversation_id = mine.conversation_id
      where mine.user_id = auth.uid() and theirs.user_id = contacts.contact_id
    )
  );

drop policy if exists "stories conversation read" on public.stories;
create policy "stories conversation read" on public.stories for select to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));
drop policy if exists "stories owner insert" on public.stories;
create policy "stories owner insert" on public.stories for insert to authenticated
  with check (
    owner_id = auth.uid()
    and public.is_conversation_member(conversation_id, auth.uid())
    and storage_path like conversation_id::text || '/' || owner_id::text || '/stories/%'
  );
drop policy if exists "stories owner delete" on public.stories;
create policy "stories owner delete" on public.stories for delete to authenticated using (owner_id = auth.uid());

-- Views are insert-only (clients use ON CONFLICT DO NOTHING), so no update policy is needed.
drop policy if exists "story views participants read" on public.story_views;
create policy "story views participants read" on public.story_views for select to authenticated using (
  exists (select 1 from public.stories s where s.id = story_views.story_id and public.is_conversation_member(s.conversation_id, auth.uid()))
);
drop policy if exists "story views self insert" on public.story_views;
create policy "story views self insert" on public.story_views for insert to authenticated with check (
  viewer_id = auth.uid() and exists (select 1 from public.stories s where s.id = story_views.story_id and public.is_conversation_member(s.conversation_id, auth.uid()))
);

drop policy if exists "story likes participants read" on public.story_likes;
create policy "story likes participants read" on public.story_likes for select to authenticated using (
  exists (select 1 from public.stories s where s.id = story_likes.story_id and public.is_conversation_member(s.conversation_id, auth.uid()))
);
drop policy if exists "story likes self insert" on public.story_likes;
create policy "story likes self insert" on public.story_likes for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from public.stories s where s.id = story_likes.story_id and public.is_conversation_member(s.conversation_id, auth.uid()))
);
drop policy if exists "story likes self delete" on public.story_likes;
create policy "story likes self delete" on public.story_likes for delete to authenticated using (user_id = auth.uid());

-- Shared settings are readable by both members. Writes only happen through
-- public.resolve_background_proposal(), so the shared background changes only when accepted.
drop policy if exists "conversation settings member read" on public.conversation_settings;
create policy "conversation settings member read" on public.conversation_settings for select to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));
drop policy if exists "conversation settings member update" on public.conversation_settings;

drop policy if exists "background proposals member read" on public.background_proposals;
create policy "background proposals member read" on public.background_proposals for select to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));
drop policy if exists "background proposals proposer insert" on public.background_proposals;
create policy "background proposals proposer insert" on public.background_proposals for insert to authenticated
  with check (
    proposer_id = auth.uid()
    and status = 'pending'
    and public.is_conversation_member(conversation_id, auth.uid())
    and public.is_conversation_member(conversation_id, recipient_id)
  );
-- Recipients accept/reject through resolve_background_proposal(); proposers may cancel their own pending proposal.
drop policy if exists "background proposals recipient update" on public.background_proposals;
drop policy if exists "background proposals proposer cancel" on public.background_proposals;
create policy "background proposals proposer cancel" on public.background_proposals for update to authenticated
  using (proposer_id = auth.uid() and status = 'pending')
  with check (proposer_id = auth.uid() and status = 'cancelled');

create or replace function public.resolve_background_proposal(p_proposal_id uuid, p_status text)
returns public.background_proposals
language plpgsql
security definer
-- Empty search_path: every object below is schema-qualified, so nothing can be shadowed.
set search_path = ''
as $$
declare
  v_proposal public.background_proposals;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_status not in ('accepted', 'rejected') then
    raise exception 'invalid status' using errcode = '22023';
  end if;

  select * into v_proposal from public.background_proposals where id = p_proposal_id for update;
  if not found
    or v_proposal.recipient_id <> auth.uid()
    or not public.is_conversation_member(v_proposal.conversation_id, auth.uid()) then
    raise exception 'proposal not found' using errcode = 'P0002';
  end if;
  if v_proposal.status <> 'pending' then
    raise exception 'proposal already resolved' using errcode = '55000';
  end if;

  update public.background_proposals
  set status = p_status, resolved_at = now()
  where id = p_proposal_id
  returning * into v_proposal;

  if p_status = 'accepted' then
    insert into public.conversation_settings (conversation_id, shared_background, updated_by, updated_at)
    values (v_proposal.conversation_id, v_proposal.background_id, auth.uid(), now())
    on conflict (conversation_id) do update
      set shared_background = excluded.shared_background,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at;

    select display_name into v_name from public.profiles where id = auth.uid();
    insert into public.messages (conversation_id, sender_id, type, content)
    values (v_proposal.conversation_id, auth.uid(), 'system', coalesce(v_name, 'Suhbatdosh') || ' chat fonini yoqdi');
  end if;

  return v_proposal;
end;
$$;

revoke all on function public.resolve_background_proposal(uuid, text) from public, anon;
grant execute on function public.resolve_background_proposal(uuid, text) to authenticated;

-- System events are created by the database only, never inserted directly by a client.
drop policy if exists "messages insert member sender" on public.messages;
create policy "messages insert member sender" on public.messages for insert to authenticated with check (
  sender_id = auth.uid() and type <> 'system' and public.is_conversation_member(conversation_id, auth.uid())
);
-- Without this, a client could insert a text message and then UPDATE it into type='system',
-- or move it to another conversation. System events are also not editable/deletable by clients.
drop policy if exists "messages update own" on public.messages;
create policy "messages update own" on public.messages for update to authenticated
  using (sender_id = auth.uid() and type <> 'system' and public.is_conversation_member(conversation_id, auth.uid()))
  with check (sender_id = auth.uid() and type <> 'system' and public.is_conversation_member(conversation_id, auth.uid()));

drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "media update own folder" on storage.objects;
create policy "media update own folder" on storage.objects for update to authenticated
  using (bucket_id = 'chat-media' and (storage.foldername(name))[2] = auth.uid()::text)
  with check (bucket_id = 'chat-media' and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists "media delete own folder" on storage.objects;
create policy "media delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media' and (storage.foldername(name))[2] = auth.uid()::text);

-- Idempotent: adding a table that is already published would abort the migration.
-- messages and message_reads (from 001) are kept; nothing is removed.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'messages', 'message_reads', 'profiles', 'stories', 'story_views', 'story_likes',
    'background_proposals', 'conversation_settings'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

update public.profiles p
set display_name = 'Rahmatulloh', updated_at = now()
from auth.users u
where p.id = u.id and lower(u.email) = 'komilov@gmail.com' and p.display_name in ('Komil', 'Komilov');
