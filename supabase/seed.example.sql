-- Replace these UUID values with the real IDs from Authentication -> Users.
begin;

with ids as (
  select
    '00000000-0000-0000-0000-000000000001'::uuid as komil_id,
    '00000000-0000-0000-0000-000000000002'::uuid as nilufar_id,
    gen_random_uuid() as conversation_id
),
new_conversation as (
  insert into public.conversations (id)
  select conversation_id from ids
  returning id
),
profiles_insert as (
  insert into public.profiles (id, display_name)
  select komil_id, 'Rahmatulloh' from ids
  union all
  select nilufar_id, 'Nilufar' from ids
  on conflict (id) do update set display_name = excluded.display_name
)
insert into public.conversation_members (conversation_id, user_id)
select conversation_id, komil_id from ids
union all
select conversation_id, nilufar_id from ids
on conflict do nothing;

commit;
