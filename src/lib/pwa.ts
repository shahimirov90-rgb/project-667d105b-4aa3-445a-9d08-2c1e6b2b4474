/** The only service-worker registrar. Never registers in dev, preview, or iframes. */
const PREVIEW_LABEL = /^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/;
const LOVABLE_HOSTS = [".lovable.app", ".gpt-eng.com", ".gptengineer.run"];

export function swAllowed(href: string, inIframe: boolean, prod: boolean): boolean {
  const url = new URL(href);
  const host = url.hostname.toLowerCase();
  const label = host.split(".")[0] ?? "";
  if (!prod || inIframe || url.searchParams.get("sw") === "off") return false;
  if (LOVABLE_HOSTS.some((d) => host.endsWith(d)) && (PREVIEW_LABEL.test(label) || /^project--.+-dev$/.test(label))) return false;
  if (/(^|\.)lovableproject(-dev)?\.com$/.test(host) || /(^|\.)beta\.lovable\.dev$/.test(host)) return false;
  return true;
}

export async function setupServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    let inIframe = true;
    try { inIframe = window.self !== window.top; } catch { /* cross-origin parent */ }
    if (!swAllowed(window.location.href, inIframe, import.meta.env.PROD)) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.filter((r) => r.active?.scriptURL.endsWith("/sw.js")).map((r) => r.unregister()));
      return;
    }
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({ immediate: true });
  } catch (error) {
    // Offline/PWA setup must not prevent the application itself from rendering.
    console.warn("[PWA] Service worker setup failed", error);
  }
}
