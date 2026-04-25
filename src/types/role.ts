export interface Role {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  tags: string[];
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateRoleInput {
  name: string;
  description: string;
  system_prompt: string;
  tags: string[];
  is_pinned: boolean;
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
  system_prompt?: string;
  tags?: string[];
  is_pinned?: boolean;
}
