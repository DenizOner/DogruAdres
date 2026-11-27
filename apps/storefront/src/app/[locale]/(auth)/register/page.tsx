/**
 * ============================================================================
 * DOĞRUADRES MİMARİ BİLGİLENDİRME VE YÖNLENDİRME (DA-ARCH-INGRESS-REGISTER)
 * ============================================================================
 *
 * Bireysel (B2C) müşteri kayıt formu kaldırılmıştır. Kanonik DoğruAdres
 * gerçek kişi (Person) kaydı #217 ve #267 kapsamında zorunlu cep telefonu ve
 * en az 12 karakter parola doğrulaması ile /personal/register üzerinde yapılır.
 * ============================================================================
 */

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "DoğruAdres Kişisel Hesap Oluşturma",
  robots: { index: false, follow: false },
}

export default function RegisterPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-[70vh] items-center justify-center p-4 focus:outline-none"
    >
      <div className="max-w-lg w-full rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-700 text-white font-bold">
            DA
          </div>
          <h1 className="text-xl font-bold text-neutral-900">
            DoğruAdres Kişisel Hesap Oluşturma
          </h1>
        </div>

        <div className="mb-4 rounded-md border-l-4 border-blue-700 bg-blue-50 p-3 text-sm font-semibold text-blue-900">
          Tekil Kurumsal Kişi Kaydı
        </div>

        <p className="mb-3 text-sm leading-relaxed text-neutral-600">
          DoğruAdres’te yeni hesaplar yalnızca birinci taraf{" "}
          <strong>/personal</strong> tekil giriş kapısındaki özel kişi kayıt
          formu üzerinden oluşturulur (Ad, Soyad, E-posta, Zorunlu Cep Telefonu
          ve en az 12 karakterli Parola).
        </p>

        <p className="mb-6 text-sm leading-relaxed text-neutral-600">
          Kayıt olduktan sonra işletme başvurunuzu yapabilir veya mevcut bir
          şirket davetine katılabilirsiniz.
        </p>

        <a
          href="/personal?action=register#register-details"
          className="block w-full rounded-lg bg-blue-700 py-3 text-center text-sm font-semibold text-white hover:bg-blue-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          Kişisel Hesap Oluşturma Formuna Git
        </a>
      </div>
    </main>
  )
}
