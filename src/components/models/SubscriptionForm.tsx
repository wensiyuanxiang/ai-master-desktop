import { useState, useEffect, useCallback } from "react";
import { Eye, EyeOff, Copy, Check, Plus, Trash2, Star, ExternalLink } from "lucide-react";
import type {
  Subscription,
  SubscriptionEndpoint,
} from "@/types/subscription";
import type { Provider } from "@/types/provider";
import {
  listProviders,
  createSubscription,
  updateSubscription,
  getSubscriptionApiKey,
  getSubscriptionPassword,
  listEndpoints,
  createEndpoint,
  updateEndpoint,
  deleteEndpoint,
  setDefaultEndpoint,
} from "@/lib/tauri";
import { toast } from "sonner";
import { openExternalUrl } from "@/lib/openExternal";

interface Props {
  id?: string;
  subscription?: Subscription;
  onSaved: () => void;
  onCancel: () => void;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 6,
  padding: "7px 10px",
  border: "1px solid var(--border-primary)",
  background: "var(--bg-tertiary)",
  color: "var(--text-primary)",
  fontSize: 12,
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
  marginBottom: 4,
  display: "block",
};

type DraftEndpoint = {
  id?: string;
  api_format: "openai" | "anthropic";
  base_url: string;
  model: string;
  is_default: boolean;
  // server-known endpoint last seen, used for change detection
  remote?: SubscriptionEndpoint;
};

function emptyEndpoint(isFirst: boolean): DraftEndpoint {
  return {
    api_format: "openai",
    base_url: "",
    model: "",
    is_default: isFirst,
  };
}

export default function SubscriptionForm({ id, subscription, onSaved, onCancel }: Props) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerId, setProviderId] = useState(subscription?.provider_id || "");
  const [name, setName] = useState(subscription?.name || "");
  const [apiKey, setApiKey] = useState("");
  const [startDate, setStartDate] = useState(subscription?.start_date || "");
  const [endDate, setEndDate] = useState(subscription?.end_date || "");
  const [endpoints, setEndpoints] = useState<DraftEndpoint[]>([]);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingKey, setLoadingKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const [adminUrl, setAdminUrl] = useState(subscription?.admin_url || "");
  const [username, setUsername] = useState(subscription?.username || "");
  // `password === undefined` means "not loaded / unchanged on save"; an empty string after
  // a user explicitly cleared the field means "wipe it on save".
  const [password, setPassword] = useState<string | undefined>(undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  useEffect(() => {
    listProviders().then(setProviders).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) {
      setEndpoints([
        {
          api_format: subscription?.api_format === "anthropic" ? "anthropic" : "openai",
          base_url: subscription?.base_url || "",
          model: subscription?.model || "",
          is_default: true,
        },
      ]);
      return;
    }
    listEndpoints(id)
      .then((eps) => {
        if (eps.length === 0) {
          // Edge case: legacy subscription whose backfill failed. Synthesize a draft from
          // the legacy single-endpoint columns so the user still has a starting row.
          setEndpoints([
            {
              api_format: subscription?.api_format === "anthropic" ? "anthropic" : "openai",
              base_url: subscription?.base_url || "",
              model: subscription?.model || "",
              is_default: true,
            },
          ]);
          return;
        }
        setEndpoints(
          eps.map((e) => ({
            id: e.id,
            api_format: e.api_format,
            base_url: e.base_url,
            model: e.model,
            is_default: e.is_default,
            remote: e,
          })),
        );
      })
      .catch(() => {});
  }, [id, subscription]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!copiedPassword) return;
    const timer = window.setTimeout(() => setCopiedPassword(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedPassword]);

  const hasStoredPassword = Boolean(id && subscription?.has_password);

  const ensurePasswordLoaded = useCallback(async (): Promise<string | null> => {
    if (password !== undefined) return password;
    if (!id || !hasStoredPassword) {
      setPassword("");
      return "";
    }
    try {
      setLoadingPassword(true);
      const real = await getSubscriptionPassword(id);
      setPassword(real);
      return real;
    } catch {
      toast.error("读取密码失败");
      return null;
    } finally {
      setLoadingPassword(false);
    }
  }, [password, id, hasStoredPassword]);

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

  const updateEndpointDraft = useCallback(
    (idx: number, patch: Partial<DraftEndpoint>) => {
      setEndpoints((prev) => prev.map((ep, i) => (i === idx ? { ...ep, ...patch } : ep)));
    },
    [],
  );

  const handleAddEndpoint = () => {
    setEndpoints((prev) => [...prev, emptyEndpoint(prev.length === 0)]);
  };

  const handleRemoveEndpoint = async (idx: number) => {
    const target = endpoints[idx];
    if (target?.id) {
      try {
        await deleteEndpoint(target.id);
      } catch {
        toast.error("删除端点失败");
        return;
      }
    }
    setEndpoints((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      // Promote first remaining to default if we removed the default.
      if (target?.is_default && next.length > 0 && !next.some((e) => e.is_default)) {
        next[0] = { ...next[0], is_default: true };
      }
      return next;
    });
  };

  const handleMakeDefault = (idx: number) => {
    setEndpoints((prev) => prev.map((ep, i) => ({ ...ep, is_default: i === idx })));
  };

  const persistEndpoints = useCallback(
    async (subscriptionId: string) => {
      // 1) Diff: create new ones, update changed ones.
      for (let i = 0; i < endpoints.length; i += 1) {
        const ep = endpoints[i];
        if (!ep.base_url.trim()) continue;
        if (!ep.id) {
          const created = await createEndpoint({
            subscription_id: subscriptionId,
            api_format: ep.api_format,
            base_url: ep.base_url,
            model: ep.model,
            is_default: ep.is_default,
          });
          setEndpoints((prev) =>
            prev.map((row, idx) => (idx === i ? { ...row, id: created.id, remote: created } : row)),
          );
        } else if (ep.remote) {
          const changed =
            ep.api_format !== ep.remote.api_format ||
            ep.base_url !== ep.remote.base_url ||
            ep.model !== ep.remote.model;
          if (changed) {
            await updateEndpoint(ep.id, {
              api_format: ep.api_format,
              base_url: ep.base_url,
              model: ep.model,
            });
          }
          if (ep.is_default && !ep.remote.is_default) {
            await setDefaultEndpoint(ep.id);
          }
        }
      }
    },
    [endpoints],
  );

  const handleSave = async () => {
    if (!name.trim() || (!id && !apiKey.trim())) return;
    const validEndpoints = endpoints.filter((e) => e.base_url.trim());
    if (validEndpoints.length === 0) {
      toast.error("至少需要一个 API 端点");
      return;
    }
    if (!validEndpoints.some((e) => e.is_default)) {
      toast.error("请选择默认端点");
      return;
    }
    const defaultEndpoint = validEndpoints.find((e) => e.is_default) ?? validEndpoints[0];

    setSaving(true);
    try {
      let subscriptionId = id;
      if (id) {
        await updateSubscription(id, {
          provider_id: providerId || undefined,
          name: name || undefined,
          api_key: apiKey || undefined,
          // Mirror the chosen default endpoint into the legacy columns so the rest of the
          // app keeps working until everything reads from `subscription_endpoints`.
          base_url: defaultEndpoint.base_url || undefined,
          model: defaultEndpoint.model || undefined,
          api_format: defaultEndpoint.api_format,
          start_date: startDate || null,
          end_date: endDate || null,
          admin_url: adminUrl,
          username,
          // Only send password when user explicitly touched the field (state !== undefined).
          // Empty string clears the saved value; undefined leaves it untouched.
          password: password,
        });
      } else {
        const created = await createSubscription({
          provider_id: providerId,
          name,
          api_key: apiKey,
          base_url: defaultEndpoint.base_url,
          model: defaultEndpoint.model,
          api_format: defaultEndpoint.api_format,
          start_date: startDate || null,
          end_date: endDate || null,
          admin_url: adminUrl || undefined,
          username: username || undefined,
          password: password && password.length > 0 ? password : undefined,
        });
        subscriptionId = created.id;
        // create_subscription auto-creates a default endpoint mirroring the legacy columns,
        // so we re-fetch and align our drafts before persisting any extras.
        const remoteEps = await listEndpoints(created.id);
        setEndpoints((prev) => {
          const aligned = [...prev];
          if (aligned.length > 0 && remoteEps.length > 0) {
            aligned[0] = {
              ...aligned[0],
              id: remoteEps[0].id,
              remote: remoteEps[0],
            };
          }
          return aligned;
        });
      }
      if (subscriptionId) await persistEndpoints(subscriptionId);
      toast.success(id ? "套餐已更新" : "套餐已创建");
      onSaved();
    } catch (e) {
      console.error(e);
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={labelStyle}>厂商</label>
        <select value={providerId} onChange={(e) => setProviderId(e.target.value)} style={inputStyle}>
          <option value="">选择厂商...</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label style={labelStyle}>套餐名称</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如 Claude Pro"
          style={inputStyle}
          onFocus={focusBorder}
          onBlur={blurBorder}
        />
      </div>
      <div>
        <label style={labelStyle}>API Key（套餐级共享，多个端点共用）</label>
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
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border-primary)";
            }}
          />
          <button
            onClick={handleCopyKey}
            disabled={loadingKey}
            style={{
              position: "absolute",
              right: 30,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: loadingKey ? "not-allowed" : "pointer",
              padding: 2,
              opacity: loadingKey ? 0.5 : 1,
            }}
            title="复制 API Key"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          <button
            onClick={handleToggleKeyVisibility}
            disabled={loadingKey}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: loadingKey ? "not-allowed" : "pointer",
              padding: 2,
              opacity: loadingKey ? 0.5 : 1,
            }}
            title={showKey ? "隐藏 API Key" : "显示 API Key"}
          >
            {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, border: "1px dashed var(--border-primary)", borderRadius: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={labelStyle}>厂商后台（可选）</span>
          {adminUrl.trim() && (
            <button
              onClick={() =>
                void openExternalUrl(adminUrl).catch(() => {
                  toast.error("无法打开链接");
                })
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "none",
                border: "none",
                color: "var(--accent)",
                fontSize: 11,
                cursor: "pointer",
              }}
              title="在浏览器中打开"
            >
              打开 <ExternalLink size={11} />
            </button>
          )}
        </div>
        <input
          type="url"
          value={adminUrl}
          onChange={(e) => setAdminUrl(e.target.value)}
          placeholder="https://platform.openai.com"
          style={inputStyle}
          onFocus={focusBorder}
          onBlur={blurBorder}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="用户名 / 邮箱"
            autoComplete="username"
            style={inputStyle}
            onFocus={focusBorder}
            onBlur={blurBorder}
          />
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              value={password === undefined ? (hasStoredPassword ? "***" : "") : password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={hasStoredPassword ? "留空不修改" : "密码（可选）"}
              autoComplete="new-password"
              style={{ ...inputStyle, paddingRight: 56 }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--accent)";
                if (hasStoredPassword && !showPassword && password === undefined) {
                  e.currentTarget.select();
                }
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--border-primary)";
              }}
            />
            <button
              onClick={async () => {
                const real = await ensurePasswordLoaded();
                if (real === null) return;
                if (!real) {
                  toast.error("尚未保存密码");
                  return;
                }
                try {
                  await navigator.clipboard.writeText(real);
                  setCopiedPassword(true);
                  toast.success("密码已复制");
                } catch {
                  toast.error("复制密码失败");
                }
              }}
              disabled={loadingPassword}
              style={iconBtn(30, loadingPassword)}
              title="复制密码"
            >
              {copiedPassword ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <button
              onClick={async () => {
                if (!showPassword) {
                  const real = await ensurePasswordLoaded();
                  if (real === null) return;
                }
                setShowPassword((p) => !p);
              }}
              disabled={loadingPassword}
              style={iconBtn(8, loadingPassword)}
              title={showPassword ? "隐藏密码" : "显示密码"}
            >
              {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        </div>
        <p style={{ fontSize: 9, color: "var(--text-muted)" }}>
          密码会与 API Key 一同加密保存。点击「打开」将在浏览器中跳转到该地址，便于直接进入厂商后台管理。
        </p>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={labelStyle}>API 端点（同一把 Key 可挂多个协议）</span>
          <button
            onClick={handleAddEndpoint}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              borderRadius: 4,
              border: "1px solid var(--border-primary)",
              background: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            <Plus size={11} /> 添加端点
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {endpoints.map((ep, idx) => (
            <div
              key={ep.id ?? `new-${idx}`}
              style={{
                border: "1px solid var(--border-primary)",
                borderRadius: 6,
                padding: 10,
                background: ep.is_default ? "var(--accent-bg)" : "var(--bg-tertiary)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)", cursor: "pointer" }}>
                  <input
                    type="radio"
                    checked={ep.is_default}
                    onChange={() => handleMakeDefault(idx)}
                  />
                  <Star size={11} style={{ color: ep.is_default ? "var(--accent)" : "var(--text-muted)" }} /> 默认端点
                </label>
                <button
                  onClick={() => void handleRemoveEndpoint(idx)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: 2,
                  }}
                  title="删除端点"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "0.7fr 1.6fr 1fr", gap: 6 }}>
                <select
                  value={ep.api_format}
                  onChange={(e) =>
                    updateEndpointDraft(idx, {
                      api_format: e.target.value === "anthropic" ? "anthropic" : "openai",
                    })
                  }
                  style={inputStyle}
                >
                  <option value="openai">OpenAI 兼容</option>
                  <option value="anthropic">Anthropic</option>
                </select>
                <input
                  type="text"
                  value={ep.base_url}
                  onChange={(e) => updateEndpointDraft(idx, { base_url: e.target.value })}
                  placeholder={
                    ep.api_format === "anthropic"
                      ? "https://api.deepseek.com/anthropic"
                      : "https://api.deepseek.com"
                  }
                  style={inputStyle}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
                <input
                  type="text"
                  value={ep.model}
                  onChange={(e) => updateEndpointDraft(idx, { model: e.target.value })}
                  placeholder="该端点默认模型"
                  style={inputStyle}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
              </div>
              <p style={{ fontSize: 9, color: "var(--text-muted)" }}>
                {ep.api_format === "anthropic"
                  ? "Anthropic：以 /v1/messages 结尾则不变；以 /messages 结尾会自动改写；以 /v1 结尾补 /messages；其他自动补 /v1/messages。"
                  : "OpenAI：含 /chat/completions 则不变；以 /v1 结尾补 /chat/completions；其他补 /v1/chat/completions。"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label style={labelStyle}>订阅周期 (可选)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, paddingTop: 8 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1,
            padding: "8px 0",
            borderRadius: 6,
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            fontSize: 12,
            cursor: "pointer",
            opacity: saving ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            if (!saving) e.currentTarget.style.background = "var(--accent-hover)";
          }}
          onMouseLeave={(e) => {
            if (!saving) e.currentTarget.style.background = "var(--accent)";
          }}
        >
          {saving ? "保存中..." : "保存"}
        </button>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            padding: "8px 0",
            borderRadius: 6,
            border: "1px solid var(--border-primary)",
            background: "none",
            color: "var(--text-secondary)",
            fontSize: 12,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "none";
          }}
        >
          取消
        </button>
      </div>
    </div>
  );
}

function focusBorder(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "var(--accent)";
}
function blurBorder(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "var(--border-primary)";
}

function iconBtn(right: number, disabled: boolean): React.CSSProperties {
  return {
    position: "absolute",
    right,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: disabled ? "not-allowed" : "pointer",
    padding: 2,
    opacity: disabled ? 0.5 : 1,
  };
}
