/** Pure Web Crypto helpers for family E2EE. No network, no storage. */
const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
};
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function e2eeSupported() {
  return typeof crypto !== "undefined" && !!crypto.subtle && typeof indexedDB !== "undefined";
}

/** Device key pair: the private key is NON-extractable, so it can never be exported from the browser. */
export async function generateDeviceKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ECDH, false, ["deriveKey"]) as Promise<CryptoKeyPair>;
}
export async function exportPublicJwk(key: CryptoKey): Promise<JsonWebKey> {
  const { kty, crv, x, y } = await crypto.subtle.exportKey("jwk", key);
  return { kty: kty!, crv: crv!, x: x!, y: y! };
}

/** Family key is kept extractable only in memory so this device can re-wrap it for other relatives' devices. */
export async function generateFamilyKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

const shareAad = (familyId: string, version: number, deviceId: string) => enc.encode(`share|${familyId}|${version}|${deviceId}`);
const msgAad = (familyId: string, userId: string, version: number) => enc.encode(`msg|${familyId}|${userId}|${version}`);

export type WrappedShare = { eph_public_key: JsonWebKey; iv: string; wrapped_key: string };

/** Encrypt the family key for one device with an ephemeral ECDH key (ECIES-style). */
export async function wrapFamilyKey(familyKey: CryptoKey, recipient: JsonWebKey, ctx: { familyId: string; version: number; deviceId: string }): Promise<WrappedShare> {
  const eph = (await crypto.subtle.generateKey(ECDH, false, ["deriveKey"])) as CryptoKeyPair;
  const pub = await crypto.subtle.importKey("jwk", recipient, ECDH, false, []);
  const kek = await crypto.subtle.deriveKey({ name: "ECDH", public: pub }, eph.privateKey, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const raw = await crypto.subtle.exportKey("raw", familyKey);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: shareAad(ctx.familyId, ctx.version, ctx.deviceId) }, kek, raw);
  return { eph_public_key: await exportPublicJwk(eph.publicKey), iv: b64(iv), wrapped_key: b64(ct) };
}

export async function unwrapFamilyKey(share: WrappedShare, devicePrivate: CryptoKey, ctx: { familyId: string; version: number; deviceId: string }): Promise<CryptoKey> {
  const pub = await crypto.subtle.importKey("jwk", share.eph_public_key, ECDH, false, []);
  const kek = await crypto.subtle.deriveKey({ name: "ECDH", public: pub }, devicePrivate, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(share.iv), additionalData: shareAad(ctx.familyId, ctx.version, ctx.deviceId) }, kek, unb64(share.wrapped_key));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

/** AAD binds ciphertext to family, sender and key version: the server cannot move or re-attribute messages. */
export async function encryptText(key: CryptoKey, text: string, ctx: { familyId: string; userId: string; version: number }) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: msgAad(ctx.familyId, ctx.userId, ctx.version) }, key, enc.encode(text));
  return { ciphertext: b64(ct), iv: b64(iv), key_version: ctx.version };
}
export async function decryptText(key: CryptoKey, m: { ciphertext: string; iv: string }, ctx: { familyId: string; userId: string; version: number }) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(m.iv), additionalData: msgAad(ctx.familyId, ctx.userId, ctx.version) }, key, unb64(m.ciphertext));
  return dec.decode(pt);
}

/** Short human-comparable fingerprint of a public key. */
export async function fingerprint(jwk: JsonWebKey) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`${jwk.x}.${jwk.y}`)));
  return Array.from(h.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase().match(/.{4}/g)!.join(" ");
}
