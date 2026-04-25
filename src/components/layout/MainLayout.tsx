import { useState } from "react";
import Sidebar from "./Sidebar";
import StatusBar from "./StatusBar";
import SlidePanel from "./SlidePanel";

export type PanelContent = {
  type: string;
  props?: Record<string, unknown>;
} | null;

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const [panelContent, setPanelContent] = useState<PanelContent>(null);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-950 text-gray-100">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">{children}</div>
        <StatusBar />
      </div>
      <SlidePanel content={panelContent} onClose={() => setPanelContent(null)} />
    </div>
  );
}

export function usePanel() {
  const [panelContent, setPanelContent] = useState<PanelContent>(null);
  const openPanel = (type: string, props?: Record<string, unknown>) =>
    setPanelContent({ type, props });
  const closePanel = () => setPanelContent(null);
  return { panelContent, openPanel, closePanel };
}
