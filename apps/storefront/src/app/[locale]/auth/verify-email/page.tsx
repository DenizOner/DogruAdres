"use client"

import React, { useEffect, useState, useRef, useTransition } from "react"
import { useSearchParams, useRouter, useParams } from "next/navigation"
import Link from "next/link"

type VerificationState = "loading" | "pending" | "submitting" | "confirmed" | "expired" | "consumed" | "invalid" | "unavailable"
type SupportedLocale = "tr" | "en" | "ar"

const copy = {
  tr: {
    brandTitle: "DoğruAdres",
    brandSubtitle: "Pazaryeri Güvenlik ve Kimlik Doğrulama",
    pageHeading: "E-posta Doğrulama",
    pendingDesc: "E-posta adresinizi doğrulamak için aşağıdaki düğmeyi kullanın.",
    verifyBtn: "E-posta Adresimi Doğrula",
    verifyingBtn: "Doğrulanıyor...",
    confirmedTitle: "E-posta Başarıyla Doğrulandı",
    confirmedDesc: "E-posta adresiniz başarıyla onaylandı. Artık DoğruAdres platformuna güvenle giriş yapabilirsiniz.",
    loginBtn: "Giriş Yap",
    homeBtn: "Ana Sayfa",
    expiredTitle: "Bağlantının Süresi Doldu",
    expiredDesc: "Bu doğrulama bağlantısının geçerlilik süresi dolmuştur. Lütfen yeni bir doğrulama e-postası talep ediniz.",
    requestNewBtn: "Yeni Bağlantı İste",
    consumedTitle: "Bağlantı Daha Önce Kullanılmış",
    consumedDesc: "Bu e-posta adresi zaten doğrulanmış veya bu bağlantı daha önce kullanılmıştır.",
    invalidTitle: "Geçersiz Bağlantı",
    invalidDesc: "Doğrulama bağlantısı geçersiz, hatalı veya eksik. Lütfen e-postanızdaki bağlantıyı kontrol ediniz.",
    unavailableTitle: "Doğrulama Şu Anda Kullanılamıyor",
    unavailableDesc: "E-posta doğrulama hizmeti şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.",
    securityNoteTitle: "Güvenlik Notu:",
    securityNoteText: "Bu bağlantı tek kullanımlıktır. İşlemi tamamlamak için onayınız gerekir.",
    supportText: "Destek:",
    themeDark: "Koyu Mod",
    themeLight: "Açık Mod",
  },
  en: {
    brandTitle: "DogruAdres",
    brandSubtitle: "Marketplace Security & Identity Verification",
    pageHeading: "Email Verification",
    pendingDesc: "To verify the email address for your account and securely access the platform, please click the button below.",
    verifyBtn: "Verify My Email",
    verifyingBtn: "Verifying...",
    confirmedTitle: "Email Successfully Verified",
    confirmedDesc: "Your email address has been confirmed. You can now securely sign in to DogruAdres.",
    loginBtn: "Sign In",
    homeBtn: "Home",
    expiredTitle: "Verification Link Expired",
    expiredDesc: "This verification link has expired. Please request a new verification email.",
    requestNewBtn: "Request New Link",
    consumedTitle: "Link Already Used",
    consumedDesc: "This email address is already verified or this link has previously been used.",
    invalidTitle: "Invalid Link",
    invalidDesc: "The verification link is invalid, malformed, or missing. Please check the link in your email.",
    unavailableTitle: "Verification Unavailable",
    unavailableDesc: "Email verification is currently unavailable. Please try again later.",
    securityNoteTitle: "Security Notice:",
    securityNoteText: "This link can be used once. Confirm to complete verification.",
    supportText: "Support:",
    themeDark: "Dark Mode",
    themeLight: "Light Mode",
  },
  ar: {
    brandTitle: "دوغرو أدرس",
    brandSubtitle: "أمان السوق والتحقق من الهوية",
    pageHeading: "تأكيد البريد الإلكتروني",
    pendingDesc: "لتأكيد عنوان البريد الإلكتروني لحسابك وبدء استخدام المنصة بأمان، يرجى النقر على الزر أدناه.",
    verifyBtn: "تأكيد بريدي الإلكتروني",
    verifyingBtn: "جارٍ التحقق...",
    confirmedTitle: "تم تأكيد البريد الإلكتروني بنجاح",
    confirmedDesc: "تم تأكيد بريدك الإلكتروني بنجاح. يمكنك الآن تسجيل الدخول بأمان إلى دوغرو أدرس.",
    loginBtn: "تسجيل الدخول",
    homeBtn: "الصفحة الرئيسية",
    expiredTitle: "انتهت صلاحية الرابط",
    expiredDesc: "انتهت صلاحية رابط التحقق هذا. يرجى طلب رابط تأكيد جديد.",
    requestNewBtn: "طلب رابط جديد",
    consumedTitle: "تم استخدام الرابط مسبقاً",
    consumedDesc: "تم التحقق من عنوان البريد الإلكتروني هذا بالفعل أو تم استخدام الرابط مسبقاً.",
    invalidTitle: "رابط غير صالح",
    invalidDesc: "رابط التحقق غير صالح أو غير مكتمل. يرجى التأكد من الرابط الوارد في بريدك الإلكتروني.",
    unavailableTitle: "خدمة التحقق غير متاحة",
    unavailableDesc: "خدمة تأكيد البريد الإلكتروني غير متاحة حالياً. يرجى المحاولة لاحقاً.",
    securityNoteTitle: "ملاحظة أمنية:",
    securityNoteText: "يمكن استخدام هذا الرابط مرة واحدة فقط. أكّد لإتمام التحقق.",
    supportText: "الدعم الفني:",
    themeDark: "الوضع الداكن",
    themeLight: "الوضع الفاتح",
  },
}

export default function VerifyEmailPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const params = useParams()

  const rawLocale = (params?.locale as string)?.toLowerCase()
  const initialLocale: SupportedLocale = rawLocale === "ar" ? "ar" : rawLocale === "en" ? "en" : "tr"

  const [currentLocale, setCurrentLocale] = useState<SupportedLocale>(initialLocale)
  const [state, setState] = useState<VerificationState>("loading")

  const [errorMessage, setErrorMessage] = useState<string>("")
  const [isPendingTransition, startTransition] = useTransition()
  const isTerminalRef = useRef(false)

  const [token] = useState(() => searchParams.get("token") || "")
  const isRtl = currentLocale === "ar"
  const t = copy[currentLocale]

  // Only the explicitly configured browser-reachable Medusa API origin.
  // Never fall back to the Storefront or a visitor-local bearer destination.
  const backendUrl = (() => {
    const value = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
    if (!value) return null
    try {
      const url = new URL(value)
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      if (url.protocol !== "https:" &&
          !(process.env.NODE_ENV !== "production" && url.protocol === "http:" && local))
        return null
      if (url.username || url.password || url.pathname !== "/" || url.search || url.hash)
        return null
      return url.origin
    } catch {
      return null
    }
  })()

  // 1. Safe GET inspection on mount
  useEffect(() => {
    // Preserve the bearer in component memory across the router's URL update.
    // Scrub before inspection fetch or user navigation, including invalid links.
    const url = new URL(window.location.href)
    if (url.searchParams.has("token")) {
      url.searchParams.delete("token")
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
    }
    if (isTerminalRef.current) return
    if (!token) {
      setState("invalid")
      return
    }

    if (!backendUrl) {
      setState("unavailable")
      return
    }

    let isMounted = true

    async function checkTokenStatus() {
      try {
        const response = await fetch(`${backendUrl}/auth/verify-email?token=${encodeURIComponent(token)}`, {
          method: "GET",
          headers: { "Accept": "application/json" },
          cache: "no-store",
          referrerPolicy: "no-referrer",
        })

        const data = await response.json()

        if (!isMounted) return

        if (!response.ok || !data.ok) {
          setState("invalid")
          setErrorMessage("")
          return
        }



        if (data.status === "consumed") {
          setState("consumed")
        } else if (data.status === "expired") {
          setState("expired")
        } else if (data.status === "pending") {
          setState("pending")
        } else {
          setState("invalid")
        }
      } catch (err) {
        if (!isMounted) return
        setState("invalid")
      }
    }

    checkTokenStatus()

    return () => {
      isMounted = false
    }
  }, [token, backendUrl])

  // 2. Explicit POST confirmation action
  async function handleConfirm() {
    if (!token || state === "submitting") return
    if (!backendUrl) {
      setState("unavailable")
      return
    }

    setState("submitting")

    try {
      const response = await fetch(`${backendUrl}/auth/verify-email`, {
        method: "POST",
        referrerPolicy: "no-referrer",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ token }),
      })

      const data = await response.json()

      if (response.status === 200 && data.ok) {
        isTerminalRef.current = true
        setState("confirmed")


        // Scrub token from URL & browser history for leak protection
        if (typeof window !== "undefined") {
          window.history.replaceState({}, document.title, window.location.pathname)
        }
      } else if (response.status === 410 || data.status === "expired") {
        isTerminalRef.current = true
        setState("expired")
      } else if (response.status === 409 || data.status === "consumed") {
        isTerminalRef.current = true
        setState("consumed")
      } else {
        setState("invalid")
        setErrorMessage("")
      }
    } catch (err) {
      setState("invalid")
    }
  }

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8 font-sans transition-colors duration-200"
    >
      {/* Top Bar: Brand & Language Switcher */}
      <header className="max-w-md w-full mx-auto flex items-center justify-between pb-6">
        <Link href="/" className="flex items-center gap-2 group">
          {/* Canonical DoğruAdres Mark: Pin + Checkmark in #0e66c2 */}
          <div className="w-10 h-10 rounded-xl bg-[#0e66c2] flex items-center justify-center text-white shadow-sm shadow-blue-500/20 group-hover:bg-[#0b57a4] transition-colors">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/>
              <polyline points="9 10 11.5 12.5 15.5 8"/>
            </svg>
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t.brandTitle}
            </span>
          </div>
        </Link>

        {/* Language selector */}
        <div className="flex items-center gap-1 bg-slate-200/60 dark:bg-slate-800 p-1 rounded-lg text-xs font-medium">
          {(["tr", "en", "ar"] as SupportedLocale[]).map((loc) => (
            <button
              key={loc}
              type="button"
              onClick={() => setCurrentLocale(loc)}
              className={`px-2.5 py-1 rounded-md uppercase transition-all ${
                currentLocale === loc
                  ? "bg-white dark:bg-slate-700 text-[#0e66c2] dark:text-blue-400 font-bold shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {loc === "ar" ? "AR (العربية)" : loc.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      {/* Main Card */}
      <main dir={isRtl ? "rtl" : "ltr"} className="max-w-md w-full mx-auto bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        {/* Accent Bar (#0e66c2) */}
        <div className="h-1.5 w-full bg-[#0e66c2]" />

        <div className="p-8 sm:p-10">
          {/* State 1: Loading Initial Status */}
          {state === "loading" && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 border-4 border-[#0e66c2]/20 border-t-[#0e66c2] rounded-full animate-spin mb-4" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {currentLocale === "tr" ? "Bağlantı kontrol ediliyor..." : currentLocale === "ar" ? "جارٍ التحقق من الرابط..." : "Checking verification link..."}
              </p>
            </div>
          )}

          {/* State 2 & 3: Pending / Submitting (Explicit Confirmation) */}
          {(state === "pending" || state === "submitting") && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-[#0e66c2] flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="16" x="2" y="4" rx="2"/>
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                  </svg>
                </div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {t.pageHeading}
                </h1>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
{t.pendingDesc}
                </p>
              </div>

              {/* Bot Protection Alert */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <p className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#0e66c2]">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                  {t.securityNoteTitle}
                </p>
                <p className="leading-normal">{t.securityNoteText}</p>
              </div>

              {/* Primary Confirm Button (Min 48px, #0e66c2) */}
              <button
                type="button"
                id="btn-confirm-email"
                disabled={state === "submitting"}
                onClick={handleConfirm}
                className="w-full min-h-[48px] px-6 py-3 rounded-xl bg-[#0e66c2] hover:bg-[#0b57a4] active:bg-[#084585] text-white font-semibold text-base shadow-sm shadow-blue-600/20 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-[#0e66c2] disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {state === "submitting" ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>{t.verifyingBtn}</span>
                  </>
                ) : (
                  <span>{t.verifyBtn}</span>
                )}
              </button>
            </div>
          )}

          {/* State 4: Confirmed (Success) */}
          {state === "confirmed" && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {t.confirmedTitle}
                </h1>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t.confirmedDesc}
                </p>
              </div>

              <Link
                href="/login"
                id="btn-goto-login"
                className="w-full min-h-[48px] px-6 py-3 rounded-xl bg-[#0e66c2] hover:bg-[#0b57a4] text-white font-semibold text-base shadow-sm focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-[#0e66c2] transition-all flex items-center justify-center"
              >
                {t.loginBtn}
              </Link>
            </div>
          )}

          {/* State 5: Expired (410) */}
          {state === "expired" && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 mx-auto rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {t.expiredTitle}
                </h1>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t.expiredDesc}
                </p>
              </div>

              <Link
                href="/login"
                className="w-full min-h-[48px] px-6 py-3 rounded-xl bg-[#0e66c2] hover:bg-[#0b57a4] text-white font-semibold text-base shadow-sm transition-all flex items-center justify-center"
              >
                {t.requestNewBtn}
              </Link>
            </div>
          )}

          {/* State 6: Consumed (Already Verified) */}
          {state === "consumed" && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 mx-auto rounded-full bg-blue-50 dark:bg-blue-950/40 text-[#0e66c2] flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <polyline points="16 11 18 13 22 9"/>
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {t.consumedTitle}
                </h1>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t.consumedDesc}
                </p>
              </div>

              <Link
                href="/login"
                className="w-full min-h-[48px] px-6 py-3 rounded-xl bg-[#0e66c2] hover:bg-[#0b57a4] text-white font-semibold text-base shadow-sm transition-all flex items-center justify-center"
              >
                {t.loginBtn}
              </Link>
            </div>
          )}

          {/* State 7: Invalid / Error */}
          {(state === "invalid" || state === "unavailable") && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 mx-auto rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {state === "unavailable" ? t.unavailableTitle : t.invalidTitle}
                </h1>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {state === "unavailable" ? t.unavailableDesc : errorMessage || t.invalidDesc}
                </p>
              </div>

              <Link
                href="/"
                className="w-full min-h-[48px] px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold text-base shadow-sm transition-all flex items-center justify-center"
              >
                {t.homeBtn}
              </Link>
            </div>
          )}
        </div>

        {/* Card Footer */}
        <div className="px-8 py-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
          <span>{t.supportText} </span>
          <a href="mailto:destek@dogruadres.net" className="text-[#0e66c2] dark:text-blue-400 hover:underline font-medium">
            destek@dogruadres.net
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-md w-full mx-auto text-center pt-8 text-xs text-slate-400 dark:text-slate-600">
        <p>© 2026 DoğruAdres. All rights reserved.</p>
      </footer>
    </div>
  )
}
