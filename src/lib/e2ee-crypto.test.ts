import { describe, expect, it } from "vitest";
import { decryptText, encryptText, exportPublicJwk, generateDeviceKeyPair, generateFamilyKey, unwrapFamilyKey, wrapFamilyKey } from "./e2ee-crypto";

const fam = "f1", user = "u1";
describe("family E2EE crypto", () => {
  it("ciphertext does not contain the plaintext and decrypts back", async () => {
    const k = await generateFamilyKey();
    const c = await encryptText(k, "Привет, бабушка", { familyId: fam, userId: user, version: 1 });
    expect(c.ciphertext).not.toContain("Привет");
    expect(await decryptText(k, c, { familyId: fam, userId: user, version: 1 })).toBe("Привет, бабушка");
  });
  it("re-attributing a message to another sender fails", async () => {
    const k = await generateFamilyKey();
    const c = await encryptText(k, "x", { familyId: fam, userId: user, version: 1 });
    await expect(decryptText(k, c, { familyId: fam, userId: "u2", version: 1 })).rejects.toThrow();
  });
  it("only the recipient device can unwrap the family key", async () => {
    const k = await generateFamilyKey();
    const alice = await generateDeviceKeyPair(), eve = await generateDeviceKeyPair();
    const ctx = { familyId: fam, version: 1, deviceId: "d1" };
    const share = await wrapFamilyKey(k, await exportPublicJwk(alice.publicKey), ctx);
    const got = await unwrapFamilyKey(share, alice.privateKey, ctx);
    const c = await encryptText(k, "тайна", { familyId: fam, userId: user, version: 1 });
    expect(await decryptText(got, c, { familyId: fam, userId: user, version: 1 })).toBe("тайна");
    await expect(unwrapFamilyKey(share, eve.privateKey, ctx)).rejects.toThrow();
  });
  it("a rotated key cannot read messages of the new version with the old key", async () => {
    const v1 = await generateFamilyKey(), v2 = await generateFamilyKey();
    const c = await encryptText(v2, "после исключения", { familyId: fam, userId: user, version: 2 });
    await expect(decryptText(v1, c, { familyId: fam, userId: user, version: 2 })).rejects.toThrow();
  });
  it("device private key cannot be exported", async () => {
    const d = await generateDeviceKeyPair();
    await expect(crypto.subtle.exportKey("jwk", d.privateKey)).rejects.toThrow();
  });
});
