/**
 * Lovable preview auth uses the browser's localStorage as a fallback when its
 * editor broker is unavailable. Third-party storage can throw in preview iframes.
 * Install a tab-local fallback before the generated Supabase client is first used.
 */
const PREVIEW_ZONES = [
  "lovableproject.com",
  "lovableproject-dev.com",
  "lovable.app",
  "gpt-eng.com",
  "gptengineer.run",
];

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(String(key)) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(String(key));
    },
    setItem(key: string, value: string) {
      values.set(String(key), String(value));
    },
  };
}

export function installPreviewStorageGuard(target?: Window): void {
  const win = target ?? (typeof window !== "undefined" ? window : undefined);
  if (!win) return;

  const host = win.location.hostname.toLowerCase();
  const isPreview = PREVIEW_ZONES.some((zone) => host === zone || host.endsWith("." + zone));
  if (!isPreview || win.parent === win) return;

  try {
    const storage = win.localStorage;
    const probe = "__semeyny_storage_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return;
  } catch {
    // The browser may throw either while reading localStorage or when using it.
  }

  try {
    Object.defineProperty(win, "localStorage", {
      configurable: true,
      value: memoryStorage(),
    });
  } catch (error) {
    // If the browser forbids overriding the blocked getter, keep the app alive;
    // the generated adapter will still attempt its trusted editor broker.
    console.warn("[Auth] Could not install preview storage fallback", error);
  }
}
