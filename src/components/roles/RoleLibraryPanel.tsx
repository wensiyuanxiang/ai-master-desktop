import { useState, useEffect } from "react";
import { Plus, Search, Pin, Trash2, Pencil } from "lucide-react";
import { listRoles, deleteRole, togglePinRole } from "@/lib/tauri";
import type { Role } from "@/types/role";
import { toast } from "sonner";

interface Props {
  onEdit: (role: Role) => void;
  onClose: () => void;
}

export default function RoleLibraryPanel({ onEdit, onClose: _ }: Props) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try { setRoles(await listRoles(search || undefined)); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [search]);

  const handleDelete = async (id: string) => {
    try { await deleteRole(id); setRoles((p) => p.filter((r) => r.id !== id)); toast.success("已删除"); }
    catch { toast.error("删除失败"); }
  };

  const handlePin = async (id: string) => {
    try { await togglePinRole(id); load(); } catch { /* ignore */ }
  };

  const pinned = roles.filter((r) => r.is_pinned);
  const unpinned = roles.filter((r) => !r.is_pinned);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            type="text" placeholder="搜索角色..." value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", borderRadius: 6, padding: "6px 10px 6px 28px", border: "1px solid var(--border-primary)", background: "var(--bg-tertiary)", color: "var(--text-primary)", fontSize: 11, outline: "none" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-primary)"; }}
          />
        </div>
        <button
          onClick={() => onEdit({ id: "", name: "", description: "", system_prompt: "", tags: [], is_pinned: false, created_at: "", updated_at: "" })}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}
        >
          <Plus size={13} /> 添加
        </button>
      </div>

      {loading && <p style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)" }}>加载中...</p>}
      {!loading && roles.length === 0 && <p style={{ textAlign: "center", padding: 30, fontSize: 11, color: "var(--text-muted)" }}>暂无角色，点击添加创建</p>}

      {pinned.length > 0 && (
        <div>
          <p style={{ fontSize: 10, color: "var(--amber)", marginBottom: 4, fontWeight: 500 }}>置顶</p>
          {pinned.map((r) => <RoleItem key={r.id} role={r} onEdit={onEdit} onDelete={handleDelete} onPin={handlePin} />)}
        </div>
      )}
      {pinned.length > 0 && unpinned.length > 0 && <div style={{ borderTop: "1px solid var(--border-primary)" }} />}
      {unpinned.length > 0 && (
        <div>
          {pinned.length > 0 && <p style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>其他</p>}
          {unpinned.map((r) => <RoleItem key={r.id} role={r} onEdit={onEdit} onDelete={handleDelete} onPin={handlePin} />)}
        </div>
      )}
    </div>
  );
}

function RoleItem({ role, onEdit, onDelete, onPin }: { role: Role; onEdit: (r: Role) => void; onDelete: (id: string) => void; onPin: (id: string) => void }) {
  return (
    <div
      style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "8px 10px", borderRadius: 6, marginBottom: 2 }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }}>{role.name}</p>
        {role.description && <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{role.description}</p>}
        {role.tags.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
            {role.tags.map((t) => <span key={t} style={{ fontSize: 9, color: "var(--text-muted)", background: "var(--bg-tertiary)", padding: "1px 6px", borderRadius: 3 }}>{t}</span>)}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 2, flexShrink: 0, marginLeft: 8 }}>
        <button onClick={() => onPin(role.id)} style={{ ...iconBtn, color: role.is_pinned ? "var(--amber)" : "var(--text-muted)" }}>
          <Pin size={12} fill={role.is_pinned ? "currentColor" : "none"} />
        </button>
        <button onClick={() => onEdit(role)} style={iconBtn} onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}>
          <Pencil size={12} />
        </button>
        <button onClick={() => onDelete(role.id)} style={iconBtn} onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red)"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", padding: 3,
  borderRadius: 3, color: "var(--text-muted)", display: "flex",
};
