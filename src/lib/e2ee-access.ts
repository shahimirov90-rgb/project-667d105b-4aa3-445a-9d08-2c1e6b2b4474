/** E2EE key distribution rules that can be tested without a live Supabase client. */

/** Parse Postgres ISO timestamps to microseconds; Date.parse alone loses sub-ms precision. */
function timestampMicros(value: string): number | null {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const fraction = value.match(/\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)/i)?.[1] ?? "";
  const microseconds = Number((fraction + "000000").slice(0, 6));
  const parsedMillisecondFraction = new Date(milliseconds).getUTCMilliseconds() * 1000;
  const exact = milliseconds * 1000 + microseconds - parsedMillisecondFraction;
  return Number.isSafeInteger(exact) ? exact : null;
}

/** A member may receive only key versions created strictly after their join time. */
export function canReceiveKeyVersion(joinedAt: string, keyCreatedAt: string): boolean {
  const joined = timestampMicros(joinedAt);
  const created = timestampMicros(keyCreatedAt);
  // Equality is ambiguous at PostgreSQL's microsecond precision; fail closed.
  return joined !== null && created !== null && joined < created;
}

/** A membership not strictly earlier than the latest key version requires a fresh family key. */
export function requiresMembershipKeyRotation(joinedAtValues: string[], latestKeyCreatedAt: string): boolean {
  return joinedAtValues.some((joinedAt) => !canReceiveKeyVersion(joinedAt, latestKeyCreatedAt));
}

/** Rotate whenever the active-device set and latest-version share set differ. */
export function requiresFamilyKeyRotation(activeDeviceIds: string[], latestShareDeviceIds: string[]): boolean {
  const active = new Set(activeDeviceIds);
  const shared = new Set(latestShareDeviceIds);
  if (shared.size === 0) return true;
  for (const id of active) if (!shared.has(id)) return true;
  for (const id of shared) if (!active.has(id)) return true;
  return false;
}

/** Only owners/admins may distribute family keys to another member's device. */
export function canDistributeKeyTo(senderUserId: string, recipientUserId: string, canManageKeys: boolean): boolean {
  return canManageKeys || senderUserId === recipientUserId;
}
