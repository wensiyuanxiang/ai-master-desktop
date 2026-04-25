import { useState, useEffect, useCallback } from "react";
import { Plus, Search, ChevronDown, ChevronRight, Zap } from "lucide-react";
import { listProviders, listSubscriptions, deleteSubscription, setActiveSubscription } from "@/lib/tauri";
import type { Provider } from "@/types/provider";
import type { Subscription } from "@/types/subscription";
import { toast } from "sonner";

interface Props {
  openPanel: (type: string, props?: Record<string, unknown>) => void;
}

export default function ModelsPage({ openPanel }: Props) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([listProviders(), listSubscriptions()]);
      setProviders(p);
      setSubs(s);
      setExpanded(new Set(p.map((x) => x.id)));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const handleDelete = async (id: string) => {
    try { await deleteSubscription(id); setSubs((p) => p.filter((s) => s.id !== id)); toast.success("已删除"); }
    catch { toast.error("删除失败"); }
  };

  const handleActivate = async (id: string) => {
    try { await setActiveSubscription(id); setSubs((p) => p.map((s) => ({ ...s, is_active: s.id === id }))); toast.success("已激活"); }
    catch { toast.error("激活失败"); }
  };

  const filtered = subs.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.model.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}><p style={{ fontSize: 12, color: "var(--text-muted)" }}>加载中...</p></div>;

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>模型管理</h2>
        <button
          onClick={() => openPanel("subscriptionForm", {})}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
            borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff",
            fontSize: 12, cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
        >
          <Plus size={14} /> 添加套餐
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ position: "relative" }}>
          <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            type="text" placeholder="搜索套餐..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", borderRadius: 6, padding: "7px 12px 7px 30px",
              border: "1px solid var(--border-primary)", background: "var(--bg-tertiary)",
              color: "var(--text-primary)", fontSize: 12, outline: "none",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-primary)"; }}
          />
        </div>
      </div>

      {providers.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: 12 }}>
          还没有添加套餐，点击 [添加套餐] 开始
        </div>
      )}

      {providers.map((prov) => {
        const ps = filtered.filter((s) => s.provider_id === prov.id);
        const isOpen = expanded.has(prov.id);
        return (
          <div key={prov.id} style={{ marginBottom: 4 }}>
            <button
              onClick={() => toggle(prov.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "8px 10px", borderRadius: 6, border: "none",
                background: "none", color: "var(--text-primary)", fontSize: 12,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
            >
              {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              {prov.name}
              <span style={{ color: "var(--text-muted)", fontSize: 10 }}>({ps.length})</span>
            </button>
            {isOpen && ps.length > 0 && (
              <div style={{ marginLeft: 24 }}>
                {ps.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 12px", borderRadius: 6,
                      border: s.is_active ? "1px solid var(--accent)" : "1px solid transparent",
                      background: s.is_active ? "var(--accent-bg)" : "transparent",
                      marginBottom: 2,
                    }}
                    onMouseEnter={(e) => { if (!s.is_active) e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { if (!s.is_active) e.currentTarget.style.background = s.is_active ? "var(--accent-bg)" : "transparent"; }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12, color: "var(--text-primary)" }}>{s.name}</span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{s.model}</span>
                      {s.is_active && <span style={{ fontSize: 9, color: "var(--accent)", background: "var(--accent-bg)", padding: "1px 6px", borderRadius: 4 }}><Zap size={10} style={{ display: "inline", verticalAlign: "middle" }} /> 生效中</span>}
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => openPanel("subscriptionForm", { id: s.id, subscription: s })} style={actionBtnStyle}>编辑</button>
                      {!s.is_active && <button onClick={() => handleActivate(s.id)} style={{ ...actionBtnStyle, color: "var(--accent)" }}>激活</button>}
                      <button onClick={() => handleDelete(s.id)} style={{ ...actionBtnStyle, color: "var(--red)" }}>删除</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {isOpen && ps.length === 0 && !search && (
              <p style={{ marginLeft: 24, padding: "6px 0", fontSize: 11, color: "var(--text-muted)" }}>暂无套餐</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  background: "none", border: "none", fontSize: 10, cursor: "pointer",
  padding: "2px 6px", borderRadius: 4, color: "var(--text-muted)",
};
