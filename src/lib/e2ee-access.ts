/** E2EE key distribution rules that can be tested without a live Supabase client. */

/** A member may receive only key versions created after they joined the family. */
export function canReceiveKeyVersion(joinedAt: string, keyCreatedAt: string): boolean {
  const joined = Date.parse(joinedAt);
  const created = Date.parse(keyCreatedAt);
  return Number.isFinite(joined) && Number.isFinite(created) && joined <= created;
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
