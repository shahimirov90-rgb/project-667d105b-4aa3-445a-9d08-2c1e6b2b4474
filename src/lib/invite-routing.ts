/** Build a safe post-auth destination, preserving invite links when sessionStorage is unavailable. */
export function inviteRedirectPath(search: string, storedCode: string | null): string {
  const code = new URLSearchParams(search).get("invite") || storedCode;
  return code ? `/invite/${encodeURIComponent(code)}` : "/chat";
}
