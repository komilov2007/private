-- DANGER: THIS DELETES CHAT CONTENT FOR THE APP'S ONE EXISTING PRIVATE CONVERSATION.
-- It deletes call records and messages (message_reads and message_attachments cascade).
-- It preserves auth users, profiles, conversations, conversation_members, contacts,
-- stories, conversation settings, proposals, schema, policies, and all Storage objects.
-- Review the selected conversation and take a backup before running. DO NOT run automatically.
-- Deleted database attachment rows do not delete private `chat-media` objects. Message,
-- voice, and video-note files can therefore become orphaned. Safest optional cleanup:
-- export the deleted attachment storage_path values before this transaction, review them,
-- then remove only those exact paths through an authenticated/admin Storage API job.
-- Never recursively empty `chat-media`: it also contains avatars and stories.

begin;

do $$
declare
  v_conversation_id uuid;
  v_count integer;
begin
  select count(*) into v_count from public.conversations;

  if v_count <> 1 then
    raise exception 'Expected exactly one private conversation, found %. Nothing deleted.', v_count;
  end if;

  select id into v_conversation_id from public.conversations limit 1;

  if (select count(*) from public.conversation_members where conversation_id = v_conversation_id) <> 2 then
    raise exception 'Expected exactly two conversation members. Nothing deleted.';
  end if;

  -- Calls have no message dependency and are intentionally cleared with chat history.
  if to_regclass('public.calls') is not null then
    execute 'delete from public.calls where conversation_id = $1' using v_conversation_id;
  end if;

  -- FK cascades remove message_reads and message_attachments. Reply FKs become null.
  delete from public.messages where conversation_id = v_conversation_id;
end $$;

commit;
