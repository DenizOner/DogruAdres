/**
 * ============================================================================
 * DOĞRUADRES MİMARİ BİLGİLENDİRME VE YÖNLENDİRME (DA-ARCH-INGRESS-VENDOR)
 * ============================================================================
 * 
 * BU GİRİŞ KAPISI KAPATILMIŞTIR (DEPRECATED & REDIRECTED TO /personal)
 * 
 * Neden Kapatıldı?
 * -----------------
 * DoğruAdres pazar yeri mimarisinde bağımsız bir Satıcı giriş ekranı (/seller)
 * YOKTUR.
 * 
 * Yeni Mimari Akış (Bkz: Issue #217, #252, #482, #255, #374):
 * 1. Gerçek Kişi (Person) Satıcı Değildir: İnsanlar şahsi olarak satıcı veya alıcı değildir;
 *    şirketleri opere eden yetkili kullanıcılardır.
 * 2. Satıcı Olan Şirkettir (Organization): Ticari alıcı ve satıcı olan tüzel kişilik veya
 *    şahıs işletmesidir. Bir şirket hem Alıcı (katalogdan parça alma, filo yönetme)
 *    hem de Satıcı (mağazalar açıp ürün satma) olabilir.
 * 3. Tek Giriş (Single Ingress): Tüm kullanıcılar /personal üzerinden giriş yapar.
 * 4. Şirket Çalışma Alanı: Kişi yetkili olduğu şirketi seçtiğinde (/organization), o şirketin
 *    hem alıcı hem satıcı yeteneklerini tek çatı altında yönetir.
 * 
 * Bu ekran, /seller adresine doğrudan gelen kullanıcıları ve geliştiricileri bilgilendirir
 * ve otomatik olarak /personal tek giriş kapısına yönlendirir.
 * ============================================================================
 */

import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

function VendorRedirectNotice() {
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
            DoğruAdres Satıcı & Şirket Alanı
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
          Ayrı Satıcı Giriş Kapısı Birleştirildi
        </div>

        <p style={{ margin: "0 0 1rem", fontSize: "0.95rem", lineHeight: 1.6, color: "#506079" }}>
          DoğruAdres pazar yeri mimarisinde bağımsız bir Satıcı giriş ekranı (<code>/seller</code>) bulunmamaktadır.
          Gerçek kişiler doğrudan satıcı veya alıcı değildir; satıcı veya alıcı olan şirketlerdir (Organization).
        </p>

        <p style={{ margin: "0 0 1.5rem", fontSize: "0.95rem", lineHeight: 1.6, color: "#506079" }}>
          Tüm kullanıcılar tek giriş kapısından (<code>/personal</code>) giriş yaparak yetkili oldukları
          <strong> Şirket Çalışma Alanı</strong>na (<code>/organization</code>) erişir ve mağaza işlemlerini
          buradan yönetir (Bkz: Issue #217, #252, #482).
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
  createRoot(rootEl).render(<VendorRedirectNotice />);
}
