export type ClipboardRead =
  | { ok: true; text: string }
  | { ok: false; reason: 'unavailable' | 'denied' }

/**
 * Read the system clipboard. Browsers only expose this on secure origins and
 * may reject it without a direct user gesture, so callers must always provide
 * a manual paste fallback.
 */
export async function readClipboardText(): Promise<ClipboardRead> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
    return { ok: false, reason: 'unavailable' }
  }
  try {
    return { ok: true, text: await navigator.clipboard.readText() }
  } catch {
    return { ok: false, reason: 'denied' }
  }
}
