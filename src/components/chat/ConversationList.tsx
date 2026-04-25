import { useState } from "react";
import { Search, Trash2, Pencil, MessageSquareText } from "lucide-react";
import type { Conversation } from "@/types/conversation";

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

  const startRename = (id: string) => {
    const c = conversations.find((c) => c.id === id);
    if (c) { setRenaming(id); setRenameTitle(c.title); }
    setContextMenu(null);
  };

  const handleRename = (id: string) => {
    if (renameTitle.trim()) onRename(id, renameTitle.trim());
    setRenaming(null);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "0 12px 8px" }}>
        <div style={{ position: "relative" }}>
          <Search size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            type="text"
            placeholder="搜索对话..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", borderRadius: 6, padding: "5px 8px 5px 26px",
              border: "1px solid var(--border-primary)",
              background: "var(--bg-tertiary)", color: "var(--text-primary)",
              fontSize: 11, outline: "none",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-primary)"; }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 6px" }}>
        {filtered.length === 0 && (
          <p style={{ textAlign: "center", padding: "24px 0", fontSize: 11, color: "var(--text-muted)" }}>
            {search ? "无匹配结果" : "暂无对话"}
          </p>
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
                style={{
                  width: "calc(100% - 12px)", margin: "0 6px", borderRadius: 4, padding: "5px 8px",
                  border: "1px solid var(--accent)", background: "var(--bg-tertiary)",
                  color: "var(--text-primary)", fontSize: 11, outline: "none",
                }}
              />
            ) : (
              <button
                onClick={() => onSelect(c.id)}
                onContextMenu={(e) => { e.preventDefault(); setContextMenu({ id: c.id, x: e.clientX, y: e.clientY }); }}
                style={{
                  width: "100%", textAlign: "left", padding: "6px 10px", borderRadius: 6,
                  fontSize: 11, border: "none", cursor: "pointer",
                  background: activeId === c.id ? "var(--accent-bg)" : "transparent",
                  color: activeId === c.id ? "var(--text-primary)" : "var(--text-secondary)",
                  display: "flex", alignItems: "center", gap: 6,
                  transition: "all 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (activeId !== c.id) e.currentTarget.style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  if (activeId !== c.id) e.currentTarget.style.background = "transparent";
                }}
              >
                <MessageSquareText size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
              </button>
            )}
          </div>
        ))}
      </div>

      {contextMenu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setContextMenu(null)} />
          <div
            style={{
              position: "fixed", left: contextMenu.x, top: contextMenu.y, zIndex: 100,
              background: "var(--bg-secondary)", border: "1px solid var(--border-primary)",
              borderRadius: 8, padding: 4, boxShadow: "var(--shadow-menu)",
              minWidth: 120,
            }}
          >
            <button
              onClick={() => startRename(contextMenu.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "6px 10px", fontSize: 11, borderRadius: 4,
                border: "none", background: "none", color: "var(--text-secondary)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
            >
              <Pencil size={11} /> 重命名
            </button>
            <button
              onClick={() => { onDelete(contextMenu.id); setContextMenu(null); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "6px 10px", fontSize: 11, borderRadius: 4,
                border: "none", background: "none", color: "var(--red)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
            >
              <Trash2 size={11} /> 删除
            </button>
          </div>
        </>
      )}
    </div>
  );
}
