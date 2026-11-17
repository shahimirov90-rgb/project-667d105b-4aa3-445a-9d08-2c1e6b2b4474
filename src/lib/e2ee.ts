import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { decryptText, e2eeSupported, encryptText, exportPublicJwk, fingerprint, generateDeviceKeyPair, generateFamilyKey, unwrapFamilyKey, wrapFamilyKey } from "./e2ee-crypto";

/* ---------- device key storage (IndexedDB, private key non-extractable) ---------- */
type StoredDevice = { deviceId: string; privateKey: CryptoKey; publicJwk: JsonWebKey };
const DB = "semeyny-krug-e2ee", STORE = "devices";
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(userId: string): Promise<StoredDevice | undefined> {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE);
    const r = tx.objectStore(STORE).get(userId);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); rej(tx.error); };
    tx.onabort = () => { db.close(); rej(tx.error); };
  });
}
async function idbPut(userId: string, v: StoredDevice) {
  const db = await idb();
  return new Promise<void>((res, rej) => {
    const t = db.transaction(STORE, "readwrite");
    t.objectStore(STORE).put(v, userId);
    t.oncomplete = () => { db.close(); res(); };
    t.onerror = () => { db.close(); rej(t.error); };
    t.onabort = () => { db.close(); rej(t.error); };
  });
}

async function ensureDevice(userId: string): Promise<StoredDevice> {
  const saved = await idbGet(userId);
  if (saved) {
    const { data, error } = await supabase.from("device_keys").select("id, revoked_at").eq("id", saved.deviceId).maybeSingle();
    // A transient database/network error must not silently register a second device.
    if (error) throw error;
    if (data && !data.revoked_at) return saved;
  }
  const pair = await generateDeviceKeyPair();
  const publicJwk = await exportPublicJwk(pair.publicKey);
  const label = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 120) : null;
  const { data, error } = await supabase.from("device_keys").insert({ user_id: userId, public_key: publicJwk as Json, label }).select("id").single();
  if (error) throw error;
  const dev = { deviceId: data.id, privateKey: pair.privateKey, publicJwk };
  await idbPut(userId, dev);
  return dev;
}

/* ---------- family key sync ---------- */
export type E2EEState = {
  status: "ready" | "waiting" | "unsupported";
  keys: Map<number, CryptoKey>;
  current: number | null;
  fingerprint: string | null;
};

type Device = { id: string; user_id: string; public_key: JsonWebKey };

async function shareTo(familyId: string, userId: string, version: number, key: CryptoKey, devices: Device[]) {
  if (!devices.length) return;
  const rows = await Promise.all(devices.map(async (d) => ({
    family_id: familyId, version, device_id: d.id, created_by: userId,
    ...(await wrapFamilyKey(key, d.public_key, { familyId, version, deviceId: d.id })),
  })));
  const { error } = await supabase.from("family_key_shares").upsert(rows.map((r) => ({ ...r, eph_public_key: r.eph_public_key as Json })), { onConflict: "family_id,version,device_id", ignoreDuplicates: true });
  if (error) throw error;
}

async function createVersion(familyId: string, userId: string, version: number, devices: Device[]) {
  const { error } = await supabase.from("family_keys").insert({ family_id: familyId, version, created_by: userId });
  if (error) return false; // another relative created this version first
  const key = await generateFamilyKey();
  await shareTo(familyId, userId, version, key, devices);
  return true;
}

export async function syncFamilyKeys(familyId: string, userId: string, memberIds: string[], canManageKeys: boolean, attempt = 0): Promise<E2EEState> {
  if (!e2eeSupported()) return { status: "unsupported", keys: new Map(), current: null, fingerprint: null };
  const me = await ensureDevice(userId);
  const [versions, shares, devs] = await Promise.all([
    supabase.from("family_keys").select("version").eq("family_id", familyId),
    supabase.from("family_key_shares").select("version, device_id, eph_public_key, iv, wrapped_key").eq("family_id", familyId),
    supabase.from("device_keys").select("id, user_id, public_key").in("user_id", memberIds).is("revoked_at", null),
  ]);
  if (versions.error) throw versions.error;
  if (shares.error) throw shares.error;
  if (devs.error) throw devs.error;
  const devices = (devs.data as unknown as Device[]).filter((d) => memberIds.includes(d.user_id));
  const activeIds = new Set(devices.map((d) => d.id));

  if (!versions.data.length) {
    if (!canManageKeys) return { status: "waiting", keys: new Map(), current: null, fingerprint: await fingerprint(me.publicJwk) };
    if (attempt >= 3) throw new Error("Не удалось создать ключ шифрования семьи");
    await createVersion(familyId, userId, 1, devices);
    return syncFamilyKeys(familyId, userId, memberIds, canManageKeys, attempt + 1);
  }

  const keys = new Map<number, CryptoKey>();
  for (const s of shares.data.filter((s) => s.device_id === me.deviceId)) {
    try {
      keys.set(s.version, await unwrapFamilyKey({ eph_public_key: s.eph_public_key as JsonWebKey, iv: s.iv, wrapped_key: s.wrapped_key }, me.privateKey, { familyId, version: s.version, deviceId: me.deviceId }));
    } catch { /* corrupted or forged share: ignore */ }
  }
  const latest = Math.max(...versions.data.map((v) => v.version));
  const fp = await fingerprint(me.publicJwk);

  // Detect former-member/revoked-device shares and orphaned versions before requiring
  // this device to hold the latest key. Only an owner/admin may rotate the family key.
  const latestHolders = shares.data.filter((s) => s.version === latest).map((s) => s.device_id);
  const needsRotation = latestHolders.length === 0 || latestHolders.some((id) => !activeIds.has(id));
  if (needsRotation) {
    if (!canManageKeys) return { status: "waiting", keys, current: null, fingerprint: fp };
    if (attempt >= 3) throw new Error("Не удалось обновить ключ шифрования семьи");
    await createVersion(familyId, userId, latest + 1, devices);
    return syncFamilyKeys(familyId, userId, memberIds, canManageKeys, attempt + 1);
  }

  const latestKey = keys.get(latest);
  if (!latestKey) {
    if (!canManageKeys) return { status: "waiting", keys, current: null, fingerprint: fp };
    // An owner/admin on a replacement device may not possess the latest key.
    // Since only an authorized role can create versions, rotate a fresh key and
    // distribute it to active devices rather than leaving the family stuck.
    if (attempt >= 3) throw new Error("Не удалось восстановить ключ шифрования семьи");
    await createVersion(familyId, userId, latest + 1, devices);
    return syncFamilyKeys(familyId, userId, memberIds, canManageKeys, attempt + 1);
  }

  // Distribution: give every key version this device holds to member devices that don't have it yet
  // (new relatives after approval, relatives' new phones/browsers).
  for (const [v, k] of keys) {
    const have = new Set(shares.data.filter((s) => s.version === v).map((s) => s.device_id));
    await shareTo(familyId, userId, v, k, devices.filter((d) => !have.has(d.id) && (canManageKeys || d.user_id === userId)));
  }
  return { status: "ready", keys, current: latest, fingerprint: fp };
}

export function useFamilyKeys(familyId: string, userId: string, memberIds: string[] | undefined, canManageKeys: boolean) {
  return useQuery({
    queryKey: ["e2ee", familyId, userId, canManageKeys, (memberIds ?? []).slice().sort().join(",")],
    enabled: !!memberIds?.length,
    structuralSharing: false,
    refetchInterval: 20000,
    queryFn: () => syncFamilyKeys(familyId, userId, memberIds!, canManageKeys),
  });
}

export type Decrypted = { text: string | null; state: "ok" | "plain" | "nokey" | "fail" | "none" };
export async function decryptMessage(state: E2EEState | undefined, familyId: string, m: { user_id: string; body: string | null; ciphertext: string | null; iv: string | null; key_version: number | null }): Promise<Decrypted> {
  if (m.ciphertext && m.iv && m.key_version) {
    const k = state?.keys.get(m.key_version);
    if (!k) return { text: null, state: "nokey" };
    try { return { text: await decryptText(k, { ciphertext: m.ciphertext, iv: m.iv }, { familyId, userId: m.user_id, version: m.key_version }), state: "ok" }; }
    catch { return { text: null, state: "fail" }; }
  }
  return m.body ? { text: m.body, state: "plain" } : { text: null, state: "none" };
}
export async function encryptForFamily(state: E2EEState, familyId: string, userId: string, text: string) {
  if (state.status !== "ready" || !state.current) throw new Error("Ключ шифрования ещё не получен — текст отправить нельзя");
  return encryptText(state.keys.get(state.current)!, text, { familyId, userId, version: state.current });
}
