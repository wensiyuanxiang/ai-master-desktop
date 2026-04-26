/**
 * Opens a URL in the system default browser. In the Tauri desktop shell,
 * `window.open` is often blocked; we prefer the opener plugin.
 */
export async function openExternalUrl(raw: string): Promise<void> {
  const trimmed = raw.trim();
  if (!trimmed) return;
  let target = trimmed;
  if (!/^https?:\/\//i.test(target)) {
    target = `https://${target}`;
  }
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(target);
    return;
  } catch {
    // Web-only dev or plugin unavailable
  }
  const handle = window.open(target, "_blank", "noreferrer");
  if (!handle) {
    throw new Error("open blocked");
  }
}
