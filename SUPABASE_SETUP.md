# Supabase Setup

1. Open Supabase Dashboard for your project.
2. Open SQL Editor.
3. Run `supabase/migrations/001_initial_schema.sql`.
3b. Run `supabase/migrations/002_premium_messenger_features.sql` (stories, contacts, shared backgrounds, bio, voice/system message types, realtime publication).
4. If the bucket was not created, open Storage and create a private bucket named `chat-media`.
5. Open Database -> Replication / Realtime and make sure `messages` and `message_reads` are enabled.
6. Open Authentication -> Users.
7. Create Komil's account manually with email and password.
8. Create Nilufar's account manually with email and password.
9. Copy both auth user UUIDs.
10. Open `supabase/seed.example.sql` and replace the two placeholder UUID values.
11. Run the edited seed SQL in Supabase SQL Editor.
12. Verify `conversation_members` has exactly two rows for the conversation.
13. In Vercel, add:
    - `NEXT_PUBLIC_SUPABASE_URL`
    - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
14. Deploy to Vercel.
15. Login on two different phones and test realtime chat.

Do not add a service role key to the frontend or Vercel public variables.
