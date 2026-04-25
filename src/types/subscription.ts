export interface Subscription {
  id: string;
  provider_id: string;
  name: string;
  api_key_masked: string;
  base_url: string;
  model: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSubscriptionInput {
  provider_id: string;
  name: string;
  api_key: string;
  base_url: string;
  model: string;
  start_date: string | null;
  end_date: string | null;
}

export interface UpdateSubscriptionInput {
  provider_id?: string;
  name?: string;
  api_key?: string;
  base_url?: string;
  model?: string;
  start_date?: string | null;
  end_date?: string | null;
}
