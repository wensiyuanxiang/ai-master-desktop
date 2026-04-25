import { useState, useEffect } from "react";
import { Wrench } from "lucide-react";
import { detectToolConfigs } from "@/lib/tauri";
import type { ToolConfigInfo } from "@/types/backup";

interface Props {
  openPanel: (type: string, props?: Record<string, unknown>) => void;
}

export default function ToolsPage({ openPanel }: Props) {
  const [tools, setTools] = useState<ToolConfigInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    detectToolConfigs()
      .then(setTools)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-500">加载中...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-200">AI 工具管理</h2>
      {tools.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-600">暂无配置的 AI 工具</p>
      )}
      <div className="grid gap-3">
        {tools.map((tool) => (
          <div
            key={tool.tool_name}
            className="rounded-lg border border-gray-800 bg-gray-900 p-4 transition-colors hover:border-gray-700"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Wrench className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-sm font-medium text-gray-200">{tool.display_name}</p>
                  <p className="text-xs text-gray-500">{tool.config_path}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {tool.current_subscription_name && (
                  <span className="rounded-full bg-green-600/20 px-2 py-0.5 text-xs text-green-400">
                    {tool.current_subscription_name}
                  </span>
                )}
                {!tool.exists && (
                  <span className="text-xs text-gray-500">未检测到</span>
                )}
                <button
                  onClick={() => openPanel("toolConfig", { tool })}
                  className="rounded-md px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-600/10"
                >
                  配置
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
