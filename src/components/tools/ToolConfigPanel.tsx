import { useState, useEffect } from "react";
import type { ToolConfigInfo, ConfigFileContent, ConfigBackup } from "@/types/backup";
import type { Subscription } from "@/types/subscription";
import {
  readConfigFile,
  listSubscriptions,
  writeConfigPartial,
  writeConfigFull,
  listBackups,
  restoreBackup,
  deleteBackup,
  previewConfig,
} from "@/lib/tauri";

interface Props {
  tool: ToolConfigInfo;
  onClose: () => void;
}

export default function ToolConfigPanel({ tool, onClose: _onClose }: Props) {
  const [_config, setConfig] = useState<ConfigFileContent | null>(null);
  const [subscriptions, setSubs] = useState<Subscription[]>([]);
  const [selectedSub, setSelectedSub] = useState<string>("");
  const [editMode, setEditMode] = useState<"partial" | "full">("partial");
  const [fullJson, setFullJson] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [backups, setBackups] = useState<ConfigBackup[]>([]);

  const loadData = async () => {
    try {
      const [cfg, subs, bks] = await Promise.all([
        readConfigFile(tool.tool_name).catch(() => null),
        listSubscriptions(),
        listBackups(tool.tool_name),
      ]);
      setConfig(cfg);
      setSubs(subs);
      setBackups(bks);
      if (cfg) setFullJson(cfg.raw_json);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { loadData(); }, [tool.tool_name]);

  const handleApply = async () => {
    try {
      if (editMode === "partial" && selectedSub) {
        await writeConfigPartial(tool.tool_name, selectedSub);
      } else if (editMode === "full" && fullJson) {
        await writeConfigFull(tool.tool_name, fullJson);
      }
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handlePreview = async () => {
    if (!selectedSub) return;
    try {
      const result = await previewConfig(tool.tool_name, selectedSub);
      setPreview(result);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreBackup(id);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteBackup = async (id: string) => {
    try {
      await deleteBackup(id);
      setBackups((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs text-gray-500">配置文件路径</label>
        <p className="text-xs text-gray-300">{tool.config_path}</p>
      </div>

      <div>
        <label className="text-xs text-gray-500">应用套餐</label>
        <select
          value={selectedSub}
          onChange={(e) => setSelectedSub(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 outline-none"
        >
          <option value="">选择套餐...</option>
          {subscriptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.model})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-gray-500">编辑模式</label>
        <div className="mt-1 flex gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-300">
            <input
              type="radio"
              checked={editMode === "partial"}
              onChange={() => setEditMode("partial")}
              className="text-blue-500"
            />
            仅替换 Key/URL/Model
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-300">
            <input
              type="radio"
              checked={editMode === "full"}
              onChange={() => setEditMode("full")}
              className="text-blue-500"
            />
            完整编辑 JSON
          </label>
        </div>
      </div>

      {editMode === "full" && (
        <div>
          <label className="text-xs text-gray-500">JSON 编辑器</label>
          <textarea
            value={fullJson}
            onChange={(e) => setFullJson(e.target.value)}
            rows={12}
            className="mt-1 w-full resize-none rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 font-mono text-xs text-gray-200 outline-none"
          />
        </div>
      )}

      {editMode === "partial" && selectedSub && (
        <button
          onClick={handlePreview}
          className="rounded-md bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
        >
          预览配置
        </button>
      )}

      {preview && (
        <pre className="max-h-[200px] overflow-auto rounded-md bg-gray-800 p-3 font-mono text-xs text-gray-400">
          {preview}
        </pre>
      )}

      <button
        onClick={handleApply}
        disabled={editMode === "partial" ? !selectedSub : !fullJson}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        应用配置
      </button>

      <div className="border-t border-gray-800 pt-4">
        <h4 className="mb-2 text-xs font-medium text-gray-400">备份管理</h4>
        {backups.length === 0 && (
          <p className="text-xs text-gray-600">暂无备份记录</p>
        )}
        {backups.map((b) => (
          <div key={b.id} className="mb-2 flex items-center justify-between rounded-md bg-gray-800 px-2 py-1.5">
            <div>
              <p className="text-xs text-gray-300">{b.subscription_name || "未知"}</p>
              <p className="text-[10px] text-gray-500">{b.created_at}</p>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => handleRestore(b.id)}
                className="rounded px-1.5 py-0.5 text-[10px] text-blue-400 hover:bg-blue-600/10"
              >
                恢复
              </button>
              <button
                onClick={() => handleDeleteBackup(b.id)}
                className="rounded px-1.5 py-0.5 text-[10px] text-red-400 hover:bg-red-600/10"
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
