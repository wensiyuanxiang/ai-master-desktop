import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  exportAllData,
  importAllData,
  getAppVersion,
  exportConfigBundle,
  importConfigBundle,
} from "@/lib/tauri";
import { toast } from "sonner";
import { useTheme } from "@/theme/ThemeProvider";
import type { AppTheme } from "@/lib/theme";

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [version, setVersion] = useState("0.1.0");

  useEffect(() => {
    getAppVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);

  const handleExport = async () => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const dest = await save({
        defaultPath: "ai-master-export.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (dest) {
        await exportAllData(dest);
        toast.success("导出成功");
      }
    } catch {
      toast.error("导出失败");
    }
  };

  const handleImport = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const file = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (file && typeof file === "string") {
        const r = await importAllData(file);
        toast.success(`导入: ${r.providers_imported}厂商 ${r.subscriptions_imported}套餐 ${r.roles_imported}角色`);
      }
    } catch {
      toast.error("导入失败");
    }
  };

  const handleExportBundle = async () => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const dest = await save({
        defaultPath: "ai-master-config-bundle.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (dest) {
        await exportConfigBundle(dest);
        toast.success("配置包已导出");
      }
    } catch (e) {
      toast.error(`导出配置包失败: ${(e as Error).message ?? e}`);
    }
  };

  const handleImportBundle = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const file = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (file && typeof file === "string") {
        const r = await importConfigBundle(file);
        toast.success(
          `导入: ${r.subscriptions_imported}套餐 / ${r.endpoints_imported}端点 / ${r.presets_imported}预案 / ${r.backups_imported}备份`
        );
      }
    } catch (e) {
      toast.error(`导入配置包失败: ${(e as Error).message ?? e}`);
    }
  };

  const sectionStyle: React.CSSProperties = {
    border: "1px solid var(--border-primary)",
    borderRadius: 8,
    background: "var(--bg-secondary)",
    padding: 16,
    marginBottom: 16,
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
    fontSize: 12,
  };

  const btnStyle: React.CSSProperties = {
    padding: "5px 12px",
    borderRadius: 4,
    border: "1px solid var(--border-secondary)",
    background: "none",
    color: "var(--accent)",
    fontSize: 11,
    cursor: "pointer",
  };

  const selectStyle: React.CSSProperties = {
    borderRadius: 4,
    border: "1px solid var(--border-primary)",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    fontSize: 11,
    padding: "4px 8px",
    outline: "none",
    cursor: "pointer",
  };

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: 24 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>
        {t("settings.title")}
      </h2>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
          {t("settings.general")}
        </h3>
        <div style={rowStyle}>
          <span style={{ color: "var(--text-secondary)" }}>{t("settings.language")}</span>
          <select
            value={i18n.language}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            style={selectStyle}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </div>
        <div style={{ ...rowStyle, alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span style={{ color: "var(--text-secondary)" }}>{t("settings.theme")}</span>
            <span style={{ color: "var(--text-muted)", fontSize: 10, lineHeight: 1.45, maxWidth: 320 }}>
              {t("settings.theme_hint")}
            </span>
          </div>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as AppTheme)}
            style={selectStyle}
          >
            <option value="light">{t("settings.theme_light")}</option>
            <option value="dark">{t("settings.theme_dark")}</option>
          </select>
        </div>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
          {t("settings.data_management")}
        </h3>
        <div style={rowStyle}>
          <span style={{ color: "var(--text-secondary)" }}>{t("settings.export_data")}</span>
          <button
            onClick={handleExport}
            style={btnStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--accent-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
            }}
          >
            {t("common.export")}
          </button>
        </div>
        <div style={rowStyle}>
          <span style={{ color: "var(--text-secondary)" }}>{t("settings.import_data")}</span>
          <button
            onClick={handleImport}
            style={btnStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--accent-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
            }}
          >
            {t("common.import")}
          </button>
        </div>
        <div style={{ ...rowStyle, alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
            <span style={{ color: "var(--text-secondary)" }}>导出配置包</span>
            <span style={{ color: "var(--text-muted)", fontSize: 10, lineHeight: 1.45 }}>
              包含套餐、端点、工具预案、生效状态与备份的快照（API Key 沿用本机加密，跨机导入需保持密钥一致）
            </span>
          </div>
          <button
            onClick={handleExportBundle}
            style={btnStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--accent-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
            }}
          >
            {t("common.export")}
          </button>
        </div>
        <div style={rowStyle}>
          <span style={{ color: "var(--text-secondary)" }}>导入配置包</span>
          <button
            onClick={handleImportBundle}
            style={btnStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--accent-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
            }}
          >
            {t("common.import")}
          </button>
        </div>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
          {t("settings.about")}
        </h3>
        <div style={rowStyle}>
          <span style={{ color: "var(--text-secondary)" }}>{t("settings.version")}</span>
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>v{version}</span>
        </div>
      </div>
    </div>
  );
}
