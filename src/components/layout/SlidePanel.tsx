import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SlidePanelProps {
  content: { type: string; props?: Record<string, unknown> } | null;
  onClose: () => void;
  children?: ReactNode;
}

export default function SlidePanel({ content, onClose, children }: SlidePanelProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && content) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [content, onClose]);

  const isOpen = content !== null;

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "fixed right-0 top-0 z-50 h-full w-[360px] border-l border-gray-800 bg-gray-900 shadow-2xl transition-transform duration-200 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
            <h3 className="text-sm font-medium text-gray-200">
              {content?.type === "roleLibrary" && "角色库"}
              {content?.type === "roleForm" && (content?.props?.id ? "编辑角色" : "添加角色")}
              {content?.type === "toolConfig" && (content?.props?.tool as { display_name?: string })?.display_name || "工具配置"}
              {content?.type === "subscriptionForm" && (content?.props?.id ? "编辑套餐" : "添加套餐")}
            </h3>
            <button
              onClick={onClose}
              className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    </>
  );
}
