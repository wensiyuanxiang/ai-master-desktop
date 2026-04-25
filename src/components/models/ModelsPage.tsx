import { useState, useEffect, useCallback } from "react";
import { Plus, Search, ChevronDown, ChevronRight } from "lucide-react";
import { listProviders, listSubscriptions, deleteSubscription, setActiveSubscription } from "@/lib/tauri";
import type { Provider } from "@/types/provider";
import type { Subscription } from "@/types/subscription";

interface Props {
  openPanel: (type: string, props?: Record<string, unknown>) => void;
}

export default function ModelsPage({ openPanel }: Props) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [search, setSearch] = useState("");
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [provs, subs] = await Promise.all([listProviders(), listSubscriptions()]);
      setProviders(provs);
      setSubscriptions(subs);
      setExpandedProviders(new Set(provs.map((p) => p.id)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleProvider = (id: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSubscription(id);
      setSubscriptions((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      await setActiveSubscription(id);
      setSubscriptions((prev) =>
        prev.map((s) => ({ ...s, is_active: s.id === id }))
      );
    } catch (e) {
      console.error(e);
    }
  };

  const filteredSubs = subscriptions.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.model.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-500">加载中...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-200">模型/套餐管理</h2>
        <button
          onClick={() => openPanel("subscriptionForm", {})}
          className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-3.5 w-3.5" /> 添加套餐
        </button>
      </div>

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="搜索套餐..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-gray-700 bg-gray-800 py-1.5 pl-7 pr-3 text-xs text-gray-200 outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {providers.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-600">
          还没有添加套餐，点击 [添加套餐] 开始管理你的 API 订阅
        </p>
      )}

      {providers.map((provider) => {
        const providerSubs = filteredSubs.filter((s) => s.provider_id === provider.id);
        const isExpanded = expandedProviders.has(provider.id);
        return (
          <div key={provider.id} className="mb-2">
            <button
              onClick={() => toggleProvider(provider.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-300 hover:bg-gray-800"
            >
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {provider.name}
              <span className="text-xs text-gray-500">({providerSubs.length})</span>
            </button>
            {isExpanded && providerSubs.length > 0 && (
              <div className="ml-5 space-y-1">
                {providerSubs.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-gray-800"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-300">{sub.name}</span>
                        <span className="text-[10px] text-gray-500">{sub.model}</span>
                        {sub.is_active && (
                          <span className="rounded-full bg-green-600/20 px-1.5 py-0.5 text-[10px] text-green-400">
                            生效中
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openPanel("subscriptionForm", { id: sub.id, subscription: sub })}
                        className="rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-700"
                      >
                        编辑
                      </button>
                      {!sub.is_active && (
                        <button
                          onClick={() => handleSetActive(sub.id)}
                          className="rounded px-1.5 py-0.5 text-[10px] text-blue-400 hover:bg-blue-600/10"
                        >
                          激活
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(sub.id)}
                        className="rounded px-1.5 py-0.5 text-[10px] text-red-400 hover:bg-red-600/10"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {isExpanded && providerSubs.length === 0 && !search && (
              <p className="ml-5 py-1 text-xs text-gray-600">暂无套餐</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
