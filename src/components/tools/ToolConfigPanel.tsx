import { useState, useEffect } from "react";
import type { ToolConfigInfo, ConfigFileContent, ConfigBackup } from "@/types/backup";
import type { Subscription } from "@/types/subscription";
import { readConfigFile, listSubscriptions, writeConfigPartial, writeConfigFull, listBackups, restoreBackup, deleteBackup, previewConfig } from "@/lib/tauri";
import { toast } from "sonner";

interface Props { tool: ToolConfigInfo; onClose: () => void; }

export default function ToolConfigPanel({ tool, onClose: _ }: Props) {
  const [_c, setConfig] = useState<ConfigFileContent | null>(null);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [selectedSub, setSelectedSub] = useState("");
  const [editMode, setEditMode] = useState<"partial" | "full">("partial");
  const [fullJson, setFullJson] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [backups, setBackups] = useState<ConfigBackup[]>([]);

  const load = async () => {
    try {
      const [cfg, s, b] = await Promise.all([
        readConfigFile(tool.tool_name).catch(() => null),
        listSubscriptions(), listBackups(tool.tool_name),
      ]);
      setConfig(cfg); setSubs(s); setBackups(b);
      if (cfg) setFullJson(cfg.raw_json);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); }, [tool.tool_name]);

  const handleApply = async () => {
    try {
      if (editMode === "partial" && selectedSub) await writeConfigPartial(tool.tool_name, selectedSub);
      else if (editMode === "full" && fullJson) await writeConfigFull(tool.tool_name, fullJson);
      toast.success("配置已应用"); await load();
    } catch (e) { toast.error(`应用失败: ${e}`); }
  };

  const handlePreview = async () => {
    if (!selectedSub) return;
    try { setPreview(await previewConfig(tool.tool_name, selectedSub)); } catch { /* */ }
  };

  const handleRestore = async (id: string) => {
    try { await restoreBackup(id); toast.success("已恢复"); await load(); } catch { toast.error("恢复失败"); }
  };

  const sectionStyle: React.CSSProperties = { marginBottom: 16 };
  const labelStyle: React.CSSProperties = { fontSize: 10, color: "var(--text-muted)", marginBottom: 4, display: "block" };
  const inputStyle: React.CSSProperties = {
    width: "100%", borderRadius: 6, padding: "6px 10px",
    border: "1px solid var(--border-primary)", background: "var(--bg-tertiary)",
    color: "var(--text-primary)", fontSize: 11, outline: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={sectionStyle}>
        <label style={labelStyle}>配置文件路径</label>
        <p style={{ fontSize: 10, color: "var(--text-secondary)", fontFamily: "inherit" }}>{tool.config_path}</p>
        {tool.tool_name === "claude_code" && (
          <p style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.45 }}>
            「仅替换 Key/URL/Model」会先写入每套餐独立文件 <code style={{ fontSize: 9 }}>~/.claude/ai-master/packages/&lt;套餐ID&gt;.json</code>，
            再将当前 <code style={{ fontSize: 9 }}>settings.json</code> 复制到 <code style={{ fontSize: 9 }}>~/.claude/backup/settings.before-apply.*.json</code> 后覆盖生效配置。
          </p>
        )}
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>应用套餐</label>
        <select value={selectedSub} onChange={(e) => setSelectedSub(e.target.value)} style={inputStyle}>
          <option value="">选择套餐...</option>
          {subs.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.model})</option>)}
        </select>
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>编辑模式</label>
        <div style={{ display: "flex", gap: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-secondary)", cursor: "pointer" }}>
            <input type="radio" checked={editMode === "partial"} onChange={() => setEditMode("partial")} /> 仅替换 Key/URL/Model
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-secondary)", cursor: "pointer" }}>
            <input type="radio" checked={editMode === "full"} onChange={() => setEditMode("full")} /> 完整编辑 JSON
          </label>
        </div>
      </div>

      {editMode === "full" && (
        <div style={sectionStyle}>
          <label style={labelStyle}>JSON 编辑器</label>
          <textarea value={fullJson} onChange={(e) => setFullJson(e.target.value)} rows={12}
            style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-primary)"; }}
          />
        </div>
      )}

      {editMode === "partial" && selectedSub && (
        <button onClick={handlePreview}
          style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid var(--border-secondary)", background: "none", color: "var(--text-secondary)", fontSize: 11, cursor: "pointer" }}
        >预览配置</button>
      )}

      {preview && (
        <pre style={{
          maxHeight: 160, overflow: "auto", borderRadius: 6, background: "var(--bg-tertiary)",
          padding: 10, fontSize: 10, color: "var(--text-secondary)", border: "1px solid var(--border-primary)",
          fontFamily: "inherit", whiteSpace: "pre-wrap",
        }}>{preview}</pre>
      )}

      <button onClick={handleApply}
        disabled={editMode === "partial" ? !selectedSub : !fullJson}
        style={{
          padding: "8px 0", borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff",
          fontSize: 12, cursor: "pointer", opacity: (editMode === "partial" ? !selectedSub : !fullJson) ? 0.5 : 1,
        }}
      >应用配置</button>

      <div style={{ borderTop: "1px solid var(--border-primary)", paddingTop: 14 }}>
        <h4 style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 }}>备份</h4>
        {backups.length === 0 && <p style={{ fontSize: 10, color: "var(--text-muted)" }}>暂无备份</p>}
        {backups.map((b) => (
          <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: 4, background: "var(--bg-tertiary)", marginBottom: 4, fontSize: 10 }}>
            <div>
              <p style={{ color: "var(--text-secondary)" }}>{b.subscription_name || "未知"}</p>
              <p style={{ color: "var(--text-muted)", fontSize: 9 }}>{b.created_at}</p>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => handleRestore(b.id)} style={smBtn}>恢复</button>
              <button onClick={async () => { await deleteBackup(b.id); setBackups((p) => p.filter((x) => x.id !== b.id)); }} style={{ ...smBtn, color: "var(--red)" }}>删除</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const smBtn: React.CSSProperties = {
  background: "none", border: "none", fontSize: 10, cursor: "pointer",
  color: "var(--accent)", padding: "2px 6px", borderRadius: 3,
};
