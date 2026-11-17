import { describe, expect, it } from "vitest";
import { validateMedia } from "./family";

describe("validateMedia", () => {
  it("accepts a 10 MB jpeg photo", () => {
    expect(validateMedia({ type: "image/jpeg", size: 10 * 1024 * 1024 })).toMatchObject({ ok: true, kind: "image" });
  });
  it("rejects photos over 15 MB", () => {
    expect(validateMedia({ type: "image/png", size: 16 * 1024 * 1024 }).ok).toBe(false);
  });
  it("rejects videos over 50 MB", () => {
    expect(validateMedia({ type: "video/mp4", size: 51 * 1024 * 1024 }).ok).toBe(false);
  });
  it("rejects empty files", () => {
    expect(validateMedia({ type: "image/jpeg", size: 0 }).ok).toBe(false);
  });
  it("rejects non-finite file sizes", () => {
    expect(validateMedia({ type: "image/jpeg", size: Number.NaN }).ok).toBe(false);
    expect(validateMedia({ type: "image/jpeg", size: Number.POSITIVE_INFINITY }).ok).toBe(false);
  });
  it("rejects non-media files", () => {
    expect(validateMedia({ type: "application/pdf", size: 1000 }).ok).toBe(false);
  });
});

describe("swAllowed", () => {
  it("does not register outside production, in iframes, or when explicitly disabled", async () => {
    const { swAllowed } = await import("./pwa");
    expect(swAllowed("https://example.com", false, false)).toBe(false);
    expect(swAllowed("https://example.com", true, true)).toBe(false);
    expect(swAllowed("https://example.com/?sw=off", false, true)).toBe(false);
  });

  it("does not register on Lovable preview and development hosts", async () => {
    const { swAllowed } = await import("./pwa");
    expect(swAllowed("https://id-preview-abc--project.lovable.app", false, true)).toBe(false);
    expect(swAllowed("https://project--abc-dev.gpt-eng.com", false, true)).toBe(false);
    expect(swAllowed("https://my-project.lovableproject.com", false, true)).toBe(false);
    expect(swAllowed("https://beta.lovable.dev", false, true)).toBe(false);
  });

  it("registers on a regular production host", async () => {
    const { swAllowed } = await import("./pwa");
    expect(swAllowed("https://family.example.com", false, true)).toBe(true);
  });
});
