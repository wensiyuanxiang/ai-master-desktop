import { useState, useEffect, useCallback, useRef } from "react";
import { Plus } from "lucide-react";
import ConversationList from "./ConversationList";
import ChatArea from "./ChatArea";
import type { Conversation } from "@/types/conversation";
import type { Message, StreamChunk } from "@/types/message";
import { listConversations, createConversation, listMessages, deleteConversation, renameConversation, sendMessage } from "@/lib/tauri";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";

function extractError(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const err = e as Record<string, unknown>;
    if (typeof err.message === "string") return err.message;
    if (typeof err.error === "string") return err.error;
    return JSON.stringify(err);
  }
  return String(e);
}

interface Props {
  openPanel: (type: string, props?: Record<string, unknown>) => void;
}

export default function ChatPage({ openPanel }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const streamRef = useRef({ text: "", convId: "" });
  const unlistenRef = useRef<(() => void) | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const convs = await listConversations();
      setConversations(convs);
    } catch (e) {
      console.error("loadConversations:", e);
    }
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    try {
      const msgs = await listMessages(id);
      setMessages(msgs);
    } catch (e) {
      console.error("loadMessages:", e);
    }
  }, []);

  // Initial load
  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (activeId) loadMessages(activeId);
    else setMessages([]);
  }, [activeId, loadMessages]);

  // Set up streaming event listener
  useEffect(() => {
    let mounted = true;
    listen<StreamChunk>("chat-stream-chunk", (event) => {
      if (!mounted) return;
      const chunk = event.payload;
      if (chunk.error) {
        setIsStreaming(false);
        toast.error(`API 错误: ${chunk.error}`);
        return;
      }
      if (chunk.is_complete) {
        setIsStreaming(false);
        // Reload messages from DB to get the saved assistant message
        if (chunk.conversation_id) {
          loadMessages(chunk.conversation_id);
          loadConversations(); // refresh title
        }
      } else {
        streamRef.current.text += chunk.content_delta;
        setStreamingText(streamRef.current.text);
      }
    }).then((fn) => { unlistenRef.current = fn; });
    return () => {
      mounted = false;
      unlistenRef.current?.();
    };
  }, [loadMessages, loadConversations]);

  // Re-setup listener when activeId changes (to track the right conversation)
  useEffect(() => {
    if (activeId) {
      streamRef.current = { text: "", convId: activeId };
    }
  }, [activeId]);

  const handleNewConversation = async () => {
    try {
      const { getActiveSubscription } = await import("@/lib/tauri");
      let activeSub = null;
      try { activeSub = await getActiveSubscription(); } catch { /* */ }
      const convo = await createConversation({
        subscription_id: activeSub?.id,
      });
      setConversations((prev) => [convo, ...prev]);
      setActiveId(convo.id);
    } catch (e) {
      toast.error("创建对话失败");
    }
  };

  const handleSelect = (id: string) => {
    setActiveId(id);
    streamRef.current = { text: "", convId: id };
    setStreamingText("");
    setIsStreaming(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) setActiveId(null);
    } catch (e) {
      toast.error("删除失败");
    }
  };

  const handleRename = async (id: string, title: string) => {
    try {
      await renameConversation(id, title);
      setConversations((prev) => prev.map((c) => c.id === id ? { ...c, title } : c));
    } catch (e) {
      toast.error("重命名失败");
    }
  };

  const handleSend = async (content: string, roleId: string | null) => {
    if (!activeId || !content.trim()) return;
    // Add user message to UI optimistically
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      conversation_id: activeId,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreamingText("");
    streamRef.current = { text: "", convId: activeId };
    setIsStreaming(true);

    try {
      // Fire-and-forget - response handled by event listener
      await sendMessage(activeId, content, roleId);
    } catch (e: any) {
      setIsStreaming(false);
      toast.error(`发送失败: ${extractError(e)}`);
    }
  };

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* Left: conversation list */}
      <div style={{
        width: 220,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--border-primary)",
        background: "var(--bg-secondary)",
        flexShrink: 0,
      }}>
        <div style={{ padding: "10px 12px" }}>
          <button
            onClick={handleNewConversation}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "6px 0",
              borderRadius: 6,
              border: "1px solid var(--border-secondary)",
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              fontSize: 12,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-secondary)"; }}
          >
            <Plus size={14} /> 新建对话
          </button>
        </div>
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={handleSelect}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      </div>

      {/* Right: chat area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 4,
          padding: "6px 16px",
          borderBottom: "1px solid var(--border-primary)",
          flexShrink: 0,
        }}>
          <button
            onClick={() => openPanel("roleLibrary")}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              fontSize: 11,
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 4,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
          >
            角色库
          </button>
          <button
            onClick={handleNewConversation}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              fontSize: 11,
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 4,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
          >
            + 新建
          </button>
        </div>
        <ChatArea
          messages={messages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          onSend={handleSend}
          activeConversationId={activeId}
          onSelectConversation={() => handleNewConversation()}
        />
      </div>
    </div>
  );
}
