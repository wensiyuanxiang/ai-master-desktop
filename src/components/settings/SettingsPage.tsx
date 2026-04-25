import { useState } from "react";
import { useTranslation } from "react-i18next";
import { exportAllData, importAllData, getAppVersion } from "@/lib/tauri";
import { toast } from "sonner";

export default function SettingsPage() {
  const { i18n } = useTranslation();
  const [version, setVersion] = useState("0.1.0");

  useState(() => { getAppVersion().then(setVersion).catch(() => {}); });

  const handleExport = async () => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const dest = await save({ defaultPath: "ai-master-export.json", filters: [{ name: "JSON", extensions: ["json"] }] });
      if (dest) { await exportAllData(dest); toast.success("导出成功"); }
    } catch (e) { toast.error("导出失败"); }
  };

  const handleImport = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const file = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (file && typeof file === "string") {
        const r = await importAllData(file);
        toast.success(`导入: ${r.providers_imported}厂商 ${r.subscriptions_imported}套餐 ${r.roles_imported}角色`);
      }
    } catch (e) { toast.error("导入失败"); }
  };

  const sectionStyle: React.CSSProperties = {
    border: "1px solid var(--border-primary)", borderRadius: 8,
    background: "var(--bg-secondary)", padding: 16, marginBottom: 16,
  };

  const rowStyle: React.CSSProperties = {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 0", fontSize: 12,
  };

  const btnStyle: React.CSSProperties = {
    padding: "5px 12px", borderRadius: 4, border: "1px solid var(--border-secondary)",
    background: "none", color: "var(--accent)", fontSize: 11, cursor: "pointer",
  };

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: 24 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>设置</h2>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>通用</h3>
        <div style={rowStyle}>
          <span style={{ color: "var(--text-secondary)" }}>语言</span>
          <select
            value={i18n.language}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            style={{
              borderRadius: 4, border: "1px solid var(--border-primary)",
              background: "var(--bg-tertiary)", color: "var(--text-primary)",
              fontSize: 11, padding: "4px 8px", outline: "none", cursor: "pointer",
            }}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>数据</h3>
        <div style={rowStyle}>
          <span style={{ color: "var(--text-secondary)" }}>导出所有数据</span>
          <button onClick={handleExport} style={btnStyle} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-bg)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}>导出</button>
        </div>
        <div style={rowStyle}>
          <span style={{ color: "var(--text-secondary)" }}>导入数据</span>
          <button onClick={handleImport} style={btnStyle} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-bg)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}>导入</button>
        </div>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>关于</h3>
        <div style={rowStyle}>
          <span style={{ color: "var(--text-secondary)" }}>版本</span>
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>v{version}</span>
        </div>
      </div>
    </div>
  );
}
