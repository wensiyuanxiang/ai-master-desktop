/** 套餐列表或「当前生效套餐」在别处被更新时派发，聊天区与状态栏应重新拉取。 */
export const SUBSCRIPTIONS_CHANGED_EVENT = "ai-master-subscriptions-changed";

export function notifySubscriptionsChanged(): void {
  window.dispatchEvent(new CustomEvent(SUBSCRIPTIONS_CHANGED_EVENT));
}
