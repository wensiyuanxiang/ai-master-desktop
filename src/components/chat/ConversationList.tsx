import { useState } from "react";
import { Search, Trash2, Pencil } from "lucide-react";
import type { Conversation } from "@/types/conversation";
import { cn } from "@/lib/utils";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

export default function ConversationList({ conversations, activeId, onSelect, onRename, onDelete }: Props) {
  const [search, setSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  };

  const startRename = (id: string) => {
    const convo = conversations.find((c) => c.id === id);
    if (convo) {
      setRenaming(id);
      setRenameTitle(convo.title);
    }
    setContextMenu(null);
  };

  const handleRename = (id: string) => {
    if (renameTitle.trim()) onRename(id, renameTitle.trim());
    setRenaming(null);
  };

  const handleDelete = (id: string) => {
    onDelete(id);
    setContextMenu(null);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="搜索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-gray-700 bg-gray-800 py-1.5 pl-7 pr-2 text-xs text-gray-200 outline-none focus:border-blue-500"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        {filtered.length === 0 && (
          <p className="px-2 py-8 text-center text-xs text-gray-600">暂无对话</p>
        )}
        {filtered.map((c) => (
          <div key={c.id}>
            {renaming === c.id ? (
              <input
                autoFocus
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                onBlur={() => handleRename(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename(c.id);
                  if (e.key === "Escape") setRenaming(null);
                }}
                className="w-full rounded-md border border-blue-500 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 outline-none"
              />
            ) : (
              <button
                onClick={() => onSelect(c.id)}
                onContextMenu={(e) => handleContextMenu(e, c.id)}
                className={cn(
                  "w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                  activeId === c.id
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                )}
              >
                <p className="truncate">{c.title}</p>
              </button>
            )}
          </div>
        ))}
      </div>
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 min-w-[120px] rounded-md border border-gray-700 bg-gray-800 py-1 shadow-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => startRename(contextMenu.id)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
            >
              <Pencil className="h-3 w-3" /> 重命名
            </button>
            <button
              onClick={() => handleDelete(contextMenu.id)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-gray-700"
            >
              <Trash2 className="h-3 w-3" /> 删除
            </button>
          </div>
        </>
      )}
    </div>
  );
}
