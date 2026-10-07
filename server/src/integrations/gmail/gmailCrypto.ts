import crypto from "crypto";

/**
 * Phase 16 — Server-Side Credential Encryption at Rest
 *
 * Implements AES-256-GCM authenticated encryption for OAuth access and refresh tokens.
 * Plaintext credentials never leave the secure server boundary, are never logged,
 * and are never exposed to LLM prompts, task results, or client APIs.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard for GCM
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const secret =
    process.env.GMAIL_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    "ai-workforce-gmail-default-secret-salt-2026";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a plaintext credential string using AES-256-GCM.
 * Output format: iv:authTag:ciphertext (hex encoded)
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) {
    return "";
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted credential string.
 * Validates integrity via the GCM authentication tag.
 */
export function decryptSecret(encryptedPayload: string): string {
  if (!encryptedPayload) {
    return "";
  }

  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted credential format.");
  }

  const [ivHex, authTagHex, cipherHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipherHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
