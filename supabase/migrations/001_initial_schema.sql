create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  last_seen_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('text', 'image', 'video', 'sticker')),
  content text,
  reply_to_id uuid references public.messages(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  storage_path text not null,
  file_name text,
  mime_type text,
  file_size bigint,
  width integer,
  height integer,
  duration numeric,
  created_at timestamptz default now()
);

create table if not exists public.message_reads (
  message_id uuid references public.messages(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  read_at timestamptz default now(),
  unique (message_id, user_id)
);

create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at desc);
create index if not exists messages_sender_idx on public.messages(sender_id);
create index if not exists message_reads_message_user_idx on public.message_reads(message_id, user_id);
create index if not exists conversation_members_user_idx on public.conversation_members(user_id);
create index if not exists message_attachments_message_idx on public.message_attachments(message_id);

create or replace function public.is_conversation_member(conversation_uuid uuid, user_uuid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = conversation_uuid and cm.user_id = user_uuid
  );
$$;

create or replace function public.can_access_message(message_uuid uuid, user_uuid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.messages m
    where m.id = message_uuid and public.is_conversation_member(m.conversation_id, user_uuid)
  );
$$;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.message_reads enable row level security;

drop policy if exists "profiles select participants" on public.profiles;
create policy "profiles select participants" on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.conversation_members mine
    join public.conversation_members theirs on theirs.conversation_id = mine.conversation_id
    where mine.user_id = auth.uid() and theirs.user_id = profiles.id
  )
);

drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "conversations select members" on public.conversations;
create policy "conversations select members" on public.conversations for select to authenticated using (public.is_conversation_member(id, auth.uid()));

drop policy if exists "conversation_members select self conversations" on public.conversation_members;
create policy "conversation_members select self conversations" on public.conversation_members for select to authenticated using (public.is_conversation_member(conversation_id, auth.uid()));

drop policy if exists "messages select members" on public.messages;
create policy "messages select members" on public.messages for select to authenticated using (public.is_conversation_member(conversation_id, auth.uid()));

drop policy if exists "messages insert member sender" on public.messages;
create policy "messages insert member sender" on public.messages for insert to authenticated with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id, auth.uid()));

drop policy if exists "messages update own" on public.messages;
create policy "messages update own" on public.messages for update to authenticated using (sender_id = auth.uid() and public.is_conversation_member(conversation_id, auth.uid())) with check (sender_id = auth.uid());

drop policy if exists "attachments select message members" on public.message_attachments;
create policy "attachments select message members" on public.message_attachments for select to authenticated using (public.can_access_message(message_id, auth.uid()));

drop policy if exists "attachments insert own message" on public.message_attachments;
create policy "attachments insert own message" on public.message_attachments for insert to authenticated with check (
  exists (select 1 from public.messages m where m.id = message_id and m.sender_id = auth.uid() and public.is_conversation_member(m.conversation_id, auth.uid()))
);

drop policy if exists "reads select message members" on public.message_reads;
create policy "reads select message members" on public.message_reads for select to authenticated using (public.can_access_message(message_id, auth.uid()));

drop policy if exists "reads upsert self" on public.message_reads;
create policy "reads upsert self" on public.message_reads for insert to authenticated with check (user_id = auth.uid() and public.can_access_message(message_id, auth.uid()));

drop policy if exists "reads update self" on public.message_reads;
create policy "reads update self" on public.message_reads for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', false)
on conflict (id) do update set public = false;

drop policy if exists "media select members" on storage.objects;
create policy "media select members" on storage.objects for select to authenticated using (
  bucket_id = 'chat-media' and public.is_conversation_member((storage.foldername(name))[1]::uuid, auth.uid())
);

drop policy if exists "media insert members own folder" on storage.objects;
create policy "media insert members own folder" on storage.objects for insert to authenticated with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[2] = auth.uid()::text
  and public.is_conversation_member((storage.foldername(name))[1]::uuid, auth.uid())
);

drop publication if exists supabase_realtime;
create publication supabase_realtime for table public.messages, public.message_reads;
