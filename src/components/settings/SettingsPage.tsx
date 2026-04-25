import { useState } from "react";
import { useTranslation } from "react-i18next";
import { exportAllData, importAllData, getAppVersion } from "@/lib/tauri";

export default function SettingsPage() {
  const { i18n } = useTranslation();
  const [version, setVersion] = useState("0.1.0");
  const [importResult, setImportResult] = useState<string | null>(null);

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  const handleExport = async () => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const dest = await save({
        defaultPath: "ai-master-export.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (dest) {
        await exportAllData(dest);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleImport = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const file = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (file && typeof file === "string") {
        const result = await importAllData(file);
        setImportResult(
          `导入完成: ${result.providers_imported} 厂商, ${result.subscriptions_imported} 套餐, ${result.roles_imported} 角色`
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadVersion = async () => {
    try {
      const v = await getAppVersion();
      setVersion(v);
    } catch { /* ignore */ }
  };
  loadVersion();

  return (
    <div className="h-full overflow-y-auto p-6">
      <h2 className="mb-6 text-lg font-semibold text-gray-200">个人配置</h2>

      <div className="mb-6">
        <h3 className="mb-2 text-sm font-medium text-gray-400">通用设置</h3>
        <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300">语言切换</span>
            <select
              value={i18n.language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 outline-none"
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300">主题</span>
            <span className="text-xs text-gray-500">深色 (默认)</span>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="mb-2 text-sm font-medium text-gray-400">数据管理</h3>
        <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300">导出数据</span>
            <button
              onClick={handleExport}
              className="rounded-md bg-gray-800 px-2 py-1 text-xs text-blue-400 hover:bg-gray-700"
            >
              导出
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300">导入数据</span>
            <button
              onClick={handleImport}
              className="rounded-md bg-gray-800 px-2 py-1 text-xs text-blue-400 hover:bg-gray-700"
            >
              导入
            </button>
          </div>
          {importResult && (
            <p className="text-xs text-green-400">{importResult}</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-400">关于</h3>
        <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300">版本</span>
            <span className="text-xs text-gray-500">v{version}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
