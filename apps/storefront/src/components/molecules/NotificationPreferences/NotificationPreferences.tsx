"use client"

import React, { useEffect, useMemo } from "react"
import i18next from "i18next"
import { initReactI18next, useTranslation } from "react-i18next"

const resources = {
  tr: {
    translation: {
      title: "Kişisel Bildirim Tercihleri",
      description:
        "Platform içi, e-posta ve mobil bildirim kanallarını olay kategorisine göre yönetin.",
      infoText:
        "Kişisel bildirim tercihleriniz ve kanal ayarlarınız DoğruAdres Kişisel Konsol üzerinden güvenli bir şekilde yönetilir.",
      criticalNote:
        "Kritik güvenlik, hesap, Owner yetkisi ve mağaza kapatma bildirimleri sistem güvenliği için zorunludur ve kapatılamaz.",
      mobileUnsupported:
        "Mobil anlık bildirim kanalı şu anda aktif değildir (doğrulanmış mobil cihaz izni ve bildirim sağlayıcısı bulunmamaktadır).",
      openConsoleBtn: "Kişisel Konsol Bildirim Ayarlarına Git",
      categoriesTitle: "Yönetilebilir Bildirim Kategorileri",
      categories: {
        security_account: "Güvenlik, Hesap ve Oturum (Kritik / Kilitli)",
        owner_closing: "Owner Yetkisi ve Mağaza Kapatma (Kritik / Kilitli)",
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
      infoText:
        "Your personal notification preferences and channel settings are managed securely via the DoğruAdres Personal Console.",
      criticalNote:
        "Critical security, account, Owner authority, and store closing notifications are required for system security and cannot be turned off.",
      mobileUnsupported:
        "Mobile push channel is currently inactive (no verified mobile device permission or push provider available).",
      openConsoleBtn: "Go to Personal Console Notification Settings",
      categoriesTitle: "Manageable Notification Categories",
      categories: {
        security_account: "Security, Account & Session (Critical / Locked)",
        owner_closing: "Owner Authority & Store Closing (Critical / Locked)",
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

function resolvePersonalConsoleUrl(): string {
  const value = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
  try {
    const url = new URL(value)
    return `${url.origin}/personal#notification-preferences-section`
  } catch {
    return "/personal#notification-preferences-section"
  }
}

export function NotificationPreferences({ locale }: { locale?: string }) {
  const { t } = useTranslation(undefined, { i18n: storefrontI18n })

  const targetLang = useMemo(
    () => (locale?.toLowerCase().startsWith("en") ? "en" : "tr"),
    [locale]
  )

  useEffect(() => {
    if (storefrontI18n.language !== targetLang) {
      void storefrontI18n.changeLanguage(targetLang)
    }
  }, [targetLang])

  const consoleUrl = useMemo(() => resolvePersonalConsoleUrl(), [])

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

      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-md p-4 space-y-2">
        <p className="text-sm text-blue-950 dark:text-blue-100 font-medium">
          {t("infoText")}
        </p>
        <p className="text-xs text-blue-900 dark:text-blue-200">
          {t("criticalNote")}
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          {t("mobileUnsupported")}
        </p>
      </div>

      <div className="pt-2">
        <a
          href={consoleUrl}
          id="btn-goto-personal-notifications"
          className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-md bg-[#0e66c2] hover:bg-[#0b57a4] active:bg-[#084585] text-white font-medium text-sm transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0e66c2]"
        >
          {t("openConsoleBtn")}
        </a>
      </div>
    </section>
  )
}
