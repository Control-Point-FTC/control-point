// Centralized Bruno (AI chat) domain types.
// These mirror the server's bruno_chats / bruno_messages tables and the
// /api/bruno/* responses so components don't redeclare them as `any`.

export type BrunoRole = 'user' | 'model';

export type BrunoPersona = 'bruno' | 'navgpt';

export interface BrunoChatMessage {
  id?: number;
  role: BrunoRole;
  text: string;
  created_at?: string;
}

/** One row from GET /api/bruno/chats (chat columns + owner + count). */
export interface BrunoChat {
  id: number;
  team_id: number;
  member_id: number;
  title: string | null;
  is_public: number;
  persona?: BrunoPersona | null;
  created_at: string;
  updated_at: string;
  owner_name?: string | null;
  message_count?: number;
}

export interface BrunoChatDetail extends BrunoChat {
  messages: BrunoChatMessage[];
}
