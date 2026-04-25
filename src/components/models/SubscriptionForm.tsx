import { useState, useEffect } from "react";
import { Eye, EyeOff, Copy, Check } from "lucide-react";
import type { Subscription } from "@/types/subscription";
import type { Provider } from "@/types/provider";
import { listProviders, createSubscription, updateSubscription, getSubscriptionApiKey } from "@/lib/tauri";
import { toast } from "sonner";

interface Props {
  id?: string;
  subscription?: Subscription;
  onSaved: () => void;
  onCancel: () => void;
}

const inputStyle: React.CSSProperties = {
  width: "100%", borderRadius: 6, padding: "7px 10px",
  border: "1px solid var(--border-primary)", background: "var(--bg-tertiary)",
  color: "var(--text-primary)", fontSize: 12, outline: "none",
};

export default function SubscriptionForm({ id, subscription, onSaved, onCancel }: Props) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerId, setProviderId] = useState(subscription?.provider_id || "");
  const [name, setName] = useState(subscription?.name || "");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(subscription?.base_url || "");
  const [model, setModel] = useState(subscription?.model || "");
  const [startDate, setStartDate] = useState(subscription?.start_date || "");
  const [endDate, setEndDate] = useState(subscription?.end_date || "");
  const [apiFormat, setApiFormat] = useState(subscription?.api_format || "openai");
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingKey, setLoadingKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { listProviders().then(setProviders).catch(() => {}); }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const hasStoredKey = Boolean(id && subscription?.api_key_masked);

  const displayApiKey = (() => {
    if (apiKey) return apiKey;
    if (hasStoredKey) return "***";
    return "";
  })();

  const handleToggleKeyVisibility = async () => {
    if (!showKey && !apiKey && id) {
      try {
        setLoadingKey(true);
        const realKey = await getSubscriptionApiKey(id);
        setApiKey(realKey);
      } catch {
        toast.error("读取 API Key 失败");
        return;
      } finally {
        setLoadingKey(false);
      }
    }
    setShowKey((prev) => !prev);
  };

  const handleCopyKey = async () => {
    if (!apiKey) {
      if (!id) {
        toast.error("请先输入 API Key");
        return;
      }
      try {
        setLoadingKey(true);
        const realKey = await getSubscriptionApiKey(id);
        setApiKey(realKey);
        await navigator.clipboard.writeText(realKey);
        setCopied(true);
        toast.success("API Key 已复制");
      } catch {
        toast.error("复制 API Key 失败");
      } finally {
        setLoadingKey(false);
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      toast.success("API Key 已复制");
    } catch {
      toast.error("复制 API Key 失败");
    }
  };

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
          api_format: apiFormat || undefined,
          start_date: startDate || null,
          end_date: endDate || null,
        });
      } else {
        await createSubscription({ provider_id: providerId, name, api_key: apiKey, base_url: baseUrl, model, api_format: apiFormat, start_date: startDate || null, end_date: endDate || null });
      }
      toast.success(id ? "套餐已更新" : "套餐已创建");
      onSaved();
    } catch { toast.error("保存失败"); }
    finally { setSaving(false); }
  };

  const labelStyle: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)", marginBottom: 4, display: "block" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={labelStyle}>厂商</label>
        <select value={providerId} onChange={(e) => setProviderId(e.target.value)} style={inputStyle}>
          <option value="">选择厂商...</option>
          {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>套餐名称</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="如 Claude Pro" style={inputStyle} onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-primary)"; }} />
      </div>
      <div>
        <label style={labelStyle}>API Key</label>
        <div style={{ position: "relative" }}>
          <input
            type={showKey ? "text" : "password"}
            value={displayApiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={id ? "留空不修改" : "输入 API Key"}
            style={{ ...inputStyle, paddingRight: 56 }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              if (hasStoredKey && !showKey && !apiKey) {
                e.currentTarget.select();
              }
            }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-primary)"; }}
          />
          <button
            onClick={handleCopyKey}
            disabled={loadingKey}
            style={{ position: "absolute", right: 30, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: loadingKey ? "not-allowed" : "pointer", padding: 2, opacity: loadingKey ? 0.5 : 1 }}
            title="复制 API Key"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          <button
            onClick={handleToggleKeyVisibility}
            disabled={loadingKey}
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: loadingKey ? "not-allowed" : "pointer", padding: 2, opacity: loadingKey ? 0.5 : 1 }}
            title={showKey ? "隐藏 API Key" : "显示 API Key"}
          >
            {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
      </div>
      <div>
        <label style={labelStyle}>API 地址（根地址或完整路径均可）</label>
        <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={apiFormat === "anthropic" ? "http://host/gvclaude 或 …/v1/messages" : "https://api.deepseek.com 或 …/v1/chat/completions"}
          style={inputStyle} onFocus={focusBorder} onBlur={blurBorder}
        />
        <p style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
          {apiFormat === "anthropic"
            ? "已完整以 /v1/messages 结尾则不变；仅以 /v1 结尾则补 /messages；否则补 /v1/messages。"
            : "URL 已含 /chat/completions 则不变；仅以 /v1 结尾则补 /chat/completions；否则补 /v1/chat/completions。"}
        </p>
      </div>
      <div>
        <label style={labelStyle}>模型名</label>
        <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="claude-sonnet-4-6 或 deepseek-chat" style={inputStyle} onFocus={focusBorder} onBlur={blurBorder} />
      </div>
      <div>
        <label style={labelStyle}>API 格式</label>
        <select value={apiFormat} onChange={(e) => setApiFormat(e.target.value)} style={inputStyle}>
          <option value="openai">OpenAI 兼容 (chat/completions)</option>
          <option value="anthropic">Anthropic (messages API)</option>
        </select>
        <p style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>决定请求体格式；聊天时会按格式自动补全常见 API 路径。</p>
      </div>

      <div>
        <label style={labelStyle}>订阅周期 (可选)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, paddingTop: 8 }}>
        <button
          onClick={handleSave} disabled={saving}
          style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, cursor: "pointer", opacity: saving ? 0.6 : 1 }}
          onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = "var(--accent-hover)"; }}
          onMouseLeave={(e) => { if (!saving) e.currentTarget.style.background = "var(--accent)"; }}
        >
          {saving ? "保存中..." : "保存"}
        </button>
        <button
          onClick={onCancel}
          style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: "1px solid var(--border-primary)", background: "none", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
        >
          取消
        </button>
      </div>
    </div>
  );
}

function focusBorder(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) { e.currentTarget.style.borderColor = "var(--accent)"; }
function blurBorder(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) { e.currentTarget.style.borderColor = "var(--border-primary)"; }
