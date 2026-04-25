import { invoke } from "@tauri-apps/api/core";
import type { Provider } from "@/types/provider";
import type {
  Subscription,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
} from "@/types/subscription";
import type { Role, CreateRoleInput, UpdateRoleInput } from "@/types/role";
import type { Conversation, CreateConversationInput } from "@/types/conversation";
import type { Message } from "@/types/message";
import type {
  ConfigBackup,
  ConfigWriteResult,
  ConfigFileContent,
  ToolConfigInfo,
} from "@/types/backup";

// Provider
export async function listProviders(): Promise<Provider[]> {
  return invoke<Provider[]>("list_providers");
}

export async function createProvider(name: string): Promise<Provider> {
  return invoke<Provider>("create_provider", { name });
}

export async function deleteProvider(id: string): Promise<void> {
  return invoke<void>("delete_provider", { id });
}

// Subscription
export async function listSubscriptions(
  providerId?: string,
  search?: string
): Promise<Subscription[]> {
  return invoke<Subscription[]>("list_subscriptions", {
    providerId,
    search,
  });
}

export async function createSubscription(
  input: CreateSubscriptionInput
): Promise<Subscription> {
  return invoke<Subscription>("create_subscription", { input });
}

export async function updateSubscription(
  id: string,
  input: UpdateSubscriptionInput
): Promise<Subscription> {
  return invoke<Subscription>("update_subscription", { id, input });
}

export async function deleteSubscription(id: string): Promise<void> {
  return invoke<void>("delete_subscription", { id });
}

export async function setActiveSubscription(
  id: string
): Promise<Subscription> {
  return invoke<Subscription>("set_active_subscription", { id });
}

export async function getActiveSubscription(): Promise<Subscription | null> {
  return invoke<Subscription | null>("get_active_subscription");
}

// Role
export async function listRoles(
  search?: string,
  tag?: string
): Promise<Role[]> {
  return invoke<Role[]>("list_roles", { search, tag });
}

export async function createRole(input: CreateRoleInput): Promise<Role> {
  return invoke<Role>("create_role", { input });
}

export async function updateRole(
  id: string,
  input: UpdateRoleInput
): Promise<Role> {
  return invoke<Role>("update_role", { id, input });
}

export async function deleteRole(id: string): Promise<void> {
  return invoke<void>("delete_role", { id });
}

export async function togglePinRole(id: string): Promise<Role> {
  return invoke<Role>("toggle_pin_role", { id });
}

export async function importRoles(filePath: string): Promise<Role[]> {
  return invoke<Role[]>("import_roles", { filePath });
}

export async function exportRoles(
  filePath: string,
  roleIds?: string[]
): Promise<void> {
  return invoke<void>("export_roles", { filePath, roleIds });
}

// Conversation
export async function listConversations(
  search?: string
): Promise<Conversation[]> {
  return invoke<Conversation[]>("list_conversations", { search });
}

export async function createConversation(
  input: CreateConversationInput
): Promise<Conversation> {
  return invoke<Conversation>("create_conversation", { input });
}

export async function getConversation(id: string): Promise<Conversation> {
  return invoke<Conversation>("get_conversation", { id });
}

export async function updateConversation(
  id: string,
  fields: Partial<{
    title: string;
    subscription_id: string;
    role_id: string;
    working_directory: string;
  }>
): Promise<Conversation> {
  return invoke<Conversation>("update_conversation", { id, ...fields });
}

export async function renameConversation(
  id: string,
  title: string
): Promise<Conversation> {
  return invoke<Conversation>("rename_conversation", { id, title });
}

export async function deleteConversation(id: string): Promise<void> {
  return invoke<void>("delete_conversation", { id });
}

// Message
export async function listMessages(
  conversationId: string
): Promise<Message[]> {
  return invoke<Message[]>("list_messages", { conversationId });
}

export async function sendMessage(
  conversationId: string,
  content: string
): Promise<void> {
  return invoke<void>("send_message", { conversationId, content });
}

// Config
export async function detectToolConfigs(): Promise<ToolConfigInfo[]> {
  return invoke<ToolConfigInfo[]>("detect_tool_configs");
}

export async function readConfigFile(
  toolName: string
): Promise<ConfigFileContent> {
  return invoke<ConfigFileContent>("read_config_file", { toolName });
}

export async function writeConfigPartial(
  toolName: string,
  subscriptionId: string
): Promise<ConfigWriteResult> {
  return invoke<ConfigWriteResult>("write_config_partial", {
    toolName,
    subscriptionId,
  });
}

export async function writeConfigFull(
  toolName: string,
  content: string
): Promise<ConfigWriteResult> {
  return invoke<ConfigWriteResult>("write_config_full", { toolName, content });
}

export async function previewConfig(
  toolName: string,
  subscriptionId: string
): Promise<string> {
  return invoke<string>("preview_config", { toolName, subscriptionId });
}

// Backup
export async function listBackups(
  toolName?: string
): Promise<ConfigBackup[]> {
  return invoke<ConfigBackup[]>("list_backups", { toolName });
}

export async function restoreBackup(id: string): Promise<void> {
  return invoke<void>("restore_backup", { id });
}

export async function deleteBackup(id: string): Promise<void> {
  return invoke<void>("delete_backup", { id });
}

export async function exportBackup(
  id: string,
  destPath: string
): Promise<void> {
  return invoke<void>("export_backup", { id, destPath });
}

export async function exportAllBackups(
  toolName: string,
  destDir: string
): Promise<void> {
  return invoke<void>("export_all_backups", { toolName, destDir });
}

// Export/Import
export async function exportAllData(destPath: string): Promise<void> {
  return invoke<void>("export_all_data", { destPath });
}

export async function importAllData(
  filePath: string
): Promise<{
  providers_imported: number;
  subscriptions_imported: number;
  roles_imported: number;
  conversations_imported: number;
  messages_imported: number;
  backups_imported: number;
}> {
  return invoke("import_all_data", { filePath });
}

export async function getAppVersion(): Promise<string> {
  return invoke<string>("get_app_version");
}
