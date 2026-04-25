import { useState, useEffect } from "react";
import { detectToolConfigs } from "@/lib/tauri";
import type { ToolConfigInfo } from "@/types/backup";

interface Props {
  openPanel: (type: string, props?: Record<string, unknown>) => void;
}

export default function ToolsPage({ openPanel }: Props) {
  const [tools, setTools] = useState<ToolConfigInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    detectToolConfigs().then(setTools).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}><p style={{ fontSize: 12, color: "var(--text-muted)" }}>加载中...</p></div>;

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: 24 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>AI 工具管理</h2>
      {tools.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 12 }}>暂无配置的 AI 工具</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tools.map((tool) => (
          <div
            key={tool.tool_name}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: 14, borderRadius: 8,
              border: "1px solid var(--border-primary)",
              background: "var(--bg-secondary)",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-primary)"; }}
          >
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 2 }}>{tool.display_name}</p>
              <p style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "inherit" }}>{tool.config_path}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {tool.current_subscription_name && (
                <span style={{ fontSize: 10, color: "var(--green)", background: "rgba(74,222,128,0.1)", padding: "2px 8px", borderRadius: 4 }}>
                  {tool.current_subscription_name}
                </span>
              )}
              {!tool.exists && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>未检测到</span>}
              <button
                onClick={() => openPanel("toolConfig", { tool })}
                style={{
                  padding: "5px 12px", borderRadius: 4, border: "1px solid var(--border-secondary)",
                  background: "none", color: "var(--accent)", fontSize: 11, cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-bg)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
              >
                配置
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
