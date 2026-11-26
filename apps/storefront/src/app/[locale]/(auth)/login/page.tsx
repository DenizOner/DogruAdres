/**
 * ============================================================================
 * DOĞRUADRES MİMARİ BİLGİLENDİRME VE YÖNLENDİRME (DA-ARCH-INGRESS-STOREFRONT)
 * ============================================================================
 * 
 * BU B2C MÜŞTERİ GİRİŞİ KAPATILMIŞTIR (DEPRECATED & REDIRECTED TO /personal)
 * 
 * Neden Kapatıldı?
 * -----------------
 * DoğruAdres kapalı bir B4B (Business-to-Business) otomotiv tedarik platformudur.
 * Bireysel tüketici (B2C) müşteri girişi veya şahsi alışveriş hesabı bulunmamaktadır.
 * 
 * Yeni Mimari Akış (Bkz: Issue #217, #243, #255):
 * 1. Ticari Alıcılar Şirketlerdir: Alıcı olan tüzel kişi veya ticari işletmedir (Organization).
 * 2. Tek Giriş (Single Ingress): Tüm ticari şirket temsilcileri /personal üzerinden
 *    Kişisel Çalışma Alanına giriş yapar ve yetkili oldukları Şirket Çalışma Alanını açar.
 * 3. Kapalı B4B Koruması: Şirket bağlamı olmadan katalog, fiyat veya ürün detayları
 *    görüntülenemez (Fail-closed koruması).
 * ============================================================================
 */

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "DoğruAdres Giriş",
  robots: { index: false, follow: false },
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <div className="max-w-lg w-full rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-700 text-white font-bold">
            DA
          </div>
          <h1 className="text-xl font-bold text-neutral-900">
            DoğruAdres Kapalı B4B Girişi
          </h1>
        </div>

        <div className="mb-4 rounded-md border-l-4 border-blue-700 bg-blue-50 p-3 text-sm font-semibold text-blue-900">
          Bireysel Müşteri Girişi Kaldırıldı — Tek Kurumsal Giriş
        </div>

        <p className="mb-3 text-sm leading-relaxed text-neutral-600">
          DoğruAdres kapalı bir B4B otomotiv ticaret platformudur. Bireysel (B2C) müşteri hesabı
          veya ayrı alışveriş girişi bulunmamaktadır.
        </p>

        <p className="mb-6 text-sm leading-relaxed text-neutral-600">
          Tüm ticari alıcı ve satıcı şirket temsilcileri tek giriş kapısından (<strong>/personal</strong>)
          Kişisel Çalışma Alanına giriş yapar ve yetkili oldukları şirketlerini seçerek işlem yapar
          (Bkz: Issue #255, #243).
        </p>

        <a
          href="/personal"
          className="block w-full rounded-lg bg-blue-700 py-3 text-center text-sm font-semibold text-white hover:bg-blue-800 transition-colors"
        >
          DoğruAdres Tek Giriş Kapısına Git (/personal)
        </a>
      </div>
    </div>
  )
}
