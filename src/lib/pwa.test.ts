import { describe, expect, it } from "vitest";
import { swAllowed } from "./pwa";

describe("service worker guard", () => {
  it("never registers in the Lovable preview", () => {
    expect(swAllowed("https://id-preview--667d105b-4aa3-445a-9d08-2c1e6b2b4474.lovable.app/chat", false, true)).toBe(false);
  });
  it("never registers inside an iframe", () => {
    expect(swAllowed("https://semya.lovable.app/", true, true)).toBe(false);
  });
  it("never registers in dev", () => {
    expect(swAllowed("https://semya.lovable.app/", false, false)).toBe(false);
  });
  it("honours the ?sw=off kill switch", () => {
    expect(swAllowed("https://semya.lovable.app/?sw=off", false, true)).toBe(false);
  });
  it("registers on the published site", () => {
    expect(swAllowed("https://semya.lovable.app/chat", false, true)).toBe(true);
  });
});
