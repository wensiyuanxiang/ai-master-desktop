import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import type {
  ToolConfigInfo,
  ConfigFileContent,
  ConfigBackup,
} from "@/types/backup";
import type {
  Subscription,
  SubscriptionEndpoint,
} from "@/types/subscription";
import type { ToolPreset, ToolActiveStateView } from "@/types/toolPreset";
import {
  applyToolPreset,
  deleteBackup,
  deleteToolPreset,
  discardPresetOverride,
  getToolActive,
  listBackups,
  listEndpoints,
  listSubscriptions,
  listToolPresets,
  overrideToolPreset,
  readConfigFile,
  renderToolPreset,
  restoreBackup,
} from "@/lib/tauri";

interface Props {
  tool: ToolConfigInfo;
  onClose: () => void;
}

type SubWithEndpoints = Subscription & { endpoints: SubscriptionEndpoint[] };

type Tab = "active" | "presets" | "backups";

export default function ToolConfigPanel({ tool, onClose: _onClose }: Props) {
  const [tab, setTab] = useState<Tab>("active");
  const [active, setActive] = useState<ToolActiveStateView | null>(null);
  const [presets, setPresets] = useState<ToolPreset[]>([]);
  const [subs, setSubs] = useState<SubWithEndpoints[]>([]);
  const [backups, setBackups] = useState<ConfigBackup[]>([]);
  const [liveContent, setLiveContent] = useState<ConfigFileContent | null>(null);

  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingJson, setEditingJson] = useState("");

  const [createSubId, setCreateSubId] = useState("");
  const [createEndpointId, setCreateEndpointId] = useState("");

  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [act, pre, subList, bks, live] = await Promise.all([
        getToolActive(tool.tool_name).catch(() => null),
        listToolPresets(tool.tool_name).catch(() => []),
        listSubscriptions().catch(() => [] as Subscription[]),
        listBackups(tool.tool_name).catch(() => [] as ConfigBackup[]),
        readConfigFile(tool.tool_name).catch(() => null),
      ]);
      setActive(act);
      setPresets(pre);
      setBackups(bks);
      setLiveContent(live);

      const expanded = await Promise.all(
        subList.map(async (s) => {
          const endpoints = await listEndpoints(s.id).catch(() => []);
          return { ...s, endpoints } as SubWithEndpoints;
        })
      );
      setSubs(expanded);

      if (act?.active_preset_id) setSelectedPresetId(act.active_preset_id);
    } catch {
      // swallow; toasts surface specific failures elsewhere
    }
  }, [tool.tool_name]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<string[]>("tool-preset-resynced", () => {
      void refresh();
      if (active?.preset_overridden === false && active?.in_sync === false) {
        toast.message("套餐已变更", {
          description: "当前生效预案与套餐源已不同步，可在「当前生效」中重新应用。",
        });
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, [refresh, active?.preset_overridden, active?.in_sync]);

  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === selectedPresetId) ?? null,
    [presets, selectedPresetId]
  );

  const createSub = useMemo(
    () => subs.find((s) => s.id === createSubId) ?? null,
    [subs, createSubId]
  );

  useEffect(() => {
    if (!createSub) {
      setCreateEndpointId("");
      return;
    }
    if (createSub.endpoints.length === 0) {
      setCreateEndpointId("");
      return;
    }
    const def = createSub.endpoints.find((e) => e.is_default) ?? createSub.endpoints[0];
    setCreateEndpointId(def?.id ?? "");
  }, [createSub]);

  const handleCreatePreset = async () => {
    if (!createSubId) return;
    setBusy(true);
    try {
      const preset = await renderToolPreset(
        tool.tool_name,
        createSubId,
        createEndpointId || null
      );
      toast.success("预案已生成");
      await refresh();
      setSelectedPresetId(preset.id);
      setTab("presets");
    } catch (e) {
      toast.error(`生成预案失败: ${formatError(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async (presetId: string) => {
    setBusy(true);
    try {
      await applyToolPreset(presetId);
      toast.success("已应用为生效配置");
      await refresh();
      setTab("active");
    } catch (e) {
      toast.error(`应用失败: ${formatError(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (presetId: string) => {
    if (!confirm("删除此预案？关联备份不会被删除。")) return;
    setBusy(true);
    try {
      await deleteToolPreset(presetId);
      toast.success("预案已删除");
      await refresh();
    } catch (e) {
      toast.error(`删除失败: ${formatError(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleStartEdit = (preset: ToolPreset) => {
    setEditingPresetId(preset.id);
    setEditingJson(prettify(preset.rendered_json));
    setSelectedPresetId(preset.id);
  };

  const handleSaveOverride = async () => {
    if (!editingPresetId) return;
    try {
      JSON.parse(editingJson);
    } catch (e) {
      toast.error(`JSON 格式有误: ${(e as Error).message}`);
      return;
    }
    setBusy(true);
    try {
      await overrideToolPreset(editingPresetId, editingJson);
      toast.success("已保存为 override");
      setEditingPresetId(null);
      setEditingJson("");
      await refresh();
    } catch (e) {
      toast.error(`保存失败: ${formatError(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDiscardOverride = async (presetId: string) => {
    if (!confirm("丢弃 override，重新从套餐源渲染？")) return;
    setBusy(true);
    try {
      await discardPresetOverride(presetId);
      toast.success("已丢弃 override");
      await refresh();
    } catch (e) {
      toast.error(`重置失败: ${formatError(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (id: string) => {
    setBusy(true);
    try {
      await restoreBackup(id);
      toast.success("已恢复备份");
      await refresh();
    } catch (e) {
      toast.error(`恢复失败: ${formatError(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const inSyncBadge = active?.in_sync ? "已同步" : "未同步";
  const inSyncColor = active?.in_sync ? "var(--green)" : "var(--orange, #d97706)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <header>
        <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{tool.config_path}</p>
      </header>

      <div style={tabsRow}>
        {(
          [
            ["active", "当前生效"],
            ["presets", `预案 (${presets.length})`],
            ["backups", `备份 (${backups.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              ...tabBtn,
              borderColor: tab === id ? "var(--accent)" : "var(--border-primary)",
              color: tab === id ? "var(--accent)" : "var(--text-secondary)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "active" && (
        <section style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <p style={titleStyle}>
                {active?.active_subscription_name ?? "未应用任何预案"}
              </p>
              <p style={subTitleStyle}>
                {active?.active_endpoint_label ?? "—"}
                {active?.applied_at && `  ·  应用于 ${active.applied_at}`}
              </p>
            </div>
            <span style={{ ...badgeStyle, color: inSyncColor, borderColor: inSyncColor }}>
              {inSyncBadge}
              {active?.preset_overridden && "  · 已 override"}
            </span>
          </div>

          {active?.preset_rendered_json && active.live_json && !active.in_sync && (
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>
                预案 vs 当前 settings.json
              </p>
              <DiffView
                left={prettify(active.preset_rendered_json)}
                right={prettify(active.live_json)}
                leftLabel="预案 (rendered)"
                rightLabel="生效 (live)"
              />
              <button
                onClick={() => active.active_preset_id && void handleApply(active.active_preset_id)}
                disabled={busy || !active.active_preset_id}
                style={primaryBtn}
              >
                同步生效配置
              </button>
            </div>
          )}

          {liveContent && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 11, color: "var(--text-secondary)", cursor: "pointer" }}>
                查看 live JSON
              </summary>
              <pre style={preStyle}>{prettify(liveContent.raw_json)}</pre>
            </details>
          )}
        </section>
      )}

      {tab === "presets" && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={cardStyle}>
            <p style={subtleHeading}>+ 从套餐生成预案</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
              <select
                value={createSubId}
                onChange={(e) => setCreateSubId(e.target.value)}
                style={inputStyle}
              >
                <option value="">选择套餐...</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                value={createEndpointId}
                onChange={(e) => setCreateEndpointId(e.target.value)}
                style={inputStyle}
                disabled={!createSub || createSub.endpoints.length === 0}
              >
                {createSub?.endpoints.map((e) => (
                  <option key={e.id} value={e.id}>
                    {labelForEndpoint(e)}
                    {e.is_default ? "  · 默认" : ""}
                  </option>
                ))}
                {createSub && createSub.endpoints.length === 0 && (
                  <option value="">无可用端点</option>
                )}
              </select>
              <button
                onClick={() => void handleCreatePreset()}
                disabled={busy || !createSubId}
                style={primaryBtn}
              >
                生成 / 更新
              </button>
            </div>
          </div>

          {presets.length === 0 && (
            <div style={{ ...cardStyle, textAlign: "center", color: "var(--text-muted)", fontSize: 11 }}>
              该工具暂无预案，从上面创建一个吧
            </div>
          )}

          {presets.map((preset) => {
            const isActive = active?.active_preset_id === preset.id;
            const isEditing = editingPresetId === preset.id;
            const isSelected = selectedPresetId === preset.id;
            return (
              <div
                key={preset.id}
                style={{
                  ...cardStyle,
                  borderColor: isSelected ? "var(--accent)" : "var(--border-primary)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div onClick={() => setSelectedPresetId(preset.id)} style={{ cursor: "pointer" }}>
                    <p style={titleStyle}>
                      {preset.subscription_name}
                      {isActive && (
                        <span style={{ ...inlineBadge, marginLeft: 8, color: "var(--green)", borderColor: "var(--green)" }}>
                          当前生效
                        </span>
                      )}
                      {preset.is_overridden && (
                        <span style={{ ...inlineBadge, marginLeft: 6, color: "var(--orange,#d97706)", borderColor: "var(--orange,#d97706)" }}>
                          override
                        </span>
                      )}
                    </p>
                    <p style={subTitleStyle}>
                      {preset.endpoint_label ?? "—"} · 更新 {preset.updated_at}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button onClick={() => void handleApply(preset.id)} disabled={busy} style={primaryBtn}>
                      应用
                    </button>
                    {!isEditing && (
                      <button onClick={() => handleStartEdit(preset)} style={ghostBtn}>
                        手改
                      </button>
                    )}
                    {preset.is_overridden && (
                      <button
                        onClick={() => void handleDiscardOverride(preset.id)}
                        style={ghostBtn}
                      >
                        丢弃 override
                      </button>
                    )}
                    <button onClick={() => void handleDelete(preset.id)} style={dangerBtn}>
                      删除
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div style={{ marginTop: 10 }}>
                    <textarea
                      value={editingJson}
                      onChange={(e) => setEditingJson(e.target.value)}
                      rows={14}
                      style={{ ...inputStyle, fontFamily: "ui-monospace, SFMono-Regular, monospace", resize: "vertical" }}
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <button onClick={() => void handleSaveOverride()} disabled={busy} style={primaryBtn}>
                        保存为 override
                      </button>
                      <button
                        onClick={() => {
                          setEditingPresetId(null);
                          setEditingJson("");
                        }}
                        style={ghostBtn}
                      >
                        取消
                      </button>
                    </div>
                    <p style={{ fontSize: 10, color: "var(--orange,#d97706)", marginTop: 4 }}>
                      override 后，套餐源的 key/url/model 变更将不再自动同步到此预案，直至「丢弃 override」。
                    </p>
                  </div>
                )}

                {!isEditing && isSelected && (
                  <pre style={preStyle}>{prettify(preset.rendered_json)}</pre>
                )}
              </div>
            );
          })}
        </section>
      )}

      {tab === "backups" && (
        <section style={cardStyle}>
          {backups.length === 0 && (
            <p style={{ fontSize: 11, color: "var(--text-muted)" }}>暂无备份</p>
          )}
          {backups.map((b) => (
            <div
              key={b.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 10px",
                borderRadius: 6,
                background: "var(--bg-tertiary)",
                marginBottom: 6,
                fontSize: 11,
              }}
            >
              <div>
                <p style={{ color: "var(--text-secondary)" }}>{b.subscription_name || "未知套餐"}</p>
                <p style={{ color: "var(--text-muted)", fontSize: 10 }}>
                  {b.created_at}
                  {b.preset_id && "  · 来自预案"}
                </p>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => void handleRestore(b.id)} disabled={busy} style={smBtn}>
                  恢复
                </button>
                <button
                  onClick={async () => {
                    await deleteBackup(b.id);
                    setBackups((prev) => prev.filter((x) => x.id !== b.id));
                  }}
                  style={{ ...smBtn, color: "var(--red)" }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {selectedPreset && tab === "presets" && active?.live_json && (
        <details style={cardStyle}>
          <summary style={{ fontSize: 11, color: "var(--text-secondary)", cursor: "pointer" }}>
            该预案与当前 live 对比
          </summary>
          <DiffView
            left={prettify(selectedPreset.rendered_json)}
            right={prettify(active.live_json)}
            leftLabel="预案"
            rightLabel="live"
          />
        </details>
      )}
    </div>
  );
}

function DiffView({
  left,
  right,
  leftLabel,
  rightLabel,
}: {
  left: string;
  right: string;
  leftLabel: string;
  rightLabel: string;
}) {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  const max = Math.max(leftLines.length, rightLines.length);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
      <DiffPane label={leftLabel} lines={leftLines} other={rightLines} max={max} />
      <DiffPane label={rightLabel} lines={rightLines} other={leftLines} max={max} />
    </div>
  );
}

function DiffPane({
  label,
  lines,
  other,
  max,
}: {
  label: string;
  lines: string[];
  other: string[];
  max: number;
}) {
  return (
    <div style={{ border: "1px solid var(--border-primary)", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ padding: "4px 8px", fontSize: 10, color: "var(--text-muted)", background: "var(--bg-tertiary)" }}>
        {label}
      </div>
      <pre style={{ ...preStyle, margin: 0, borderRadius: 0, border: "none", maxHeight: 240 }}>
        {Array.from({ length: max }).map((_, i) => {
          const line = lines[i] ?? "";
          const otherLine = other[i] ?? "";
          const diff = line !== otherLine;
          return (
            <div
              key={i}
              style={{
                background: diff ? "var(--accent-bg)" : "transparent",
                color: diff ? "var(--accent)" : "var(--text-secondary)",
                whiteSpace: "pre",
              }}
            >
              {line || " "}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

function labelForEndpoint(e: SubscriptionEndpoint): string {
  const proto = e.api_format === "anthropic" ? "Anthropic" : "OpenAI";
  return e.model ? `${proto} · ${e.model}` : proto;
}

function prettify(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function formatError(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

const tabsRow: React.CSSProperties = {
  display: "flex",
  gap: 6,
  borderBottom: "1px solid var(--border-primary)",
  paddingBottom: 6,
};

const tabBtn: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: 6,
  border: "1px solid var(--border-primary)",
  background: "var(--bg-tertiary)",
  fontSize: 11,
  cursor: "pointer",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--border-primary)",
  background: "var(--bg-secondary)",
  borderRadius: 8,
  padding: 12,
};

const titleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-primary)",
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
};

const subTitleStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--text-muted)",
  marginTop: 2,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  width: "100%",
  borderRadius: 6,
  padding: "6px 10px",
  border: "1px solid var(--border-primary)",
  background: "var(--bg-tertiary)",
  color: "var(--text-primary)",
  fontSize: 11,
  outline: "none",
};

const primaryBtn: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "none",
  background: "var(--accent)",
  color: "#fff",
  fontSize: 11,
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--border-primary)",
  background: "var(--bg-tertiary)",
  color: "var(--text-secondary)",
  fontSize: 11,
  cursor: "pointer",
};

const dangerBtn: React.CSSProperties = {
  ...ghostBtn,
  color: "var(--red)",
};

const smBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: 11,
  cursor: "pointer",
  color: "var(--accent)",
  padding: "2px 6px",
  borderRadius: 3,
};

const badgeStyle: React.CSSProperties = {
  fontSize: 10,
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid currentColor",
  alignSelf: "flex-start",
};

const inlineBadge: React.CSSProperties = {
  fontSize: 9,
  padding: "1px 6px",
  borderRadius: 4,
  border: "1px solid currentColor",
};

const subtleHeading: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-secondary)",
  fontWeight: 600,
};

const preStyle: React.CSSProperties = {
  marginTop: 8,
  maxHeight: 240,
  overflow: "auto",
  borderRadius: 6,
  background: "var(--bg-tertiary)",
  padding: 10,
  fontSize: 10,
  color: "var(--text-secondary)",
  border: "1px solid var(--border-primary)",
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
  whiteSpace: "pre",
};
