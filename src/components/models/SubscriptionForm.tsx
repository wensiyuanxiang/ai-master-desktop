import { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { Subscription } from "@/types/subscription";
import type { Provider } from "@/types/provider";
import { listProviders, createSubscription, updateSubscription } from "@/lib/tauri";
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
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { listProviders().then(setProviders).catch(() => {}); }, []);

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
        await createSubscription({ provider_id: providerId, name, api_key: apiKey, base_url: baseUrl, model, start_date: startDate || null, end_date: endDate || null });
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
          <input type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={id ? "留空不修改" : "输入 API Key"} style={{ ...inputStyle, paddingRight: 32 }} onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-primary)"; }} />
          <button
            onClick={() => setShowKey(!showKey)}
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 2 }}
          >
            {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
      </div>
      <div>
        <label style={labelStyle}>Base URL</label>
        <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.anthropic.com" style={inputStyle} onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-primary)"; }} />
      </div>
      <div>
        <label style={labelStyle}>模型名</label>
        <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="claude-sonnet-4-6" style={inputStyle} onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-primary)"; }} />
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
