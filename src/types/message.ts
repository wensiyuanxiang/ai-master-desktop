export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface StreamChunk {
  conversation_id: string;
  content_delta: string;
  is_complete: boolean;
  error: string | null;
}
