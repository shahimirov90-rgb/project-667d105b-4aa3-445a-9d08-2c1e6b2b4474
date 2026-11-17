/** Build a safe post-auth destination, preserving invite links when sessionStorage is unavailable. */
export function inviteRedirectPath(search: string, storedCode: string | null): string {
  const code = storedCode || new URLSearchParams(search).get("invite");
  return code ? `/invite/${encodeURIComponent(code)}` : "/chat";
}
