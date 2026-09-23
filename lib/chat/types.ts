export type MessageType = "text" | "image" | "video" | "video_note" | "sticker" | "voice" | "system";

export type CallType = "audio" | "video";
export type CallStatus = "ringing" | "accepted" | "declined" | "missed" | "cancelled" | "ended" | "failed";
export type Call = {
  id: string; conversation_id: string; caller_id: string; callee_id: string;
  type: CallType; status: CallStatus; started_at: string; answered_at: string | null;
  ended_at: string | null; created_at: string; updated_at: string;
};

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  last_seen_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type Story = {
  id: string;
  owner_id: string;
  conversation_id: string;
  storage_path: string;
  media_type: "image" | "video";
  caption: string | null;
  created_at: string;
  expires_at: string;
  signedUrl?: string;
  story_views?: Array<{ viewer_id: string; viewed_at: string }>;
  story_likes?: Array<{ user_id: string; created_at: string }>;
};

export type BackgroundProposal = {
  id: string;
  conversation_id: string;
  proposer_id: string;
  recipient_id: string;
  background_id: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  created_at: string;
  resolved_at: string | null;
};

export type Conversation = {
  id: string;
  created_at: string | null;
};

export type ConversationMember = {
  conversation_id: string;
  user_id: string;
  joined_at: string | null;
  profiles?: Profile | null;
};

export type Attachment = {
  id: string;
  message_id: string;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  created_at: string | null;
  signedUrl?: string | null;
};

export type MessageRead = {
  message_id: string;
  user_id: string;
  read_at: string | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  type: MessageType;
  content: string | null;
  reply_to_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  message_attachments?: Attachment[];
  message_reads?: MessageRead[];
  reply_to?: Message | null;
  /** Local-only delivery state for optimistic sends; never sent to the database. */
  pending?: "sending" | "failed" | null;
};
