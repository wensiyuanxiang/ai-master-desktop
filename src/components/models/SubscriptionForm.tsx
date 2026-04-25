import { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { Subscription } from "@/types/subscription";
import type { Provider } from "@/types/provider";
import { listProviders, createSubscription, updateSubscription } from "@/lib/tauri";

interface Props {
  id?: string;
  subscription?: Subscription;
  onSaved: () => void;
  onCancel: () => void;
}

export default function SubscriptionForm({ id, subscription, onSaved, onCancel }: Props) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerId, setProviderId] = useState(subscription?.provider_id || "");
  const [name, setName] = useState(subscription?.name || "");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(subscription?.base_url || "");
  const [model, setModel] = useState(subscription?.model || "");
  const [startDate, setStartDate] = useState(subscription?.start_date || "");
  const [endDate, setEndDate] = useState(subscription?.end_date || "");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listProviders().then(setProviders).catch(console.error);
  }, []);

  const handleSave = async () => {
    if (!name.trim() || (!id && !apiKey.trim())) return;
    setSaving(true);
    try {
      if (id) {
        await updateSubscription(id, {
          provider_id: providerId || undefined,
          name: name || undefined,
          api_key: apiKey || undefined,
          base_url: baseUrl || undefined,
          model: model || undefined,
          start_date: startDate || null,
          end_date: endDate || null,
        });
      } else {
        await createSubscription({
          provider_id: providerId,
          name,
          api_key: apiKey,
          base_url: baseUrl,
          model,
          start_date: startDate || null,
          end_date: endDate || null,
        });
      }
      onSaved();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs text-gray-500">厂商名称</label>
        <select
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 outline-none"
        >
          <option value="">选择厂商...</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
          <option value="__custom__">自定义...</option>
        </select>
        {providerId === "__custom__" && (
          <input
            type="text"
            placeholder="输入厂商名称"
            onChange={(e) => setProviderId(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 outline-none"
          />
        )}
      </div>

      <div>
        <label className="text-xs text-gray-500">套餐名称</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如 Claude Pro"
          className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="text-xs text-gray-500">API Key</label>
        <div className="relative mt-1">
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={id ? "留空不修改" : "输入 API Key"}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 pr-8 text-xs text-gray-200 outline-none focus:border-blue-500"
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:text-gray-300"
          >
            {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-500">Base URL</label>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.anthropic.com"
          className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="text-xs text-gray-500">模型名</label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="claude-sonnet-4-6"
          className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="text-xs text-gray-500">订阅周期 (可选)</label>
        <div className="mt-1 flex gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="flex-1 rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 outline-none"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="flex-1 rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 outline-none"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存"}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 rounded-md bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
        >
          取消
        </button>
      </div>
    </div>
  );
}
