export interface Conversation {
  id: string;
  title: string;
  subscription_id: string | null;
  role_id: string | null;
  working_directory: string;
  created_at: string;
  updated_at: string;
}

export interface CreateConversationInput {
  subscription_id?: string;
  role_id?: string;
  working_directory?: string;
}
