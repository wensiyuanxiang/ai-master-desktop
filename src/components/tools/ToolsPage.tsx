import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { Eye, EyeOff, Copy, Check } from "lucide-react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { detectToolConfigs, runToolTerminalCommand, readConfigFile, writeToolTerminalInput, resizeToolTerminal, closeToolTerminal, listToolActiveStates } from "@/lib/tauri";
import type { ToolConfigInfo } from "@/types/backup";
import type { ToolActiveStateView } from "@/types/toolPreset";
import { toast } from "sonner";

interface Props {
  openPanel: (type: string, props?: Record<string, unknown>) => void;
}

export default function ToolsPage({ openPanel }: Props) {
  const [tools, setTools] = useState<ToolConfigInfo[]>([]);
  const [activeStates, setActiveStates] = useState<Record<string, ToolActiveStateView>>({});
  const [loading, setLoading] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const [running, setRunning] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionLabel, setSessionLabel] = useState("terminal");
  const [sessionDir, setSessionDir] = useState("~");
  const [isResizing, setIsResizing] = useState(false);
  const [toolApiKeys, setToolApiKeys] = useState<Record<string, string | null>>({});
  const [showToolApiKey, setShowToolApiKey] = useState<Record<string, boolean>>({});
  const [loadingToolApiKey, setLoadingToolApiKey] = useState<Record<string, boolean>>({});
  const [copiedToolApiKey, setCopiedToolApiKey] = useState<Record<string, boolean>>({});
  const panelRef = useRef<HTMLDivElement>(null);
  const terminalHostRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const startYRef = useRef(0);
  const startHeightRef = useRef(220);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    const reload = async () => {
      const [toolList, states] = await Promise.all([
        detectToolConfigs().catch(() => [] as ToolConfigInfo[]),
        listToolActiveStates().catch(() => [] as ToolActiveStateView[]),
      ]);
      if (cancelled) return;
      setTools(toolList);
      const map: Record<string, ToolActiveStateView> = {};
      for (const s of states) map[s.tool_name] = s;
      setActiveStates(map);
    };
    reload().finally(() => {
      if (!cancelled) setLoading(false);
    });
    listen("tool-preset-resynced", () => {
      void reload();
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<{
      session_id: string;
      content: string;
      is_error: boolean;
      is_complete: boolean;
    }>("tool-terminal-output", (event) => {
      const chunk = event.payload;
      if (!activeSessionId || chunk.session_id !== activeSessionId) return;
      xtermRef.current?.write(chunk.content);
      if (chunk.is_complete) {
        setRunning(false);
        setActiveSessionId(null);
        xtermRef.current?.writeln("");
      }
    }).then((fn) => { unlisten = fn; }).catch(() => {});
    return () => unlisten?.();
  }, [activeSessionId]);

  useEffect(() => {
    if (!terminalOpen || !terminalHostRef.current || xtermRef.current) return;
    const term = new Terminal({
      fontSize: 12,
      theme: { background: "#05070b", foreground: "#c8d2ea" },
      convertEol: true,
      cursorBlink: true,
      scrollback: 3000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(terminalHostRef.current);
    fit.fit();
    xtermRef.current = term;
    fitAddonRef.current = fit;
    term.writeln("Embedded terminal ready.");
    const disposable = term.onData((data) => {
      if (!activeSessionId) return;
      void writeToolTerminalInput(activeSessionId, data);
    });
    return () => {
      disposable.dispose();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [terminalOpen, activeSessionId]);

  useEffect(() => {
    if (!terminalOpen || !fitAddonRef.current) return;
    fitAddonRef.current.fit();
    const dims = fitAddonRef.current.proposeDimensions();
    if (dims && activeSessionId) {
      void resizeToolTerminal(activeSessionId, dims.cols, dims.rows);
    }
  }, [terminalHeight, terminalOpen, activeSessionId]);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      const delta = startYRef.current - e.clientY;
      const maxHeight = Math.max(220, window.innerHeight - 170);
      const next = Math.min(maxHeight, Math.max(140, startHeightRef.current + delta));
      setTerminalHeight(next);
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);

  useEffect(() => {
    const copiedId = Object.entries(copiedToolApiKey).find(([, copied]) => copied)?.[0];
    if (!copiedId) return;
    const timer = window.setTimeout(() => {
      setCopiedToolApiKey((prev) => ({ ...prev, [copiedId]: false }));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [copiedToolApiKey]);

  const fetchToolApiKey = async (toolName: string) => {
    if (Object.prototype.hasOwnProperty.call(toolApiKeys, toolName)) {
      return toolApiKeys[toolName];
    }
    setLoadingToolApiKey((prev) => ({ ...prev, [toolName]: true }));
    try {
      const cfg = await readConfigFile(toolName);
      const key = cfg.api_key_field?.trim() || null;
      setToolApiKeys((prev) => ({ ...prev, [toolName]: key }));
      return key;
    } catch {
      setToolApiKeys((prev) => ({ ...prev, [toolName]: null }));
      return null;
    } finally {
      setLoadingToolApiKey((prev) => ({ ...prev, [toolName]: false }));
    }
  };

  const maskApiKey = (key: string | null) => (key ? "***" : "-");

  const handleToggleToolApiKey = async (toolName: string) => {
    const isShown = !!showToolApiKey[toolName];
    if (!isShown) {
      const key = await fetchToolApiKey(toolName);
      if (!key) {
        toast.error("未检测到 API Key");
        return;
      }
    }
    setShowToolApiKey((prev) => ({ ...prev, [toolName]: !isShown }));
  };

  const handleCopyToolApiKey = async (toolName: string) => {
    const key = await fetchToolApiKey(toolName);
    if (!key) {
      toast.error("未检测到 API Key");
      return;
    }
    try {
      await navigator.clipboard.writeText(key);
      setCopiedToolApiKey((prev) => ({ ...prev, [toolName]: true }));
      toast.success("API Key 已复制");
    } catch {
      toast.error("复制 API Key 失败");
    }
  };

  const getToolLaunchCommand = (toolName: string): string | null => {
    const normalized = toolName.toLowerCase();
    if (normalized.includes("claude")) return "claude";
    if (normalized.includes("opencode")) return "opencode";
    return null;
  };

  const handleLaunchTool = async (tool: ToolConfigInfo) => {
    if (running) {
      toast.error("当前有命令正在执行，请稍后再试");
      return;
    }
    const cmd = getToolLaunchCommand(tool.tool_name);
    if (!cmd) {
      toast.error(`暂不支持直接启动 ${tool.display_name}`);
      return;
    }
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false, title: `选择 ${tool.display_name} 工作目录` });
      if (!dir || typeof dir !== "string") return;
      xtermRef.current?.writeln(`$ [${dir}] ${cmd}`);
      setRunning(true);
      setSessionLabel(cmd);
      setSessionDir(dir);
      const sid = await runToolTerminalCommand(cmd, dir);
      setActiveSessionId(sid);
      const dims = fitAddonRef.current?.proposeDimensions();
      if (dims) {
        await resizeToolTerminal(sid, dims.cols, dims.rows);
      }
      toast.success(`已在内置终端启动 ${tool.display_name}`);
    } catch (e) {
      setRunning(false);
      xtermRef.current?.writeln(`Failed: ${String(e)}`);
      toast.error(`启动 ${tool.display_name} 失败`);
    }
  };

  const startResize = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!panelRef.current) return;
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = terminalHeight;
  };

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}><p style={{ fontSize: 12, color: "var(--text-muted)" }}>加载中...</p></div>;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: 24, gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>AI 工具管理</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={toolBtnStyle} onClick={() => setTerminalOpen((v) => !v)}>{terminalOpen ? "关闭终端" : "打开终端"}</button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
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
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>API Key:</span>
                  <span style={{ fontSize: 10, color: "var(--text-secondary)", minWidth: 28 }}>
                    {showToolApiKey[tool.tool_name]
                      ? (toolApiKeys[tool.tool_name] ?? "-")
                      : maskApiKey(toolApiKeys[tool.tool_name] ?? null)}
                  </span>
                  <button
                    onClick={() => void handleCopyToolApiKey(tool.tool_name)}
                    disabled={!!loadingToolApiKey[tool.tool_name]}
                    title="复制 API Key"
                    style={iconBtnStyle(!!loadingToolApiKey[tool.tool_name])}
                  >
                    {copiedToolApiKey[tool.tool_name] ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                  <button
                    onClick={() => void handleToggleToolApiKey(tool.tool_name)}
                    disabled={!!loadingToolApiKey[tool.tool_name]}
                    title={showToolApiKey[tool.tool_name] ? "隐藏 API Key" : "显示 API Key"}
                    style={iconBtnStyle(!!loadingToolApiKey[tool.tool_name])}
                  >
                    {showToolApiKey[tool.tool_name] ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {(() => {
                  const state = activeStates[tool.tool_name];
                  if (state?.active_subscription_name) {
                    const label = state.active_endpoint_label
                      ? `${state.active_subscription_name} · ${state.active_endpoint_label}`
                      : state.active_subscription_name;
                    return (
                      <span
                        title={state.in_sync ? "预案与生效配置同步" : "预案与生效配置已不同步"}
                        style={{
                          fontSize: 10,
                          color: state.in_sync ? "var(--green)" : "var(--orange,#d97706)",
                          background: state.in_sync ? "var(--success-bg)" : "transparent",
                          border: state.in_sync ? "none" : "1px solid var(--orange,#d97706)",
                          padding: "2px 8px",
                          borderRadius: 4,
                        }}
                      >
                        {label}
                        {state.preset_overridden && " · override"}
                      </span>
                    );
                  }
                  if (tool.current_subscription_name) {
                    return (
                      <span style={{ fontSize: 10, color: "var(--text-muted)", background: "var(--bg-tertiary)", padding: "2px 8px", borderRadius: 4 }}>
                        {tool.current_subscription_name} · 未托管
                      </span>
                    );
                  }
                  return null;
                })()}
                {!tool.exists && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>未检测到</span>}
                <button
                  onClick={() => void handleLaunchTool(tool)}
                  style={{
                    padding: "5px 12px", borderRadius: 4, border: "1px solid var(--border-secondary)",
                    background: "none", color: "var(--text-secondary)", fontSize: 11, cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  打开
                </button>
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

      {terminalOpen && (
        <div
          ref={panelRef}
          style={{
            height: terminalHeight,
            border: "1px solid var(--accent)",
            borderRadius: 8,
            background: "var(--bg-primary)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            flexShrink: 0,
            boxShadow: "inset 0 0 0 1px var(--accent-bg)",
          }}
        >
          <div
            onMouseDown={startResize}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "4px 8px",
              minHeight: 26,
              borderBottom: "1px solid var(--accent)",
              background: "var(--accent-bg)",
              cursor: "ns-resize",
              userSelect: "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: running ? "var(--green)" : "var(--text-muted)",
                  boxShadow: running ? "0 0 0 2px var(--success-bg)" : "none",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600, whiteSpace: "nowrap" }}>
                {sessionLabel}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 340,
                }}
                title={sessionDir}
              >
                {sessionDir}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={tinyBtnStyle} onClick={() => xtermRef.current?.clear()}>清空</button>
              <button
                style={tinyBtnStyle}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={async () => {
                  if (activeSessionId) await closeToolTerminal(activeSessionId);
                  setActiveSessionId(null);
                  setRunning(false);
                  xtermRef.current?.reset();
                }}
              >
                清屏
              </button>
              <button
                style={tinyBtnStyle}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={async () => {
                  if (activeSessionId) await closeToolTerminal(activeSessionId);
                  setActiveSessionId(null);
                  setRunning(false);
                  setTerminalOpen(false);
                }}
              >
                关闭
              </button>
            </div>
          </div>
          <div ref={terminalHostRef} style={{ flex: 1, minHeight: 0, background: "#05070b", padding: 4 }} />
        </div>
      )}
    </div>
  );
}

const toolBtnStyle: React.CSSProperties = {
  borderRadius: 6,
  border: "1px solid var(--border-secondary)",
  background: "var(--bg-tertiary)",
  color: "var(--text-secondary)",
  fontSize: 11,
  padding: "6px 10px",
  cursor: "pointer",
};

const tinyBtnStyle: React.CSSProperties = {
  borderRadius: 4,
  border: "1px solid var(--accent)",
  background: "var(--bg-primary)",
  color: "var(--text-muted)",
  fontSize: 10,
  padding: "2px 8px",
  cursor: "pointer",
};

const iconBtnStyle = (disabled: boolean): React.CSSProperties => ({
  border: "none",
  background: "none",
  color: "var(--text-muted)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 2,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.5 : 1,
});

