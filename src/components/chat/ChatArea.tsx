import { useState, useRef, useEffect } from "react";
import { Send, User, Bot, Folder, ChevronDown } from "lucide-react";
import type { Message } from "@/types/message";
import type { Role } from "@/types/role";
import type { Subscription } from "@/types/subscription";
import { listRoles } from "@/lib/tauri";
import { listSubscriptions } from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface Props {
  messages: Message[];
  streamingText: string;
  isStreaming: boolean;
  onSend: (content: string) => void;
  activeConversationId: string | null;
}

export default function ChatArea({ messages, streamingText, isStreaming, onSend, activeConversationId }: Props) {
  const [input, setInput] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [subscriptions, setSubs] = useState<Subscription[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [workingDir, setWorkingDir] = useState("~/");
  const [showRoles, setShowRoles] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRoles().then(setRoles).catch(console.error);
    listSubscriptions().then((subs) => {
      setSubs(subs);
      const active = subs.find((s) => s.is_active);
      if (active) setSelectedModel(active.id);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim());
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
      if (dir && typeof dir === "string") setWorkingDir(dir);
    } catch (e) {
      console.error("Dialog error:", e);
    }
  };

  const selectedRoleObj = roles.find((r) => r.id === selectedRole);
  const selectedModelObj = subscriptions.find((s) => s.id === selectedModel);

  if (!activeConversationId) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <Bot className="mx-auto h-12 w-12 text-gray-600" />
          <p className="mt-4 text-sm text-gray-500">新建一个对话开始吧</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-600">发送消息开始对话</p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn("mb-4 flex gap-3", msg.role === "user" ? "justify-end" : "")}
          >
            {msg.role === "assistant" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600/20">
                <Bot className="h-4 w-4 text-blue-400" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-200"
              )}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
            {msg.role === "user" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-700">
                <User className="h-4 w-4 text-gray-400" />
              </div>
            )}
          </div>
        ))}
        {isStreaming && streamingText && (
          <div className="mb-4 flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600/20">
              <Bot className="h-4 w-4 text-blue-400" />
            </div>
            <div className="max-w-[75%] rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-200">
              <p className="whitespace-pre-wrap">{streamingText}<span className="animate-pulse">|</span></p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-800 px-4 py-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入你的问题... (Enter 发送, Shift+Enter 换行)"
          rows={2}
          className="w-full resize-none rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 outline-none placeholder:text-gray-500 focus:border-blue-500"
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Role selector */}
            <div className="relative">
              <button
                onClick={() => { setShowRoles(!showRoles); setShowModels(false); }}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-gray-800"
              >
                <User className="h-3.5 w-3.5" />
                {selectedRoleObj?.name || "选择角色"}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showRoles && (
                <div className="absolute bottom-full left-0 mb-1 max-h-[200px] w-[220px] overflow-y-auto rounded-md border border-gray-700 bg-gray-800 shadow-xl">
                  <button
                    onClick={() => { setSelectedRole(null); setShowRoles(false); }}
                    className="w-full px-3 py-1.5 text-left text-xs text-gray-400 hover:bg-gray-700"
                  >
                    无角色
                  </button>
                  {roles.filter((r) => r.is_pinned).length > 0 && (
                    <>
                      <div className="border-t border-gray-700" />
                      {roles.filter((r) => r.is_pinned).map((r) => (
                        <button
                          key={r.id}
                          onClick={() => { setSelectedRole(r.id); setShowRoles(false); }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-200 hover:bg-gray-700"
                        >
                          <span className="text-amber-400">&#9670;</span> {r.name}
                        </button>
                      ))}
                    </>
                  )}
                  <div className="border-t border-gray-700" />
                  {roles.filter((r) => !r.is_pinned).map((r) => (
                    <button
                      key={r.id}
                      onClick={() => { setSelectedRole(r.id); setShowRoles(false); }}
                      className="w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-gray-700"
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Model selector */}
            <div className="relative">
              <button
                onClick={() => { setShowModels(!showModels); setShowRoles(false); }}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-gray-800"
              >
                <Bot className="h-3.5 w-3.5" />
                {selectedModelObj?.model || selectedModelObj?.name || "选择模型"}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showModels && (
                <div className="absolute bottom-full left-0 mb-1 max-h-[200px] w-[260px] overflow-y-auto rounded-md border border-gray-700 bg-gray-800 shadow-xl">
                  {subscriptions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedModel(s.id); setShowModels(false); }}
                      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-gray-700"
                    >
                      <span className="text-gray-200">{s.name}</span>
                      <span className="text-gray-500">{s.model}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Working directory */}
            <button
              onClick={handleBrowseDir}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-gray-800"
            >
              <Folder className="h-3.5 w-3.5" />
              {workingDir}
            </button>
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
