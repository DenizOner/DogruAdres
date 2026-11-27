/**
 * ============================================================================
 * DOĞRUADRES MİMARİ BİLGİLENDİRME VE YÖNLENDİRME (DA-ARCH-INGRESS-ADMIN)
 * ============================================================================
 * 
 * BU GİRİŞ KAPISI KAPATILMIŞTIR (DEPRECATED & REDIRECTED TO /personal)
 * 
 * Neden Kapatıldı?
 * -----------------
 * DoğruAdres B2B platform mimarisinde bağımsız bir Admin giriş ekranı (/dashboard)
 * veya izole platform personeli login kapısı YOKTUR.
 * 
 * Yeni Mimari Akış (Bkz: Issue #217, #218, #482, #255, #373):
 * 1. Tek Giriş (Single Ingress): Platform operatörleri de dahil olmak üzere tüm
 *    kullanıcılar platforma kanonik bir "Gerçek Kişi" (Person) olarak tek bir kapıdan
 *    (/personal/session) giriş yapar.
 * 2. Kişisel Çalışma Alanı (Personal Workspace): Giriş yapan kişi /personal adresine ulaşır.
 * 3. Platform Operatörü Kartı: Sistem yöneticisi yetkisine (platformStaff) sahip olan
 *    kişiler, şirket seçenekleri arasında özel "DogruAdres" platform çalışma alanını görür.
 * 4. Platform Yönetim Araçları: Buraya tıklandığında şirket onayları, vergi levhası incelemeleri
 *    ve mağaza açılış onayları (/platform/*) aynı tek oturum altında açılır.
 * 
 * Bu ekran, /dashboard adresine doğrudan gelen kullanıcıları ve geliştiricileri bilgilendirir
 * ve otomatik olarak /personal tek giriş kapısına yönlendirir.
 * ============================================================================
 */

import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

function AdminRedirectNotice() {
  const [seconds, setSeconds] = useState(3);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.replace("/personal");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f6f8fb",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#243247",
        padding: "1.5rem",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: "36rem",
          width: "100%",
          backgroundColor: "#ffffff",
          borderRadius: "1rem",
          border: "1px solid #d6dfea",
          padding: "2rem",
          boxShadow: "0 4px 16px rgba(36, 50, 71, 0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
          <div
            style={{
              width: "2.5rem",
              height: "2.5rem",
              borderRadius: "0.5rem",
              backgroundColor: "#1453a3",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontWeight: "bold",
              fontSize: "1.25rem",
            }}
          >
            DA
          </div>
          <h1 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 700, color: "#1453a3" }}>
            DoğruAdres Platform Yönetimi
          </h1>
        </div>

        <div
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "#eaf1fa",
            borderLeft: "4px solid #1453a3",
            borderRadius: "0.35rem",
            marginBottom: "1.25rem",
            fontSize: "0.95rem",
            fontWeight: 600,
          }}
        >
          Ayrı Admin Giriş Kapısı Birleştirildi
        </div>

        <p style={{ margin: "0 0 1rem", fontSize: "0.95rem", lineHeight: 1.6, color: "#506079" }}>
          DoğruAdres mimarisinde bağımsız bir Admin giriş ekranı (<code>/dashboard</code>) bulunmamaktadır.
          Tüm kullanıcılar ve platform yöneticileri tek giriş kapısından (<code>/personal</code>)
          <strong> Kişisel Çalışma Alanı</strong>na giriş yapar.
        </p>

        <p style={{ margin: "0 0 1.5rem", fontSize: "0.95rem", lineHeight: 1.6, color: "#506079" }}>
          Yetkilendirilmiş platform personeli, kişisel çalışma alanındaki şirket seçenekleri arasında
          <strong> "DogruAdres"</strong> platform kuruluşunu seçerek tüm onay ve denetim araçlarına
          buradan erişir (Bkz: Issue #217, #482, #255).
        </p>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            alignItems: "stretch",
          }}
        >
          <a
            href="/personal"
            style={{
              display: "inline-block",
              textAlign: "center",
              backgroundColor: "#1453a3",
              color: "#ffffff",
              textDecoration: "none",
              padding: "0.75rem 1.25rem",
              borderRadius: "0.5rem",
              fontWeight: 600,
              fontSize: "1rem",
            }}
          >
            DoğruAdres Tek Giriş Kapısına Git (/personal)
          </a>
          <div style={{ textAlign: "center", fontSize: "0.85rem", color: "#7a5a00" }}>
            {seconds > 0
              ? `${seconds} saniye içinde otomatik yönlendiriliyorsunuz...`
              : "Yönlendiriliyor..."}
          </div>
        </div>
      </div>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<AdminRedirectNotice />);
}
