import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Search, Zap, Pin, ArrowUpDown } from "lucide-react";
import { listProviders, listSubscriptions, deleteSubscription, setActiveSubscription } from "@/lib/tauri";
import { notifySubscriptionsChanged } from "@/lib/subscriptionEvents";
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
  const [providerFilter, setProviderFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"default" | "name" | "provider" | "updated_at">("default");
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("model_pinned_ids");
      if (!raw) return;
      const ids = JSON.parse(raw);
      if (Array.isArray(ids)) {
        setPinnedIds(ids.filter((x) => typeof x === "string"));
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const savePinned = useCallback((ids: string[]) => {
    setPinnedIds(ids);
    localStorage.setItem("model_pinned_ids", JSON.stringify(ids));
  }, []);

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([listProviders(), listSubscriptions()]);
      setProviders(p);
      setSubs(s);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const providerNameMap = useMemo(() => {
    return new Map(providers.map((p) => [p.id, p.name]));
  }, [providers]);

  const isPinned = useCallback((id: string) => pinnedIds.includes(id), [pinnedIds]);

  const togglePin = useCallback((id: string) => {
    if (pinnedIds.includes(id)) {
      savePinned(pinnedIds.filter((x) => x !== id));
    } else {
      savePinned([id, ...pinnedIds]);
    }
  }, [pinnedIds, savePinned]);

  const pinnedIndex = useCallback((id: string) => {
    const idx = pinnedIds.indexOf(id);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  }, [pinnedIds]);

  const movePin = useCallback((id: string, direction: "up" | "down") => {
    const idx = pinnedIds.indexOf(id);
    if (idx === -1) return;
    const next = [...pinnedIds];
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    savePinned(next);
  }, [pinnedIds, savePinned]);

  const applySort = useCallback((list: Subscription[]) => {
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "provider") {
        const pa = providerNameMap.get(a.provider_id) ?? a.provider_id;
        const pb = providerNameMap.get(b.provider_id) ?? b.provider_id;
        return pa.localeCompare(pb) || a.name.localeCompare(b.name);
      }
      if (sortBy === "updated_at") return b.updated_at.localeCompare(a.updated_at);

      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      const aPinned = isPinned(a.id);
      const bPinned = isPinned(b.id);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      if (aPinned && bPinned) return pinnedIndex(a.id) - pinnedIndex(b.id);
      return b.updated_at.localeCompare(a.updated_at);
    });
    return sorted;
  }, [isPinned, pinnedIndex, providerNameMap, sortBy]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = subs.filter((s) => {
      const keywordMatch = q === ""
        || s.name.toLowerCase().includes(q)
        || s.model.toLowerCase().includes(q)
        || (providerNameMap.get(s.provider_id) ?? s.provider_id).toLowerCase().includes(q);
      const providerMatch = providerFilter === "all" || s.provider_id === providerFilter;
      const formatMatch = formatFilter === "all" || s.api_format === formatFilter;
      const stateMatch = stateFilter === "all"
        || (stateFilter === "active" && s.is_active)
        || (stateFilter === "pinned" && isPinned(s.id))
        || (stateFilter === "normal" && !s.is_active && !isPinned(s.id));
      return keywordMatch && providerMatch && formatMatch && stateMatch;
    });
    return applySort(list);
  }, [applySort, formatFilter, isPinned, providerFilter, providerNameMap, search, stateFilter, subs]);

  const handleDelete = async (id: string) => {
    try {
      await deleteSubscription(id);
      setSubs((p) => p.filter((s) => s.id !== id));
      if (pinnedIds.includes(id)) savePinned(pinnedIds.filter((x) => x !== id));
      notifySubscriptionsChanged();
      toast.success("已删除");
    } catch {
      toast.error("删除失败");
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await setActiveSubscription(id);
      setSubs((p) => p.map((s) => ({ ...s, is_active: s.id === id })));
      notifySubscriptionsChanged();
      toast.success("已激活");
    } catch {
      toast.error("激活失败");
    }
  };

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

      <div style={{ marginBottom: 12, display: "grid", gridTemplateColumns: "1.5fr 0.9fr 0.9fr 0.9fr 0.9fr", gap: 8 }}>
        <div style={{ position: "relative" }}>
          <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            type="text" placeholder="搜索套餐 / 模型 / 厂商..."
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

        <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} style={filterStyle}>
          <option value="all">全部厂商</option>
          {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)} style={filterStyle}>
          <option value="all">全部格式</option>
          <option value="openai">OpenAI 兼容</option>
          <option value="anthropic">Anthropic</option>
        </select>

        <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} style={filterStyle}>
          <option value="all">全部状态</option>
          <option value="active">仅生效中</option>
          <option value="pinned">仅置顶</option>
          <option value="normal">未置顶</option>
        </select>

        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} style={filterStyle}>
          <option value="default">默认排序</option>
          <option value="updated_at">最近更新</option>
          <option value="name">按名称</option>
          <option value="provider">按厂商</option>
        </select>
      </div>

      {subs.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: 12 }}>
          还没有添加套餐，点击 [添加套餐] 开始
        </div>
      )}

      {filtered.length > 0 && (
        <div style={{ border: "1px solid var(--border-primary)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr 1.4fr 0.8fr 1.2fr 1.8fr", padding: "8px 10px", background: "var(--bg-tertiary)", fontSize: 11, color: "var(--text-muted)", borderBottom: "1px solid var(--border-primary)" }}>
            <span>套餐 / 模型</span>
            <span>厂商</span>
            <span>API 地址</span>
            <span>格式</span>
            <span>状态</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <ArrowUpDown size={11} /> 操作
            </span>
          </div>

          {filtered.map((s) => {
            const pinned = isPinned(s.id);
            return (
              <div
                key={s.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2.2fr 1fr 1.4fr 0.8fr 1.2fr 1.8fr",
                  padding: "10px",
                  fontSize: 12,
                  borderBottom: "1px solid var(--border-primary)",
                  background: s.is_active ? "var(--accent-bg)" : "transparent",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ color: "var(--text-primary)", fontWeight: 500 }}>{s.name}</p>
                  <p style={{ color: "var(--text-muted)", fontSize: 10, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.model}</p>
                </div>

                <span style={{ color: "var(--text-secondary)" }}>{providerNameMap.get(s.provider_id) ?? s.provider_id}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.base_url || "-"}</span>
                <span style={{ color: "var(--text-secondary)" }}>{s.api_format === "anthropic" ? "Anthropic" : "OpenAI"}</span>

                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {s.is_active && (
                    <span style={statusTagStyle}>
                      <Zap size={10} style={{ display: "inline", verticalAlign: "middle" }} /> 默认应用
                    </span>
                  )}
                  {pinned && <span style={{ ...statusTagStyle, color: "var(--amber)" }}>置顶</span>}
                </div>

                <div style={{ display: "flex", gap: 2, justifyContent: "flex-start", flexWrap: "wrap" }}>
                  <button onClick={() => togglePin(s.id)} style={{ ...actionBtnStyle, color: pinned ? "var(--amber)" : "var(--text-muted)" }}>
                    <Pin size={11} style={{ verticalAlign: "middle" }} /> {pinned ? "取消置顶" : "置顶"}
                  </button>
                  {pinned && (
                    <>
                      <button onClick={() => movePin(s.id, "up")} style={actionBtnStyle}>上移</button>
                      <button onClick={() => movePin(s.id, "down")} style={actionBtnStyle}>下移</button>
                    </>
                  )}
                  <button onClick={() => openPanel("subscriptionForm", { id: s.id, subscription: s })} style={actionBtnStyle}>编辑</button>
                  {!s.is_active && <button onClick={() => handleActivate(s.id)} style={{ ...actionBtnStyle, color: "var(--accent)" }}>设为默认</button>}
                  <button onClick={() => handleDelete(s.id)} style={{ ...actionBtnStyle, color: "var(--red)" }}>删除</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {subs.length > 0 && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "36px 0", color: "var(--text-muted)", fontSize: 12 }}>
          没有符合筛选条件的套餐
        </div>
      )}
    </div>
  );
}

const filterStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 6,
  padding: "7px 10px",
  border: "1px solid var(--border-primary)",
  background: "var(--bg-tertiary)",
  color: "var(--text-primary)",
  fontSize: 12,
  outline: "none",
};

const actionBtnStyle: React.CSSProperties = {
  background: "none", border: "1px solid var(--border-primary)", fontSize: 10, cursor: "pointer",
  padding: "2px 6px", borderRadius: 4, color: "var(--text-muted)",
};

const statusTagStyle: React.CSSProperties = {
  fontSize: 9,
  color: "var(--accent)",
  background: "var(--accent-bg)",
  padding: "1px 6px",
  borderRadius: 4,
};
