-- message_reads is published through supabase_realtime and is deleted by cascade
-- when chat history is cleared. Its nullable unique columns cannot serve as a
-- replica identity, so PostgreSQL needs the full old row for published deletes.
alter table public.message_reads replica identity full;
