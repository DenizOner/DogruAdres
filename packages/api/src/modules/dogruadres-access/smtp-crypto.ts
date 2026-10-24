import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const CIPHER_ALGO = "aes-256-gcm"
const IV_LENGTH = 12
const TAG_LENGTH = 16

export class SmtpCryptoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SmtpCryptoError"
  }
}

export function getSmtpEncryptionKey(): Buffer {
  const raw = process.env.DOGRUADRES_SMTP_ENCRYPTION_KEY
  if (!raw) {
    throw new SmtpCryptoError("DOGRUADRES_SMTP_ENCRYPTION_KEY must be configured")
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex")
  }
  const buf = Buffer.from(raw, "utf8")
  if (buf.length !== 32) {
    throw new SmtpCryptoError("DOGRUADRES_SMTP_ENCRYPTION_KEY must be exactly 32 bytes or 64 hex characters")
  }
  return buf
}

export function encryptSmtpPassword(plaintext: string): string {
  if (!plaintext) {
    throw new SmtpCryptoError("Plaintext password cannot be empty")
  }
  const key = getSmtpEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(CIPHER_ALGO, key, iv)

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`
}

export function decryptSmtpPassword(ciphertext: string): string {
  if (!ciphertext || !ciphertext.startsWith("v1:")) {
    throw new SmtpCryptoError("Invalid or unsupported ciphertext format")
  }
  const parts = ciphertext.split(":")
  if (parts.length !== 4) {
    throw new SmtpCryptoError("Malformed ciphertext structure")
  }
  const [, ivHex, tagHex, dataHex] = parts
  const iv = Buffer.from(ivHex, "hex")
  const tag = Buffer.from(tagHex, "hex")
  const data = Buffer.from(dataHex, "hex")

  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new SmtpCryptoError("Invalid IV or authentication tag length")
  }

  const key = getSmtpEncryptionKey()
  const decipher = createDecipheriv(CIPHER_ALGO, key, iv)
  decipher.setAuthTag(tag)

  try {
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
    return decrypted.toString("utf8")
  } catch (err) {
    throw new SmtpCryptoError("Decryption failed: authentication tag mismatch or corrupted ciphertext")
  }
}
