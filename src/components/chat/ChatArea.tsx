import { useState, useRef, useEffect, useCallback } from "react";
import { Send, User, Bot, Folder, ChevronDown, Pin } from "lucide-react";
import type { Message } from "@/types/message";
import type { Role } from "@/types/role";
import type { Subscription } from "@/types/subscription";
import { listRoles, listSubscriptions, updateConversation, getConversation } from "@/lib/tauri";
import { SUBSCRIPTIONS_CHANGED_EVENT } from "@/lib/subscriptionEvents";

interface Props {
  messages: Message[];
  streamingText: string;
  isStreaming: boolean;
  onSend: (content: string, roleId: string | null) => void;
  activeConversationId: string | null;
  onSelectConversation: () => void;
}

export default function ChatArea({ messages, streamingText, isStreaming, onSend, activeConversationId, onSelectConversation }: Props) {
  const [input, setInput] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedSub, setSelectedSub] = useState<string | null>(null);
  const [workingDir, setWorkingDir] = useState("~");
  const [showRoles, setShowRoles] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRoles().then(setRoles).catch(() => {});
  }, []);

  const refreshSubsAndSyncConversation = useCallback(async () => {
    const list = await listSubscriptions().catch(() => [] as Subscription[]);
    setSubs(list);
    const activeDefault = list.find((s) => s.is_active)?.id ?? null;
    if (!activeConversationId) {
      setSelectedSub(activeDefault);
      return;
    }
    try {
      const conv = await getConversation(activeConversationId);
      const bound =
        conv.subscription_id && conv.subscription_id.trim() !== ""
          ? conv.subscription_id
          : null;
      setSelectedSub(bound || activeDefault);
      setSelectedRole(conv.role_id);
      setWorkingDir(conv.working_directory?.trim() ? conv.working_directory : "~");
    } catch {
      setSelectedSub(activeDefault);
    }
  }, [activeConversationId]);

  useEffect(() => {
    void refreshSubsAndSyncConversation();
  }, [refreshSubsAndSyncConversation]);

  useEffect(() => {
    const onChanged = () => {
      void refreshSubsAndSyncConversation();
    };
    window.addEventListener(SUBSCRIPTIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(SUBSCRIPTIONS_CHANGED_EVENT, onChanged);
  }, [refreshSubsAndSyncConversation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // Persist model selection to conversation
  const handleModelSelect = useCallback(async (subId: string) => {
    setSelectedSub(subId);
    setShowModels(false);
    if (activeConversationId) {
      try {
        await updateConversation(activeConversationId, { subscription_id: subId });
      } catch { /* ignore */ }
    }
  }, [activeConversationId]);

  // Persist role selection to conversation
  const handleRoleSelect = useCallback(async (roleId: string | null) => {
    setSelectedRole(roleId);
    setShowRoles(false);
    if (activeConversationId) {
      try {
        await updateConversation(activeConversationId, { role_id: roleId || "" });
      } catch { /* ignore */ }
    }
  }, [activeConversationId]);

  // Persist working directory to conversation
  const handleDirChange = useCallback(async (dir: string) => {
    setWorkingDir(dir);
    if (activeConversationId) {
      try {
        await updateConversation(activeConversationId, { working_directory: dir });
      } catch { /* ignore */ }
    }
  }, [activeConversationId]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    onSend(input.trim(), selectedRole);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleBrowseDir = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false });
      if (dir && typeof dir === "string") handleDirChange(dir);
    } catch { /* */ }
  };

  const selectedRoleObj = roles.find((r) => r.id === selectedRole);
  const selectedSubObj = subs.find((s) => s.id === selectedSub);

  if (!activeConversationId) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <Bot size={40} style={{ color: "var(--text-muted)", margin: "0 auto" }} />
          <p style={{ marginTop: 12, fontSize: 13, color: "var(--text-muted)" }}>
            选择对话或{" "}
            <button
              onClick={onSelectConversation}
              style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 13, textDecoration: "underline" }}
            >
              新建对话
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
        {/* Empty state */}
        {messages.length === 0 && !isStreaming && (
          <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <Bot size={32} style={{ color: "var(--text-muted)", marginBottom: 8 }} />
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>发送消息开始对话</p>
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg) => (
          <div key={msg.id} style={{ display: "flex", gap: 10, marginBottom: 16, justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            {msg.role === "assistant" && (
              <div style={{ width: 28, height: 28, borderRadius: 6, background: "var(--accent-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Bot size={15} style={{ color: "var(--accent)" }} />
              </div>
            )}
            <div style={{
              maxWidth: "72%", borderRadius: 8, padding: "10px 14px", fontSize: 13, lineHeight: 1.65,
              background: msg.role === "user" ? "var(--accent)" : "var(--bg-tertiary)",
              color: msg.role === "user" ? "#fff" : "var(--text-primary)",
              border: msg.role === "user" ? "none" : "1px solid var(--border-primary)",
            }}>
              <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.content}</p>
            </div>
            {msg.role === "user" && (
              <div style={{ width: 28, height: 28, borderRadius: 6, background: "var(--bg-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px solid var(--border-primary)" }}>
                <User size={14} style={{ color: "var(--text-secondary)" }} />
              </div>
            )}
          </div>
        ))}

        {/* Streaming bubble */}
        {isStreaming && streamingText && (
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: "var(--accent-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Bot size={15} style={{ color: "var(--accent)" }} />
            </div>
            <div style={{ maxWidth: "72%", borderRadius: 8, padding: "10px 14px", fontSize: 13, lineHeight: 1.65, background: "var(--bg-tertiary)", border: "1px solid var(--accent)", color: "var(--text-primary)" }}>
              <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {streamingText}
                <span style={{ display: "inline-block", width: 1, height: 14, background: "var(--accent)", marginLeft: 2 }} />
              </p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{ borderTop: "1px solid var(--border-primary)", padding: "12px 16px", flexShrink: 0 }}>
        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          {/* Role selector */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => { setShowRoles(!showRoles); setShowModels(false); }}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 4, border: "1px solid var(--border-primary)", background: "var(--bg-tertiary)", color: "var(--text-secondary)", fontSize: 11, cursor: "pointer" }}
            >
              <User size={12} />
              {selectedRoleObj?.name || "角色"}
              <ChevronDown size={10} />
            </button>
            {showRoles && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setShowRoles(false)} />
                <div style={{ position: "absolute", bottom: "100%", left: 0, marginBottom: 4, width: 220, maxHeight: 240, overflowY: "auto", background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", borderRadius: 8, zIndex: 100, boxShadow: "var(--shadow-popover)" }}>
                  <button onClick={() => handleRoleSelect(null)} style={dropdownItemStyle} onMouseEnter={hoverBg} onMouseLeave={resetBg}>无角色</button>
                  {roles.filter((r) => r.is_pinned).length > 0 && (
                    <>
                      <div style={{ borderTop: "1px solid var(--border-primary)" }} />
                      {roles.filter((r) => r.is_pinned).map((r) => (
                        <button key={r.id} onClick={() => handleRoleSelect(r.id)} style={{ ...dropdownItemStyle, display: "flex", alignItems: "center", gap: 6 }} onMouseEnter={hoverBg} onMouseLeave={resetBg}>
                          <Pin size={10} style={{ color: "var(--amber)" }} /> {r.name}
                        </button>
                      ))}
                    </>
                  )}
                  <div style={{ borderTop: "1px solid var(--border-primary)" }} />
                  {roles.filter((r) => !r.is_pinned).map((r) => (
                    <button key={r.id} onClick={() => handleRoleSelect(r.id)} style={dropdownItemStyle} onMouseEnter={hoverBg} onMouseLeave={resetBg}>{r.name}</button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Model selector */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => { setShowModels(!showModels); setShowRoles(false); }}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 4, border: "1px solid var(--border-primary)", background: "var(--bg-tertiary)", color: "var(--text-secondary)", fontSize: 11, cursor: "pointer", maxWidth: 220 }}
            >
              <Bot size={12} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedSubObj?.model || selectedSubObj?.name || "模型"}
              </span>
              <ChevronDown size={10} />
            </button>
            {showModels && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setShowModels(false)} />
                <div style={{ position: "absolute", bottom: "100%", left: 0, marginBottom: 4, width: 280, maxHeight: 240, overflowY: "auto", background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", borderRadius: 8, zIndex: 100, boxShadow: "var(--shadow-popover)" }}>
                  {subs.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleModelSelect(s.id)}
                      style={{
                        width: "100%", textAlign: "left", padding: "7px 10px", fontSize: 11,
                        color: selectedSub === s.id ? "var(--accent)" : "var(--text-secondary)",
                        background: selectedSub === s.id ? "var(--accent-bg)" : "none",
                        border: "none", cursor: "pointer",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}
                      onMouseEnter={hoverBg}
                      onMouseLeave={resetBg}
                    >
                      <span>{s.name}</span>
                      <span style={{ color: "var(--text-muted)", fontSize: 10 }}>{s.model}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Working directory */}
          <button
            onClick={handleBrowseDir}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 4, border: "1px solid var(--border-primary)", background: "var(--bg-tertiary)", color: "var(--text-secondary)", fontSize: 11, cursor: "pointer", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title={workingDir}
          >
            <Folder size={12} /> {workingDir}
          </button>
        </div>

        {/* Input row */}
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Enter 发送)"
            rows={2}
            style={{ flex: 1, resize: "none", borderRadius: 8, border: "1px solid var(--border-primary)", background: "var(--bg-tertiary)", color: "var(--text-primary)", fontSize: 12, padding: "8px 12px", outline: "none", fontFamily: "inherit", lineHeight: 1.6 }}
            onFocus={focusBorder}
            onBlur={blurBorder}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: input.trim() && !isStreaming ? "var(--accent)" : "var(--bg-tertiary)", border: input.trim() && !isStreaming ? "none" : "1px solid var(--border-primary)", color: input.trim() && !isStreaming ? "#fff" : "var(--text-muted)", cursor: input.trim() && !isStreaming ? "pointer" : "default", transition: "all 0.15s" }}
            onMouseEnter={(e) => { if (input.trim() && !isStreaming) e.currentTarget.style.background = "var(--accent-hover)"; }}
            onMouseLeave={(e) => { if (input.trim() && !isStreaming) e.currentTarget.style.background = "var(--accent)"; }}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

const dropdownItemStyle: React.CSSProperties = {
  width: "100%", textAlign: "left", padding: "7px 10px", fontSize: 11,
  color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer",
};

function hoverBg(e: React.MouseEvent<HTMLButtonElement>) { e.currentTarget.style.background = "var(--bg-hover)"; }
function resetBg(e: React.MouseEvent<HTMLButtonElement>) { e.currentTarget.style.background = "none"; }
function focusBorder(e: React.FocusEvent<HTMLTextAreaElement>) { e.currentTarget.style.borderColor = "var(--accent)"; }
function blurBorder(e: React.FocusEvent<HTMLTextAreaElement>) { e.currentTarget.style.borderColor = "var(--border-primary)"; }
