import { useState } from "react";
import type { Role } from "@/types/role";
import { createRole, updateRole } from "@/lib/tauri";
import { toast } from "sonner";

interface Props { id?: string; role?: Role; onSaved: () => void; onCancel: () => void; }

const inputStyle: React.CSSProperties = {
  width: "100%", borderRadius: 6, padding: "7px 10px",
  border: "1px solid var(--border-primary)", background: "var(--bg-tertiary)",
  color: "var(--text-primary)", fontSize: 12, outline: "none",
};
const labelStyle: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)", marginBottom: 4, display: "block" };

export default function RoleForm({ id, role, onSaved, onCancel }: Props) {
  const [name, setName] = useState(role?.name || "");
  const [description, setDescription] = useState(role?.description || "");
  const [systemPrompt, setSystemPrompt] = useState(role?.system_prompt || "");
  const [tagsInput, setTagsInput] = useState("");
  const [tags, setTags] = useState<string[]>(role?.tags || []);
  const [isPinned, setIsPinned] = useState(role?.is_pinned || false);
  const [saving, setSaving] = useState(false);

  const addTag = () => {
    const t = tagsInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagsInput("");
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (id && role) await updateRole(id, { name, description, system_prompt: systemPrompt, tags, is_pinned: isPinned });
      else await createRole({ name, description, system_prompt: systemPrompt, tags, is_pinned: isPinned });
      toast.success("已保存");
      onSaved();
    } catch { toast.error("保存失败"); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={labelStyle}>名称</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="如 Python 专家" style={inputStyle} onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-primary)"; }} />
      </div>
      <div>
        <label style={labelStyle}>描述</label>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="简短描述" style={inputStyle} onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-primary)"; }} />
      </div>
      <div>
        <label style={labelStyle}>System Prompt</label>
        <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="输入 System Prompt..." rows={8}
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-primary)"; }}
        />
      </div>
      <div>
        <label style={labelStyle}>标签</label>
        <div style={{ display: "flex", gap: 6 }}>
          <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            placeholder="输入后按 Enter 添加" style={{ ...inputStyle, flex: 1 }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-primary)"; }}
          />
        </div>
        {tags.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
            {tags.map((t) => (
              <span key={t} style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--bg-tertiary)", padding: "2px 8px", borderRadius: 4, fontSize: 10, color: "var(--text-secondary)" }}>
                {t} <button onClick={() => setTags(tags.filter((x) => x !== t))} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 10 }}>x</button>
              </span>
            ))}
          </div>
        )}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", cursor: "pointer" }}>
        <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} /> 置顶
      </label>
      <div style={{ display: "flex", gap: 8, paddingTop: 8 }}>
        <button onClick={handleSave} disabled={saving}
          style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, cursor: "pointer", opacity: saving ? 0.6 : 1 }}
          onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = "var(--accent-hover)"; }}
          onMouseLeave={(e) => { if (!saving) e.currentTarget.style.background = "var(--accent)"; }}
        >{saving ? "保存中..." : "保存"}</button>
        <button onClick={onCancel}
          style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: "1px solid var(--border-primary)", background: "none", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
        >取消</button>
      </div>
    </div>
  );
}
