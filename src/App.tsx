import { useState, useEffect } from "react";
import { Toaster } from "sonner";
import Sidebar from "./components/layout/Sidebar";
import StatusBar from "./components/layout/StatusBar";
import SlidePanel from "./components/layout/SlidePanel";
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
import { getActiveSubscription } from "./lib/tauri";
import { SUBSCRIPTIONS_CHANGED_EVENT, notifySubscriptionsChanged } from "./lib/subscriptionEvents";
import {
  CHAT_SESSION_SUBSCRIPTION_EVENT,
  type ChatSessionSubscriptionDetail,
} from "./lib/chatStatusEvents";

type NavItem = "chat" | "tools" | "models" | "settings";

export default function App() {
  const [activeNav, setActiveNav] = useState<NavItem>("chat");
  const [panel, setPanel] = useState<{ type: string; props?: Record<string, unknown> } | null>(null);
  const [globalSubName, setGlobalSubName] = useState("");
  const [globalModelName, setGlobalModelName] = useState("");
  const [chatSessionSub, setChatSessionSub] = useState<{ name: string; model: string } | null>(null);

  useEffect(() => {
    const refreshGlobal = () => {
      getActiveSubscription()
        .then((sub) => {
          if (sub) {
            setGlobalSubName(sub.name);
            setGlobalModelName(sub.model);
          } else {
            setGlobalSubName("");
            setGlobalModelName("");
          }
        })
        .catch(() => {});
    };
    refreshGlobal();
    window.addEventListener(SUBSCRIPTIONS_CHANGED_EVENT, refreshGlobal);
    return () => window.removeEventListener(SUBSCRIPTIONS_CHANGED_EVENT, refreshGlobal);
  }, []);

  useEffect(() => {
    const onChatSession = (ev: Event) => {
      const ce = ev as CustomEvent<ChatSessionSubscriptionDetail>;
      const d = ce.detail;
      if (d && d.name) setChatSessionSub({ name: d.name, model: d.model });
      else setChatSessionSub(null);
    };
    window.addEventListener(CHAT_SESSION_SUBSCRIPTION_EVENT, onChatSession);
    return () => window.removeEventListener(CHAT_SESSION_SUBSCRIPTION_EVENT, onChatSession);
  }, []);

  useEffect(() => {
    if (activeNav !== "chat") setChatSessionSub(null);
  }, [activeNav]);

  const statusSubName =
    activeNav === "chat" && chatSessionSub
      ? `本对话 · ${chatSessionSub.name}`
      : globalSubName;
  const statusModelName =
    activeNav === "chat" && chatSessionSub ? chatSessionSub.model : globalModelName;

  const openPanel = (type: string, props?: Record<string, unknown>) =>
    setPanel({ type, props });
  const closePanel = () => setPanel(null);

  const renderPanelContent = () => {
    if (!panel) return null;
    const { type, props } = panel;
    switch (type) {
      case "roleLibrary":
        return <RoleLibraryPanel
          onEdit={(role: Role) => openPanel("roleForm", { id: role.id, role })}
          onClose={closePanel}
        />;
      case "roleForm":
        return <RoleForm
          id={props?.id as string | undefined}
          role={props?.role as Role | undefined}
          onSaved={closePanel}
          onCancel={closePanel}
        />;
      case "subscriptionForm":
        return <SubscriptionForm
          id={props?.id as string | undefined}
          subscription={props?.subscription as Subscription | undefined}
          onSaved={() => {
            closePanel();
            notifySubscriptionsChanged();
          }}
          onCancel={closePanel}
        />;
      case "toolConfig":
        return <ToolConfigPanel
          tool={props?.tool as ToolConfigInfo}
          onClose={closePanel}
        />;
      default:
        return null;
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: { background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)", fontSize: "12px" },
        }}
      />
      <Sidebar active={activeNav} onNavigate={setActiveNav} />
      <div style={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden" }}>
        <div style={{ flex: 1, overflow: "hidden" }}>
          {activeNav === "chat" && <ChatPage openPanel={openPanel} />}
          {activeNav === "tools" && <ToolsPage openPanel={openPanel} />}
          {activeNav === "models" && <ModelsPage openPanel={openPanel} />}
          {activeNav === "settings" && <SettingsPage />}
        </div>
        <StatusBar subName={statusSubName} modelName={statusModelName} />
      </div>
      <SlidePanel isOpen={panel !== null} onClose={closePanel}>
        {renderPanelContent()}
      </SlidePanel>
    </div>
  );
}
