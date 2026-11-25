"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import i18next from "i18next"
import { initReactI18next, useTranslation } from "react-i18next"

const resources = {
  tr: {
    translation: {
      title: "Kişisel Bildirim Tercihleri",
      description:
        "Platform içi, e-posta ve mobil bildirim kanallarını olay kategorisine göre yönetin.",
      loading: "Bildirim tercihleri yükleniyor...",
      authRequired:
        "Bildirim tercihlerinizi yönetmek için kişisel oturumunuzla giriş yapın.",
      signInLink: "Kişisel Çalışma Alanına Git",
      loadError: "Bildirim tercihleri şu anda okunamıyor.",
      criticalNote:
        "Kritik güvenlik ve Owner/kapatma bildirimleri kilitlidir ve kapatılamaz.",
      mobileUnsupported:
        "Mobil bildirimler şu anda desteklenmiyor (doğrulanmış cihaz izni/sağlayıcısı yok).",
      advancedToggle: "Gelişmiş Ayarlar (Olay ve Kanal Tablosu)",
      tableCategory: "Olay Kategorisi",
      tablePlatform: "Platform İçi",
      tableEmail: "E-posta",
      tableMobile: "Mobil",
      criticalBadge: "Zorunlu",
      emailImmediate: "Anında",
      emailDailyDigest: "Günlük özet",
      emailOff: "Kapalı",
      saveBtn: "Tercihleri kaydet",
      savingBtn: "Kaydediliyor...",
      resetBtn: "Varsayılanlara döndür",
      saveSuccess: "Bildirim tercihleriniz kaydedildi.",
      resetSuccess: "Bildirim tercihleriniz varsayılanlara döndürüldü.",
      saveConflict:
        "Tercihler başka bir oturumda değişti. Güncel ayarlar yeniden yüklendi.",
      saveFailed: "Tercihler kaydedilemedi.",
      categories: {
        security_account: "Güvenlik, Hesap ve Oturum",
        owner_closing: "Owner Yetkisi ve Mağaza Kapatma",
        organization_membership: "Şirket Üyeliği ve Davetler",
        store_operations: "Mağaza Başvuruları ve Durumu",
        buyer_orders: "Alıcı Sipariş ve İade İşlemleri",
        seller_operations: "Satıcı Teklif, Katalog ve Stok",
        platform_announcements: "Platform Duyuruları",
        marketing_promotions: "Tanıtım ve Pazarlama",
      },
    },
  },
  en: {
    translation: {
      title: "Personal Notification Preferences",
      description:
        "Manage in-platform, email, and mobile notification channels per event category.",
      loading: "Loading notification preferences...",
      authRequired:
        "Sign in with your personal session to manage your notification preferences.",
      signInLink: "Go to Personal Console",
      loadError: "Notification preferences cannot be loaded right now.",
      criticalNote:
        "Critical security and Owner/closing notifications are locked and cannot be turned off.",
      mobileUnsupported:
        "Mobile push is currently not supported (no verified device permission/provider).",
      advancedToggle: "Advanced Settings (Event and Channel Table)",
      tableCategory: "Event Category",
      tablePlatform: "In-Platform",
      tableEmail: "Email",
      tableMobile: "Mobile",
      criticalBadge: "Required",
      emailImmediate: "Immediate",
      emailDailyDigest: "Daily digest",
      emailOff: "Off",
      saveBtn: "Save preferences",
      savingBtn: "Saving...",
      resetBtn: "Reset to defaults",
      saveSuccess: "Your notification preferences have been saved.",
      resetSuccess: "Your notification preferences have been reset to defaults.",
      saveConflict:
        "Preferences changed in another session. Latest settings reloaded.",
      saveFailed: "Could not save preferences.",
      categories: {
        security_account: "Security, Account & Session",
        owner_closing: "Owner Authority & Store Closing",
        organization_membership: "Organization Membership & Invitations",
        store_operations: "Store Applications & Status",
        buyer_orders: "Buyer Orders & Returns",
        seller_operations: "Seller Offers, Catalog & Stock",
        platform_announcements: "Platform Announcements",
        marketing_promotions: "Promotions & Marketing",
      },
    },
  },
}

const storefrontI18n = i18next.createInstance()
if (!storefrontI18n.isInitialized) {
  void storefrontI18n.use(initReactI18next).init({
    resources,
    lng: "tr",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  })
}

type EmailFrequency = "immediate" | "daily_digest" | "off"
type CategoryId = keyof (typeof resources)["tr"]["translation"]["categories"]

interface ChannelPreference {
  platform: boolean
  email: EmailFrequency
  mobile: boolean
}

interface PreferencesResponse {
  preferences: Record<CategoryId, ChannelPreference>
  categories: Array<{ id: CategoryId; critical: boolean }>
  version: number
}

export function NotificationPreferences({ locale }: { locale?: string }) {
  const { t } = useTranslation(undefined, { i18n: storefrontI18n })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [unauthorized, setUnauthorized] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [data, setData] = useState<PreferencesResponse | null>(null)
  const [draft, setDraft] = useState<Record<CategoryId, ChannelPreference> | null>(null)
  const [csrfToken, setCsrfToken] = useState("")
  const inFlight = useRef(false)

  const targetLang = useMemo(
    () => (locale?.toLowerCase().startsWith("en") ? "en" : "tr"),
    [locale]
  )

  useEffect(() => {
    if (storefrontI18n.language !== targetLang) {
      void storefrontI18n.changeLanguage(targetLang)
    }
  }, [targetLang])

  const load = useCallback(async () => {
    setLoading(true)
    setUnauthorized(false)
    setStatusMessage("")
    try {
      const sessionRes = await fetch("/personal/session", { credentials: "include" })
      if (!sessionRes.ok) {
        setUnauthorized(true)
        setData(null)
        setDraft(null)
        return
      }
      const sessionJson = (await sessionRes.json()) as { csrf_token?: string }
      if (!sessionJson?.csrf_token) {
        setUnauthorized(true)
        return
      }
      setCsrfToken(sessionJson.csrf_token)

      const res = await fetch("/personal/notification-preferences", {
        credentials: "include",
      })
      if (res.status === 401 || res.status === 403) {
        setUnauthorized(true)
        setData(null)
        setDraft(null)
        return
      }
      if (!res.ok) {
        setStatusMessage(t("loadError"))
        return
      }
      const json = (await res.json()) as PreferencesResponse
      setData(json)
      setDraft(json.preferences)
    } catch {
      setStatusMessage(t("loadError"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const submitMutation = async (action: "update" | "reset_defaults") => {
    if (!data || !draft || inFlight.current) return
    inFlight.current = true
    setSaving(true)
    setStatusMessage("")
    try {
      const res = await fetch("/personal/notification-preferences", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(
          action === "reset_defaults"
            ? { action: "reset_defaults", expected_version: data.version }
            : { action: "update", preferences: draft, expected_version: data.version }
        ),
      })
      if (res.status === 401 || res.status === 403) {
        setUnauthorized(true)
        return
      }
      if (res.status === 409) {
        setStatusMessage(t("saveConflict"))
        await load()
        return
      }
      if (!res.ok) {
        setStatusMessage(t("saveFailed"))
        return
      }
      const next = (await res.json()) as PreferencesResponse
      setData(next)
      setDraft(next.preferences)
      setStatusMessage(
        action === "reset_defaults" ? t("resetSuccess") : t("saveSuccess")
      )
    } catch {
      setStatusMessage(t("saveFailed"))
    } finally {
      setSaving(false)
      inFlight.current = false
    }
  }

  return (
    <section
      id="notification-preferences"
      aria-labelledby="storefront-notif-pref-heading"
      className="mt-8 border rounded-lg p-6 space-y-4"
    >
      <div>
        <h2 id="storefront-notif-pref-heading" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-gray-600 mt-1">{t("description")}</p>
      </div>

      {loading && <p className="text-sm">{t("loading")}</p>}

      {!loading && unauthorized && (
        <div className="space-y-2">
          <p className="text-sm text-amber-700">{t("authRequired")}</p>
          <a href="/personal" className="text-sm underline font-medium">
            {t("signInLink")}
          </a>
        </div>
      )}

      {!loading && !unauthorized && data && draft && (
        <div className="space-y-4">
          <div className="text-xs text-gray-600 space-y-1 border rounded p-3">
            <p>{t("criticalNote")}</p>
            <p>{t("mobileUnsupported")}</p>
          </div>

          <details open className="border rounded p-4">
            <summary className="cursor-pointer font-medium text-sm">
              {t("advancedToggle")}
            </summary>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 pr-4">{t("tableCategory")}</th>
                    <th className="py-2 px-3">{t("tablePlatform")}</th>
                    <th className="py-2 px-3">{t("tableEmail")}</th>
                    <th className="py-2 pl-3">{t("tableMobile")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((cat) => {
                    const pref = draft[cat.id]
                    return (
                      <tr key={cat.id} className="border-b last:border-b-0">
                        <td className="py-2 pr-4">
                          <span>{t(`categories.${cat.id}`)}</span>
                          {cat.critical && (
                            <span className="ml-2 text-xs font-medium text-amber-700">
                              ({t("criticalBadge")})
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="checkbox"
                            aria-label={`${t(`categories.${cat.id}`)} - ${t("tablePlatform")}`}
                            checked={pref.platform}
                            disabled={cat.critical || saving}
                            onChange={(e) =>
                              setDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      [cat.id]: { ...prev[cat.id], platform: e.target.checked },
                                    }
                                  : prev
                              )
                            }
                          />
                        </td>
                        <td className="py-2 px-3">
                          <select
                            aria-label={`${t(`categories.${cat.id}`)} - ${t("tableEmail")}`}
                            className="border rounded px-2 py-1 text-xs"
                            value={pref.email}
                            disabled={cat.critical || saving}
                            onChange={(e) =>
                              setDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      [cat.id]: {
                                        ...prev[cat.id],
                                        email: e.target.value as EmailFrequency,
                                      },
                                    }
                                  : prev
                              )
                            }
                          >
                            <option value="immediate">{t("emailImmediate")}</option>
                            {!cat.critical && (
                              <>
                                <option value="daily_digest">{t("emailDailyDigest")}</option>
                                <option value="off">{t("emailOff")}</option>
                              </>
                            )}
                          </select>
                        </td>
                        <td className="py-2 pl-3">
                          <input
                            type="checkbox"
                            aria-label={`${t(`categories.${cat.id}`)} - ${t("tableMobile")}`}
                            checked={false}
                            disabled
                            title={t("mobileUnsupported")}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </details>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void submitMutation("update")}
              className="px-4 py-2 text-sm font-medium border rounded bg-black text-white disabled:opacity-50"
            >
              {saving ? t("savingBtn") : t("saveBtn")}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void submitMutation("reset_defaults")}
              className="px-4 py-2 text-sm font-medium border rounded disabled:opacity-50"
            >
              {t("resetBtn")}
            </button>
            {statusMessage && (
              <p className="text-sm" role="status" aria-live="polite">
                {statusMessage}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
