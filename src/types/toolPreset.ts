export interface ToolPreset {
  id: string;
  tool_name: string;
  subscription_id: string;
  subscription_name: string;
  endpoint_id: string | null;
  endpoint_label: string | null;
  api_format: string;
  base_url: string;
  model: string;
  rendered_json: string;
  is_overridden: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ToolActiveStateView {
  tool_name: string;
  active_subscription_id: string | null;
  active_subscription_name: string | null;
  active_endpoint_id: string | null;
  active_endpoint_label: string | null;
  active_preset_id: string | null;
  applied_at: string | null;
  live_json: string | null;
  preset_rendered_json: string | null;
  in_sync: boolean;
  preset_overridden: boolean;
}
