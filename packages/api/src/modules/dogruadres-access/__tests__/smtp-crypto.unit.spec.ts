import {
  encryptSmtpPassword,
  decryptSmtpPassword,
  getSmtpEncryptionKey,
  SmtpCryptoError,
} from "../smtp-crypto"

describe("smtp-crypto unit tests", () => {
  const originalKey = process.env.DOGRUADRES_SMTP_ENCRYPTION_KEY

  beforeEach(() => {
    process.env.DOGRUADRES_SMTP_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  })

  afterAll(() => {
    if (originalKey !== undefined) {
      process.env.DOGRUADRES_SMTP_ENCRYPTION_KEY = originalKey
    } else {
      delete process.env.DOGRUADRES_SMTP_ENCRYPTION_KEY
    }
  })

  it("throws SmtpCryptoError when key is missing or shorter than 32 bytes", () => {
    delete process.env.DOGRUADRES_SMTP_ENCRYPTION_KEY
    expect(() => getSmtpEncryptionKey()).toThrow(SmtpCryptoError)

    process.env.DOGRUADRES_SMTP_ENCRYPTION_KEY = "too-short-key"
    expect(() => getSmtpEncryptionKey()).toThrow(SmtpCryptoError)
  })

  it("successfully encrypts and decrypts an SMTP password", () => {
    const password = "super-secret-smtp-password-1234"
    const encrypted = encryptSmtpPassword(password)

    expect(encrypted.startsWith("v1:")).toBe(true)
    expect(encrypted).not.toContain(password)

    const decrypted = decryptSmtpPassword(encrypted)
    expect(decrypted).toBe(password)
  })

  it("produces distinct ciphertexts for identical inputs due to random IV", () => {
    const password = "same-password"
    const enc1 = encryptSmtpPassword(password)
    const enc2 = encryptSmtpPassword(password)

    expect(enc1).not.toBe(enc2)
    expect(decryptSmtpPassword(enc1)).toBe(password)
    expect(decryptSmtpPassword(enc2)).toBe(password)
  })

  it("fails closed when ciphertext is tampered with", () => {
    const password = "sensitive-token"
    const encrypted = encryptSmtpPassword(password)
    const parts = encrypted.split(":")
    // Corrupt ciphertext body
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("aa") ? "bb" : "aa")
    const tampered = parts.join(":")

    expect(() => decryptSmtpPassword(tampered)).toThrow(SmtpCryptoError)
  })

  it("fails closed when authentication tag is tampered with", () => {
    const password = "sensitive-token"
    const encrypted = encryptSmtpPassword(password)
    const parts = encrypted.split(":")
    // Corrupt auth tag
    parts[2] = parts[2].slice(0, -2) + "00"
    const tampered = parts.join(":")

    expect(() => decryptSmtpPassword(tampered)).toThrow(SmtpCryptoError)
  })

  it("fails closed when decrypted with a different key", () => {
    const password = "sensitive-token"
    const encrypted = encryptSmtpPassword(password)

    process.env.DOGRUADRES_SMTP_ENCRYPTION_KEY = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210"
    expect(() => decryptSmtpPassword(encrypted)).toThrow(SmtpCryptoError)
  })

  it("rejects empty password encryption", () => {
    expect(() => encryptSmtpPassword("")).toThrow(SmtpCryptoError)
  })

  it("rejects unsupported ciphertext formats", () => {
    expect(() => decryptSmtpPassword("v2:abc:def")).toThrow(SmtpCryptoError)
    expect(() => decryptSmtpPassword("plain-text")).toThrow(SmtpCryptoError)
  })
})
