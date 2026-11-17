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
  it("rejects non-media files", () => {
    expect(validateMedia({ type: "application/pdf", size: 1000 }).ok).toBe(false);
  });
});
