interface StatusBarProps {
  subName?: string;
  modelName?: string;
}

export default function StatusBar({ subName, modelName }: StatusBarProps) {
  const hasActive = !!subName;
  return (
    <div
      style={{
        height: 26,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 12px",
        borderTop: "1px solid var(--border-primary)",
        background: "var(--bg-secondary)",
        fontSize: 11,
        color: "var(--text-muted)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: hasActive ? "var(--green)" : "var(--text-muted)",
            display: "inline-block",
          }}
        />
        {hasActive ? `${subName} (${modelName})` : "未激活套餐"}
      </div>
    </div>
  );
}
