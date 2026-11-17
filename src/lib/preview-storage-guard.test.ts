import { describe, expect, it, vi } from "vitest";
import { installPreviewStorageGuard } from "./preview-storage-guard";

function fakeWindow(hostname: string, framed: boolean, storage: Storage | (() => never)): Window {
  const win = { location: { hostname } } as unknown as Window;
  Object.defineProperty(win, "parent", { configurable: true, value: framed ? {} : win });
  Object.defineProperty(win, "localStorage", {
    configurable: true,
    get: typeof storage === "function" ? storage : () => storage,
  });
  return win;
}

describe("preview storage guard", () => {
  it("replaces blocked third-party storage with a tab-local fallback", () => {
    const win = fakeWindow("id-preview--project.lovable.app", true, () => {
      throw new DOMException("Storage blocked", "SecurityError");
    });

    installPreviewStorageGuard(win);

    win.localStorage.setItem("session", "token");
    expect(win.localStorage.getItem("session")).toBe("token");
    win.localStorage.removeItem("session");
    expect(win.localStorage.getItem("session")).toBeNull();
  });

  it("replaces storage whose methods throw, not only a throwing getter", () => {
    const broken = {
      getItem: () => { throw new DOMException("Blocked", "SecurityError"); },
      setItem: () => { throw new DOMException("Blocked", "SecurityError"); },
      removeItem: () => { throw new DOMException("Blocked", "SecurityError"); },
      key: () => null,
      clear: () => {},
      length: 0,
    } as unknown as Storage;
    const win = fakeWindow("preview--project.gpt-eng.com", true, broken);

    installPreviewStorageGuard(win);

    expect(() => win.localStorage.setItem("key", "value")).not.toThrow();
    expect(win.localStorage.getItem("key")).toBe("value");
  });

  it("leaves working localStorage unchanged", () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      key: () => null,
      clear: () => {},
      length: 0,
    } as unknown as Storage;
    const win = fakeWindow("id-preview--project.lovable.app", true, storage);

    installPreviewStorageGuard(win);

    expect(win.localStorage).toBe(storage);
  });

  it("does not replace storage outside a preview iframe", () => {
    const getter = vi.fn(() => {
      throw new DOMException("Storage blocked", "SecurityError");
    });
    const win = fakeWindow("example.com", true, getter);

    installPreviewStorageGuard(win);

    expect(() => win.localStorage.getItem("key")).toThrow();
  });
});
