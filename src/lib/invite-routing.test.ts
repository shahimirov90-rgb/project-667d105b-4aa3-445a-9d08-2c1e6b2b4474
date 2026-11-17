import { describe, expect, it } from "vitest";
import { inviteRedirectPath } from "./invite-routing";

describe("inviteRedirectPath", () => {
  it("prefers the current URL invite over stale session storage", () => {
    expect(inviteRedirectPath("?invite=from-url", "stale-storage")).toBe("/invite/from-url");
  });

  it("uses session storage when there is no URL invite", () => {
    expect(inviteRedirectPath("", "from-storage")).toBe("/invite/from-storage");
  });

  it("uses the URL parameter when storage is unavailable", () => {
    expect(inviteRedirectPath("?invite=ABC123", null)).toBe("/invite/ABC123");
  });

  it("falls back to chat when there is no pending invite", () => {
    expect(inviteRedirectPath("", null)).toBe("/chat");
  });

  it("encodes an invite code before using it as a route segment", () => {
    expect(inviteRedirectPath("?invite=a%2Fb", null)).toBe("/invite/a%2Fb");
  });
});
