"use client"

import React, { useState } from "react"

type AuthStage = "credentials" | "challenge"

export function LoginClient() {
  const [stage, setStage] = useState<AuthStage>("credentials")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [mfaMethod, setMfaMethod] = useState<"totp" | "recovery_code">("totp")
  const [mfaCode, setMfaCode] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [statusMessage, setStatusMessage] = useState("")

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setErrorMessage("")
    setStatusMessage("Kimlik bilgileri doğrulanıyor…")

    try {
      const response = await fetch("/personal/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      })

      let payload: Record<string, unknown> | null = null
      try {
        payload = (await response.json()) as Record<string, unknown>
      } catch {
        payload = null
      }

      if (response.status === 200) {
        setStatusMessage("Oturum açıldı. Kişisel çalışma alanına yönlendiriliyorsunuz…")
        window.location.assign("/personal")
        return
      }

      if (response.status === 202) {
        const nextStep = payload?.status ?? payload?.next_step
        if (nextStep === "mfa_enrollment_required" || payload?.enrollment_required) {
          setStatusMessage("MFA ilk kurulumu için /personal ekranına yönlendiriliyorsunuz…")
          window.location.assign("/personal")
          return
        }
        setStage("challenge")
        setStatusMessage("İki faktörlü doğrulama kodu gerekiyor.")
        return
      }

      if (response.status === 429) {
        setErrorMessage("Çok fazla deneme yapıldı. Lütfen bir süre sonra yeniden deneyin.")
      } else if (response.status === 401 || response.status === 403) {
        setErrorMessage("E-posta veya parola doğrulanamadı. Bilgilerinizi kontrol edin.")
      } else {
        setErrorMessage("Giriş işlemi şu anda tamamlanamadı. Lütfen tekrar deneyin.")
      }
      setStatusMessage("")
    } catch {
      setErrorMessage("Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.")
      setStatusMessage("")
    } finally {
      setSubmitting(false)
    }
  }

  const handleChallengeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setErrorMessage("")
    setStatusMessage("Doğrulama kodu kontrol ediliyor…")

    try {
      const response = await fetch("/personal/challenge", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: mfaMethod, code: mfaCode.trim() }),
      })

      if (response.status === 200) {
        setStatusMessage("Doğrulama tamamlandı. /personal çalışma alanına yönlendiriliyorsunuz…")
        window.location.assign("/personal")
        return
      }

      if (response.status === 401 || response.status === 403) {
        setErrorMessage("Doğrulama kodu geçersiz veya süresi dolmuş. Lütfen kontrol edin.")
      } else {
        setErrorMessage("Doğrulama tamamlanamadı. Lütfen tekrar giriş yapın.")
      }
      setStatusMessage("")
    } catch {
      setErrorMessage("Bağlantı kurulamadı. Lütfen tekrar deneyin.")
      setStatusMessage("")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen flex flex-col lg:flex-row bg-white text-slate-900 focus:outline-none"
    >
      {/* Sol Panel: DoğruAdres Kurumsal B4B Marka Alanı */}
      <aside className="lg:w-5/12 bg-[#0e66c2] text-white p-8 lg:p-14 flex flex-col justify-between relative overflow-hidden">
        <div className="relative z-10">
          <a
            href="/"
            className="inline-flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e66c2]"
            aria-label="DoğruAdres Ana Sayfa"
          >
            <div className="w-10 h-10 rounded-xl bg-white text-[#0e66c2] flex items-center justify-center shadow-md">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm-1 12.5l-3.5-3.5 1.41-1.41L11 11.67l5.09-5.09L17.5 8 11 14.5z" />
              </svg>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold tracking-tight text-white">DoğruAdres</span>
              <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#0b57a4] text-blue-50 uppercase tracking-wider border border-white/15">
                B4B Portalı
              </span>
            </div>
          </a>

          <div className="mt-12 lg:mt-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-medium text-blue-50 mb-4">
              <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" />
              <span>Tekil Kurumsal Giriş Kapısı</span>
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold leading-tight tracking-tight text-white">
              Otomotiv dünyasında doğru adresiniz.
            </h1>
            <p className="mt-4 text-blue-100 text-sm lg:text-base leading-relaxed max-w-md">
              DoğruAdres kapalı B4B ekosistemine kişisel hesabınızla giriş yaparak
              yetkili olduğunuz şirket ve mağaza çalışma alanlarınıza (/personal) güvenle erişin.
            </p>
          </div>
        </div>

        <div className="relative z-10 mt-10 pt-6 border-t border-white/15 flex items-center justify-between text-xs text-blue-100/90">
          <span>256-bit TLS Korumalı Oturum</span>
          <span>© 2026 DoğruAdres</span>
        </div>
      </aside>

      {/* Sağ Panel: Ayrı Kurumsal Giriş Formu */}
      <section className="lg:w-7/12 flex-1 bg-slate-50/60 flex items-center justify-center p-6 sm:p-10 lg:p-16">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8 sm:p-10">
          <div className="mb-8">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#0e66c2]">
              Kurumsal B4B Oturumu
            </span>
            <h2 className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              {stage === "credentials" ? "Giriş Yap" : "İki Faktörlü Doğrulama"}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {stage === "credentials"
                ? "Oturum açtıktan sonra tek giriş kapınız olan Kişisel Çalışma Alanına (/personal) yönlendirileceksiniz."
                : "Kimlik doğrulama uygulamanızdaki 6 haneli kodu veya kurtarma kodunuzu girin."}
            </p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
            >
              {errorMessage}
            </div>
          )}

          {statusMessage && (
            <div
              role="status"
              aria-live="polite"
              className="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900"
            >
              {statusMessage}
            </div>
          )}

          {stage === "credentials" ? (
            <form onSubmit={handleLoginSubmit} className="space-y-5" data-testid="login-form">
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  E-posta Adresi
                </label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ornek@sirketiniz.com"
                  className="w-full h-12 px-3.5 rounded-lg border border-slate-300 text-slate-900 text-sm bg-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e66c2] focus-visible:ring-offset-2"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="login-password"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Parola
                  </label>
                  <a
                    href="/forgot-password"
                    className="text-xs font-semibold text-[#0e66c2] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e66c2] rounded-xs px-1"
                  >
                    Parolamı Unuttum
                  </a>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full h-12 pl-3.5 pr-20 rounded-lg border border-slate-300 text-slate-900 text-sm bg-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e66c2] focus-visible:ring-offset-2"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-pressed={showPassword}
                    aria-label={showPassword ? "Parolayı gizle" : "Parolayı göster"}
                    className="absolute inset-y-0 right-1 my-1 px-3 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e66c2]"
                  >
                    {showPassword ? "Gizle" : "Göster"}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                data-testid="login-submit-btn"
                className="w-full h-12 rounded-lg bg-[#0e66c2] hover:bg-[#0b57a4] disabled:opacity-60 text-white font-semibold text-sm transition-colors shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e66c2] focus-visible:ring-offset-2"
              >
                {submitting ? "Giriş Yapılıyor…" : "Giriş Yap"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleChallengeSubmit} className="space-y-5" data-testid="mfa-challenge-form">
              <div>
                <label
                  htmlFor="mfa-method"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Doğrulama Yöntemi
                </label>
                <select
                  id="mfa-method"
                  value={mfaMethod}
                  onChange={(e) => setMfaMethod(e.target.value as "totp" | "recovery_code")}
                  className="w-full h-12 px-3.5 rounded-lg border border-slate-300 text-slate-900 text-sm bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e66c2] focus-visible:ring-offset-2"
                >
                  <option value="totp">Kimlik doğrulama uygulaması (6 haneli kod)</option>
                  <option value="recovery_code">Tek kullanımlık kurtarma kodu</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="mfa-code"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Doğrulama Kodu
                </label>
                <input
                  id="mfa-code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="123456"
                  className="w-full h-12 px-3.5 rounded-lg border border-slate-300 text-slate-900 text-sm bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e66c2] focus-visible:ring-offset-2"
                />
              </div>

              <div className="flex flex-col gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 rounded-lg bg-[#0e66c2] hover:bg-[#0b57a4] disabled:opacity-60 text-white font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e66c2] focus-visible:ring-offset-2"
                >
                  {submitting ? "Doğrulanıyor…" : "Doğrula ve Oturumu Aç"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStage("credentials")
                    setMfaCode("")
                    setErrorMessage("")
                  }}
                  className="w-full h-11 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e66c2]"
                >
                  Geri Dön
                </button>
              </div>
            </form>
          )}

          <div className="mt-8 pt-6 border-t border-slate-200 text-center text-sm text-slate-600">
            Hesabınız yok mu?{" "}
            <a
              href="/register"
              className="font-semibold text-[#0e66c2] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e66c2] rounded-xs px-1"
              data-testid="login-to-register-link"
            >
              Hesap Oluştur
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
