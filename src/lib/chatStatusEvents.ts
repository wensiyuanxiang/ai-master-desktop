/** 当前聊天会话在用的套餐（与「模型管理」里全局默认套餐可不同） */
export const CHAT_SESSION_SUBSCRIPTION_EVENT = "ai-master-chat-session-subscription";

export type ChatSessionSubscriptionDetail = {
  name: string;
  model: string;
  apiFormat?: "openai" | "anthropic";
} | null;

export function notifyChatSessionSubscription(detail: ChatSessionSubscriptionDetail) {
  window.dispatchEvent(
    new CustomEvent<ChatSessionSubscriptionDetail>(CHAT_SESSION_SUBSCRIPTION_EVENT, { detail }),
  );
}
