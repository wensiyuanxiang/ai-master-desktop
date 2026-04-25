import { useState } from "react";
import Sidebar from "./components/layout/Sidebar";
import StatusBar from "./components/layout/StatusBar";
import SlidePanel, { type SlidePanelProps } from "./components/layout/SlidePanel";
import ChatPage from "./components/chat/ChatPage";
import ToolsPage from "./components/tools/ToolsPage";
import ModelsPage from "./components/models/ModelsPage";
import SettingsPage from "./components/settings/SettingsPage";
import RoleLibraryPanel from "./components/roles/RoleLibraryPanel";
import RoleForm from "./components/roles/RoleForm";
import SubscriptionForm from "./components/models/SubscriptionForm";
import ToolConfigPanel from "./components/tools/ToolConfigPanel";
import type { Role } from "./types/role";
import type { Subscription } from "./types/subscription";
import type { ToolConfigInfo } from "./types/backup";

type NavItem = "chat" | "tools" | "models" | "settings";

interface PanelState {
  type: string;
  props?: Record<string, unknown>;
}

export default function App() {
  const [activeNav, setActiveNav] = useState<NavItem>("chat");
  const [panel, setPanel] = useState<PanelState | null>(null);

  const openPanel = (type: string, props?: Record<string, unknown>) =>
    setPanel({ type, props });
  const closePanel = () => setPanel(null);

  const panelContent: SlidePanelProps["content"] = panel
    ? { type: panel.type, props: panel.props }
    : null;

  const renderPanelContent = () => {
    if (!panel) return null;
    const { type, props } = panel;

    switch (type) {
      case "roleLibrary":
        return (
          <RoleLibraryPanel
            onEdit={(role: Role) => openPanel("roleForm", { id: role.id, role })}
            onClose={closePanel}
          />
        );
      case "roleForm":
        return (
          <RoleForm
            id={props?.id as string | undefined}
            role={props?.role as Role | undefined}
            onSaved={closePanel}
            onCancel={closePanel}
          />
        );
      case "subscriptionForm":
        return (
          <SubscriptionForm
            id={props?.id as string | undefined}
            subscription={props?.subscription as Subscription | undefined}
            onSaved={closePanel}
            onCancel={closePanel}
          />
        );
      case "toolConfig":
        return (
          <ToolConfigPanel
            tool={props?.tool as ToolConfigInfo}
            onClose={closePanel}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-950 text-gray-100">
      <Sidebar active={activeNav} onNavigate={setActiveNav} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {activeNav === "chat" && <ChatPage openPanel={openPanel} />}
          {activeNav === "tools" && <ToolsPage openPanel={openPanel} />}
          {activeNav === "models" && <ModelsPage openPanel={openPanel} />}
          {activeNav === "settings" && <SettingsPage />}
        </div>
        <StatusBar />
      </div>
      <SlidePanel content={panelContent} onClose={closePanel}>
        {renderPanelContent()}
      </SlidePanel>
    </div>
  );
}
