export interface Subscription {
  id: string;
  provider_id: string;
  name: string;
  api_key_masked: string;
  base_url: string;
  model: string;
  api_format: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  admin_url: string;
  username: string;
  has_password: boolean;
}

export interface CreateSubscriptionInput {
  provider_id: string;
  name: string;
  api_key: string;
  base_url: string;
  model: string;
  api_format?: string;
  start_date: string | null;
  end_date: string | null;
  admin_url?: string;
  username?: string;
  password?: string;
}

export interface UpdateSubscriptionInput {
  provider_id?: string;
  name?: string;
  api_key?: string;
  base_url?: string;
  model?: string;
  api_format?: string;
  start_date?: string | null;
  end_date?: string | null;
  admin_url?: string;
  username?: string;
  /** Empty string clears the saved password; `undefined` leaves it unchanged. */
  password?: string;
}

export interface SubscriptionEndpoint {
  id: string;
  subscription_id: string;
  api_format: "openai" | "anthropic";
  base_url: string;
  model: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateEndpointInput {
  subscription_id: string;
  api_format: "openai" | "anthropic";
  base_url: string;
  model: string;
  is_default?: boolean;
}

export interface UpdateEndpointInput {
  api_format?: "openai" | "anthropic";
  base_url?: string;
  model?: string;
}
