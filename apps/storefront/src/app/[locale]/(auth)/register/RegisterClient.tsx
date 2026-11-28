"use client"

import React, { useState } from "react"

export function RegisterClient() {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [mobilePhone, setMobilePhone] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [registered, setRegistered] = useState(false)

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setErrorMessage("")

    try {
      const response = await fetch("/personal/register", {
        method: "POST",
        credentials: "omit",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          mobile_phone: mobilePhone.trim().replace(/\s+/g, ""),
          password,
        }),
      })

      let result: Record<string, unknown> | null = null
      try {
        result = (await response.json()) as Record<string, unknown>
      } catch {
        result = null
      }

      if (response.ok && result?.registered === true) {
        setRegistered(true)
        setFirstName("")
        setLastName("")
        setEmail("")
        setMobilePhone("")
        setPassword("")
        return
      }

      if (response.status === 429) {
        setErrorMessage("Çok fazla deneme yapıldı. Lütfen bir süre sonra yeniden deneyin.")
      } else if (response.status === 400) {
        setErrorMessage(
          "Kayıt bilgileri geçersiz. Cep telefonu (+905XXXXXXXXX gibi 6-20 hane) ve en az 12 karakterli parolanızı kontrol edin."
        )
      } else if (response.status === 403 || response.status === 409) {
        setErrorMessage(
          "Kayıt bu bilgilerle tamamlanamadı. Mevcut hesabınız varsa giriş yapmayı deneyin."
        )
      } else {
        setErrorMessage(
          "Kayıt sonucu doğrulanamadı. Aynı işlemi tekrar göndermeden önce giriş sayfasından hesabınızı kontrol edin."
        )
      }
    } catch {
      setErrorMessage(
        "Bağlantı koptu. Kayıt sonucu belirsiz; lütfen önce giriş sayfasından hesabınızı kontrol edin."
      )
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
      {/* Sol Panel: Stitch Split-Screen Kurumsal B4B Kayıt Tanıtımı */}
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

          <div className="mt-12 lg:mt-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-medium text-blue-50 mb-4">
              <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" />
              <span>Kapalı Devre Otomotiv Ticaret Ağı</span>
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold leading-tight tracking-tight text-white">
              Kurumsal B4B dünyasına ilk adımınızı atın.
            </h1>
            <p className="mt-4 text-blue-100 text-sm lg:text-base leading-relaxed">
              DoğruAdres yetkili ekosisteminde önce kendi kişisel hesabınızı oluşturun.
              Ardından şirket başvurunuzu başlatabilir veya mevcut bir kurumsal davete katılabilirsiniz.
            </p>
          </div>
        </div>

        {/* Tek Hesap, Çift Yönlü Katılım Bilgi Kartı */}
        <div className="my-8 relative z-10">
          <div className="bg-[#0b57a4]/80 rounded-2xl p-6 border border-white/15 shadow-lg">
            <h2 className="text-sm font-semibold tracking-wide text-white uppercase mb-4">
              Tek Hesap, Çift Yönlü Katılım
            </h2>
            <ul className="space-y-4 text-xs lg:text-sm text-blue-50">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 w-5 h-5 rounded-full bg-white/15 text-white flex items-center justify-center text-xs font-bold shrink-0">
                  1
                </span>
                <div>
                  <strong className="text-white font-semibold block">Yeni Şirket Başvurusu:</strong>
                  Kişisel kaydınızın ardından firmanız adına şirket başvurusu başlatabilir ve vergi levhası doğrulamasını tamamlayabilirsiniz.
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 w-5 h-5 rounded-full bg-white/15 text-white flex items-center justify-center text-xs font-bold shrink-0">
                  2
                </span>
                <div>
                  <strong className="text-white font-semibold block">Kuruluş Davetine Katılım:</strong>
                  Sisteme kayıtlı bir otomotiv tedarikçisi veya bayisinden gelen üyelik davetini doğrudan onaylayabilirsiniz.
                </div>
              </li>
            </ul>
          </div>
        </div>

        <div className="relative z-10 pt-4 border-t border-white/15 flex items-center justify-between text-xs text-blue-100/90">
          <span>Kişisel veriler işletme yetkilerinden ayrıdır</span>
          <span>© 2026 DoğruAdres</span>
        </div>
      </aside>

      {/* Sağ Panel: Ayrı Kurumsal Kişi Kayıt Formu */}
      <section className="lg:w-7/12 flex-1 bg-slate-50/60 flex items-center justify-center p-6 sm:p-10 lg:p-16">
        <div className="w-full max-w-xl bg-white rounded-2xl shadow-sm border border-slate-200 p-8 sm:p-10">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#0e66c2]">
                Adım 1 / 2 • Kişisel Kimlik
              </span>
              <span className="text-xs text-slate-500">
                <span className="text-rose-600 font-bold">*</span> Zorunlu alanlar
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Kişisel Hesap Oluştur
            </h2>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Tek kişisel hesap oluşturun. İşletme ve mağaza yetkileri kayıtla otomatik verilmez;
              kayıt sonrası giriş yaparak çalışma alanınızdan devam edersiniz.
            </p>
          </div>

          {registered ? (
            <div
              role="status"
              aria-live="polite"
              data-testid="register-success-panel"
              className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 space-y-4"
            >
              <h3 className="text-lg font-bold text-emerald-900">
                Kişisel Hesabınız Oluşturuldu
              </h3>
              <p className="text-sm text-emerald-800 leading-relaxed">
                Kaydınız başarıyla tamamlandı. Şimdi giriş sayfasından oturum açarak
                tek giriş kapınız olan Kişisel Çalışma Alanına (/personal) geçebilirsiniz.
              </p>
              <a
                href="/login"
                data-testid="register-success-login-link"
                className="inline-flex w-full h-12 items-center justify-center rounded-lg bg-[#0e66c2] hover:bg-[#0b57a4] text-white font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e66c2] focus-visible:ring-offset-2"
              >
                Giriş Yap Sayfasına Git (/login)
              </a>
            </div>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-5" data-testid="register-form">
              {errorMessage && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
                >
                  {errorMessage}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="reg-first-name"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Ad <span className="text-rose-600 font-semibold" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="reg-first-name"
                    name="first_name"
                    type="text"
                    required
                    maxLength={50}
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Ahmet"
                    className="w-full h-12 px-3.5 rounded-lg border border-slate-300 text-slate-900 text-sm bg-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e66c2] focus-visible:ring-offset-2"
                  />
                </div>

                <div>
                  <label
                    htmlFor="reg-last-name"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Soyad <span className="text-rose-600 font-semibold" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="reg-last-name"
                    name="last_name"
                    type="text"
                    required
                    maxLength={50}
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Yılmaz"
                    className="w-full h-12 px-3.5 rounded-lg border border-slate-300 text-slate-900 text-sm bg-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e66c2] focus-visible:ring-offset-2"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="reg-email"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  E-posta Adresi <span className="text-rose-600 font-semibold" aria-hidden="true">*</span>
                </label>
                <input
                  id="reg-email"
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ornek@sirketiniz.com"
                  aria-describedby="reg-email-hint"
                  className="w-full h-12 px-3.5 rounded-lg border border-slate-300 text-slate-900 text-sm bg-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e66c2] focus-visible:ring-offset-2"
                />
                <p id="reg-email-hint" className="mt-1.5 text-xs text-slate-500">
                  Kurumsal davet ve hesap bildirimleri bu adrese gönderilir.
                </p>
              </div>

              <div>
                <label
                  htmlFor="reg-mobile"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Cep Telefonu (Zorunlu) <span className="text-rose-600 font-semibold" aria-hidden="true">*</span>
                </label>
                <input
                  id="reg-mobile"
                  name="mobile_phone"
                  type="tel"
                  inputMode="tel"
                  required
                  minLength={6}
                  maxLength={21}
                  pattern="[+]?[0-9\s]{6,21}"
                  autoComplete="tel"
                  value={mobilePhone}
                  onChange={(e) => setMobilePhone(e.target.value)}
                  placeholder="+905321234567"
                  aria-describedby="reg-mobile-hint"
                  className="w-full h-12 px-3.5 rounded-lg border border-slate-300 text-slate-900 text-sm bg-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e66c2] focus-visible:ring-offset-2"
                />
                <p id="reg-mobile-hint" className="mt-1.5 text-xs text-slate-500">
                  Boşluksuz 6–20 rakam (isteğe bağlı + ülke kodu ile, örn. +905321234567). Kayıtla birlikte numara sahipliği doğrulanmaz.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="reg-password"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Parola <span className="text-rose-600 font-semibold" aria-hidden="true">*</span>
                  </label>
                  <span className="text-xs text-slate-500">En az 12 karakter</span>
                </div>
                <div className="relative">
                  <input
                    id="reg-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="En az 12 karakterli güçlü parola"
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
                data-testid="register-submit-btn"
                className="w-full h-12 rounded-lg bg-[#0e66c2] hover:bg-[#0b57a4] disabled:opacity-60 text-white font-semibold text-sm transition-colors shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e66c2] focus-visible:ring-offset-2"
              >
                {submitting ? "Hesap Oluşturuluyor…" : "Kişi Hesabı Oluştur"}
              </button>
            </form>
          )}

          <div className="mt-8 pt-6 border-t border-slate-200 text-center text-sm text-slate-600">
            Zaten hesabınız var mı?{" "}
            <a
              href="/login"
              className="font-semibold text-[#0e66c2] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e66c2] rounded-xs px-1"
              data-testid="register-to-login-link"
            >
              Giriş Yap
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
