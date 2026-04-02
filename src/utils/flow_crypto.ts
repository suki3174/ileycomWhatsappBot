/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import fs from "fs";

export interface DecryptedFlowResult<TParsed = any> {
  parsed: TParsed;
  aesKey: Buffer;
  iv: Buffer;
}

export function decryptFlowPayload<TParsed = any>(body: {
  encrypted_flow_data?: string;
  encrypted_aes_key?: string;
  initial_vector?: string;
}): DecryptedFlowResult<TParsed> {
  const { encrypted_flow_data, encrypted_aes_key, initial_vector } = body;
  if (!encrypted_flow_data || !encrypted_aes_key || !initial_vector) {
    throw new Error("Missing parameters");
  }

  if (!process.env.PRIVATE_KEY_PATH) {
    throw new Error("Server private key path not configured");
  }

  let privateKeyPem: string;
  try {
    privateKeyPem = fs.readFileSync(process.env.PRIVATE_KEY_PATH, "utf8");
  } catch (e: any) {
    console.error("Failed to read PRIVATE_KEY_PATH file:", e?.message || e);
    throw new Error("Failed to read PRIVATE_KEY_PATH file");
  }

  const privateKeyObj = crypto.createPrivateKey({
    key: privateKeyPem,
    format: "pem",
  });

  const aesKey = crypto.privateDecrypt(
    {
      key: privateKeyObj,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(encrypted_aes_key, "base64"),
  );

  if (!Buffer.isBuffer(aesKey) || aesKey.length !== 16) {
    throw new Error("Invalid AES key length");
  }

  const iv = Buffer.from(initial_vector, "base64");
  if (iv.length !== 16) {
    throw new Error("Invalid IV length");
  }

  const buf = Buffer.from(encrypted_flow_data, "base64");
  const TAG_LENGTH = 16;
  if (buf.length < TAG_LENGTH) {
    throw new Error("Invalid encrypted_flow_data");
  }
  const ciphertext = buf.subarray(0, buf.length - TAG_LENGTH);
  const authTag = buf.subarray(buf.length - TAG_LENGTH);

  const decipher = crypto.createDecipheriv("aes-128-gcm", aesKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  const parsed = JSON.parse(decrypted.toString("utf8")) as TParsed;

  return { parsed, aesKey, iv };
}

export function encryptFlowResponse(
  response: any,
  aesKey: Buffer,
  iv: Buffer,
): string {
  const flipped = Buffer.alloc(iv.length);
  for (let i = 0; i < iv.length; i++) {
    flipped[i] = (~iv[i]) & 0xff;
  }

  const cipher = crypto.createCipheriv("aes-128-gcm", aesKey, flipped);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(response), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const out = Buffer.concat([encrypted, tag]);

  return out.toString("base64");
}


export async function decryptWhatsAppMedia(img: {
  cdn_url: string;
  encryption_metadata: {
    encryption_key: string;
    hmac_key: string;
    iv: string;
    plaintext_hash: string;
    encrypted_hash: string;
  };
}): Promise<Buffer | null> {
  try {
    const encryptionKey = Buffer.from(img.encryption_metadata.encryption_key, "base64");
    const hmacKey       = Buffer.from(img.encryption_metadata.hmac_key, "base64");
    const iv            = Buffer.from(img.encryption_metadata.iv, "base64");

    const response = await fetch(img.cdn_url, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.warn("WhatsApp CDN fetch failed:", img.cdn_url, response.status);
      return null;
    }
    const encryptedBytes = Buffer.from(await response.arrayBuffer());

    const mac        = encryptedBytes.subarray(encryptedBytes.length - 10);
    const ciphertext = encryptedBytes.subarray(0, encryptedBytes.length - 10);

    const hmac = crypto.createHmac("sha256", hmacKey);
    hmac.update(iv);
    hmac.update(ciphertext);
    const expectedMac = hmac.digest().subarray(0, 10);

    if (!crypto.timingSafeEqual(expectedMac, mac)) {
      console.warn("WhatsApp media HMAC verification failed:", img.cdn_url);
      return null;
    }

    const decipher = crypto.createDecipheriv("aes-256-cbc", encryptionKey, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    console.warn("decryptWhatsAppMedia error:", err);
    return null;
  }
}