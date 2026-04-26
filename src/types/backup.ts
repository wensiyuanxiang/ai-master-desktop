export interface ConfigBackup {
  id: string;
  tool_name: string;
  subscription_name: string;
  file_path: string;
  checksum: string;
  created_at: string;
  subscription_id: string | null;
  endpoint_id: string | null;
  preset_id: string | null;
}

export interface ConfigWriteResult {
  success: boolean;
  backup_id: string | null;
  content_written: string;
}

export interface ConfigFileContent {
  raw_json: string;
  api_key_field: string | null;
  base_url_field: string | null;
  model_field: string | null;
}

export interface ToolConfigInfo {
  tool_name: string;
  display_name: string;
  config_path: string;
  exists: boolean;
  current_subscription_name: string | null;
}
