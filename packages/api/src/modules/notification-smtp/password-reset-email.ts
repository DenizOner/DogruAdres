import { resolveVerificationOrigin } from "./verification-email"

/** Builds a customer-only reset link from the trusted Storefront origin. */
export function renderCustomerPasswordResetEmail(data: { token?: unknown }) {
  // Medusa's native password-reset token is a JWT (base64url segments).
  if (typeof data?.token !== "string" || data.token.length < 16 ||
      data.token.length > 4096 || !/^[A-Za-z0-9._-]+$/.test(data.token)) {
    throw new Error("Password reset notification token is invalid")
  }
  const url = new URL("/reset-password", resolveVerificationOrigin())
  url.searchParams.set("token", data.token)
  const resetUrl = url.toString()
  const safeUrl = resetUrl.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")

  return {
    subject: "DoğruAdres Parola Sıfırlama",
    text: [
      "Merhaba,",
      "",
      "DoğruAdres hesabınız için parola sıfırlama isteği alındı.",
      "Yeni parolanızı belirlemek için aşağıdaki bağlantıyı açın:",
      resetUrl,
      "",
      "Bu bağlantı 15 dakika geçerlidir ve tek kullanımlıktır.",
      "Bu isteği siz yapmadıysanız e-postayı yok sayabilirsiniz.",
      "",
      "DoğruAdres",
    ].join("\n"),
    html: '<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Parola Sıfırlama</title></head><body>' +
      '<p>DoğruAdres hesabınız için parola sıfırlama isteği alındı.</p>' +
      '<p><a href="' + safeUrl + '">Yeni parolamı belirle</a></p>' +
      '<p>Bağlantı 15 dakika geçerlidir ve tek kullanımlıktır.</p>' +
      '<p>İsteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p></body></html>',
  }
}
