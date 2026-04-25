import { MessageSquareText, Wrench, Package, Settings } from "lucide-react";

type NavItem = "chat" | "tools" | "models" | "settings";

const topItems: { id: NavItem; icon: typeof MessageSquareText; label: string }[] = [
  { id: "chat", icon: MessageSquareText, label: "对话" },
  { id: "tools", icon: Wrench, label: "AI 工具" },
  { id: "models", icon: Package, label: "模型" },
];

export default function Sidebar({
  active = "chat",
  onNavigate,
}: {
  active?: NavItem;
  onNavigate?: (item: NavItem) => void;
}) {
  return (
    <div
      style={{
        width: 44,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--border-primary)",
        background: "var(--bg-secondary)",
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, paddingTop: 12 }}>
        {topItems.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate?.(item.id)}
              title={item.label}
              style={{
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 6,
                transition: "all 0.15s",
                cursor: "pointer",
                background: isActive ? "var(--accent-bg)" : "transparent",
                color: isActive ? "var(--accent)" : "var(--text-muted)",
                border: "none",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--text-muted)";
                }
              }}
            >
              <item.icon size={17} />
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, paddingBottom: 12 }}>
        <button
          onClick={() => onNavigate?.("settings")}
          title="设置"
          style={{
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            transition: "all 0.15s",
            cursor: "pointer",
            background: active === "settings" ? "var(--accent-bg)" : "transparent",
            color: active === "settings" ? "var(--accent)" : "var(--text-muted)",
            border: "none",
          }}
        >
          <Settings size={17} />
        </button>
      </div>
    </div>
  );
}
