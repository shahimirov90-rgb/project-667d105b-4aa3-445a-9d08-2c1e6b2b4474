import { describe, expect, it } from "vitest";
import { canDistributeKeyTo, canReceiveKeyVersion, requiresFamilyKeyRotation } from "./e2ee-access";

describe("E2EE family key access", () => {
  it("allows a member to receive versions created after they joined", () => {
    expect(canReceiveKeyVersion("2026-01-01T10:00:00.000Z", "2026-01-01T10:00:01.000Z")).toBe(true);
    expect(canReceiveKeyVersion("2026-01-01T10:00:00.000Z", "2026-01-01T10:00:00.000Z")).toBe(true);
  });

  it("does not give a new member access to versions created before joining", () => {
    expect(canReceiveKeyVersion("2026-01-02T10:00:00.000Z", "2026-01-01T10:00:00.000Z")).toBe(false);
  });

  it("rejects invalid timestamps rather than granting access", () => {
    expect(canReceiveKeyVersion("invalid", "2026-01-01T10:00:00.000Z")).toBe(false);
    expect(canReceiveKeyVersion("2026-01-01T10:00:00.000Z", "invalid")).toBe(false);
  });

  it("preserves microsecond ordering when timestamps fall in the same millisecond", () => {
    expect(canReceiveKeyVersion("2026-01-01T10:00:00.123456Z", "2026-01-01T10:00:00.123455Z")).toBe(false);
    expect(canReceiveKeyVersion("2026-01-01T10:00:00.123455Z", "2026-01-01T10:00:00.123456Z")).toBe(true);
  });


  it("allows owners and admins to distribute keys to another member device", () => {
    expect(canDistributeKeyTo("admin-user", "member-user", true)).toBe(true);
  });

  it("allows a regular member to provision only their own devices", () => {
    expect(canDistributeKeyTo("member-user", "member-user", false)).toBe(true);
    expect(canDistributeKeyTo("member-user", "other-user", false)).toBe(false);
  });

  it("rotates when a new active device has no latest key share", () => {
    expect(requiresFamilyKeyRotation(["owner-phone", "new-member-phone"], ["owner-phone"])).toBe(true);
  });

  it("rotates when a share still targets a removed or revoked device", () => {
    expect(requiresFamilyKeyRotation(["owner-phone"], ["owner-phone", "removed-device"])).toBe(true);
  });

  it("does not rotate when active devices and latest shares match", () => {
    expect(requiresFamilyKeyRotation(["owner-phone", "member-laptop"], ["member-laptop", "owner-phone"])).toBe(false);
  });

  it("rotates when no latest-version shares exist", () => {
    expect(requiresFamilyKeyRotation(["owner-phone"], [])).toBe(true);
  });
});
