import { useState, useEffect, useCallback } from "react";
import { Plus, Library } from "lucide-react";
import ConversationList from "./ConversationList";
import ChatArea from "./ChatArea";
import type { Conversation } from "@/types/conversation";
import type { Message, StreamChunk } from "@/types/message";
import { listConversations, createConversation, listMessages } from "@/lib/tauri";
import { listen } from "@tauri-apps/api/event";

interface ChatPageProps {
  openPanel: (type: string, props?: Record<string, unknown>) => void;
}

export default function ChatPage({ openPanel }: ChatPageProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [_loading, setLoading] = useState(false);

  const loadConversations = useCallback(async () => {
    try {
      const convs = await listConversations();
      setConversations(convs);
    } catch (e) {
      console.error("Failed to load conversations:", e);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const msgs = await listMessages(conversationId);
      setMessages(msgs);
    } catch (e) {
      console.error("Failed to load messages:", e);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (activeId) loadMessages(activeId);
  }, [activeId, loadMessages]);

  useEffect(() => {
    const unlisten = listen<StreamChunk>("chat-stream-chunk", (event) => {
      const chunk = event.payload;
      if (chunk.error) {
        setIsStreaming(false);
        setStreamingText("");
        return;
      }
      if (chunk.is_complete) {
        setIsStreaming(false);
        setStreamingText((prev) => {
          // Save the completed message
          const assistantMsg: Message = {
            id: `tmp-${Date.now()}`,
            conversation_id: activeId || "",
            role: "assistant",
            content: prev,
            created_at: new Date().toISOString(),
          };
          setMessages((msgs) => [...msgs, assistantMsg]);
          return "";
        });
        if (activeId) loadMessages(activeId);
      } else {
        setStreamingText((prev) => prev + chunk.content_delta);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [activeId, loadMessages]);

  const handleNewConversation = async () => {
    try {
      const convo = await createConversation({});
      setConversations((prev) => [convo, ...prev]);
      setActiveId(convo.id);
      setMessages([]);
    } catch (e) {
      console.error("Failed to create conversation:", e);
    }
  };

  const handleSelectConversation = (id: string) => {
    setActiveId(id);
    setStreamingText("");
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      const { deleteConversation } = await import("@/lib/tauri");
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
    } catch (e) {
      console.error("Failed to delete conversation:", e);
    }
  };

  const handleRenameConversation = async (id: string, title: string) => {
    try {
      const { renameConversation } = await import("@/lib/tauri");
      await renameConversation(id, title);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title } : c))
      );
    } catch (e) {
      console.error("Failed to rename:", e);
    }
  };

  const handleSend = async (content: string) => {
    if (!activeId || !content.trim()) return;
    try {
      const userMsg: Message = {
        id: `tmp-${Date.now()}`,
        conversation_id: activeId,
        role: "user",
        content,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setStreamingText("");
      setLoading(true);
      const { sendMessage } = await import("@/lib/tauri");
      await sendMessage(activeId, content);
      setLoading(false);
    } catch (e) {
      console.error("Failed to send:", e);
      setIsStreaming(false);
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full">
      <div className="flex w-[240px] flex-col border-r border-gray-800">
        <div className="flex items-center justify-between px-3 py-3">
          <button
            onClick={handleNewConversation}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            新建对话
          </button>
        </div>
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={handleSelectConversation}
          onRename={handleRenameConversation}
          onDelete={handleDeleteConversation}
        />
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-end gap-2 border-b border-gray-800 px-4 py-2">
          <button
            onClick={() => openPanel("roleLibrary")}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          >
            <Library className="h-3.5 w-3.5" />
            角色库
          </button>
          <button
            onClick={handleNewConversation}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          >
            <Plus className="h-3.5 w-3.5" />
            新建
          </button>
        </div>
        <ChatArea
          messages={messages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          onSend={handleSend}
          activeConversationId={activeId}
        />
      </div>
    </div>
  );
}
