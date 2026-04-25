import {
  MessageSquareText,
  Wrench,
  Package,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = "chat" | "tools" | "models" | "settings";

interface SidebarProps {
  active?: NavItem;
  onNavigate?: (item: NavItem) => void;
}

const navItems: { id: NavItem; icon: typeof MessageSquareText; label: string }[] = [
  { id: "chat", icon: MessageSquareText, label: "对话" },
  { id: "tools", icon: Wrench, label: "AI 工具" },
  { id: "models", icon: Package, label: "模型管理" },
];

const bottomItems: { id: NavItem; icon: typeof Settings; label: string }[] = [
  { id: "settings", icon: Settings, label: "个人配置" },
];

export default function Sidebar({ active = "chat", onNavigate }: SidebarProps) {
  return (
    <div className="flex w-[42px] flex-col border-r border-gray-800 bg-gray-900">
      <div className="flex flex-1 flex-col items-center gap-1 pt-3">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate?.(item.id)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-md transition-colors",
              active === item.id
                ? "bg-blue-600/20 text-blue-400"
                : "text-gray-500 hover:bg-gray-800 hover:text-gray-300"
            )}
            title={item.label}
          >
            <item.icon className="h-5 w-5" />
          </button>
        ))}
      </div>
      <div className="flex flex-col items-center gap-1 pb-3">
        {bottomItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate?.(item.id)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-md transition-colors",
              active === item.id
                ? "bg-blue-600/20 text-blue-400"
                : "text-gray-500 hover:bg-gray-800 hover:text-gray-300"
            )}
            title={item.label}
          >
            <item.icon className="h-5 w-5" />
          </button>
        ))}
      </div>
    </div>
  );
}
