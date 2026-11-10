---
name: wcag-2-2-manual-audit
description: Manual and assistive-technology WCAG 2.2 A/AA (and explicitly requested AAA) audit for DoğruAdres user journeys after reusing existing GitHub Actions axe-core/Chrome evidence. Use for accessibility acceptance, independent PR review, WCAG gap analysis, or defects needing human judgment; never treat automated scans as full compliance.
---

# WCAG 2.2 — manuel erişilebilirlik denetimi

## 1. Yetki, çağrılma ve sınırlar

Bu skill, **GitHub Actions'ın doğrulayamadığı veya yalnızca kısmen doğruladığı** WCAG 2.2 davranışını değerlendirir. Kök `AGENTS.md`, yürürlükteki Ürün Sahibi kararları, [#208](https://github.com/DenizOner/DogruAdres/issues/208), [#242](https://github.com/DenizOner/DogruAdres/issues/242) ve [independent-pr-review](../independent-pr-review/SKILL.md) önceliklidir. Yetki/grup/MFA/kuruluş güvenliğini atlama. Bu skill ürün tasarım onayı, ek zorunlu CI işi, yeni bağımsız denetçi veya merge izni **oluşturmaz**.

**Ne zaman kullanılır?** Açık tam WCAG denetimi talebinde, ilgili UI/UX değişikliğinin kabulünde, otomatik erişilebilirlik testinin `incomplete`/elle doğrulama gerektiren bulgusunda ve bağımsız denetçinin ilgili kullanıcı akışını değerlendirirken. Günlük sıradan kod değişikliklerinde tüm 86 ölçütü tekrar test etme; yalnız değişen riske/ekrana uygun manuel ölçütleri seç. Tam denetim açıkça istendiğinde resmî 86 ölçütün tamamını (31 A, 24 AA, 31 AAA) envantere al. 4.1.1 Parsing WCAG 2.2'den çıkarılmıştır.

**GitHub Actions kanıtını yeniden kullan:** `.github/workflows/identity-organization-foundation.yml` mevcut gerçek Chrome/HTTPS/izole PG16 B22 senaryosunda, `wcag22-axe-chrome.ts` kullanarak yalnız seçili form/panel için axe-core WCAG 2.2 A/AA kural altkümesini çalıştırır. Aynı işi ayrıca çalıştırma; tam ve güncel PR HEAD/base, test edilen birleştirme sürümü, job adımı, gerçekten erişilen DOM durumu, kural listesi, hatalar ve `incomplete` sayısını incele. Test kapsamı sınırlı; otomatik sıfır ihlal bile **tüm WCAG 2.2 AA PASS değildir**. Diğer ekranlar ve insan değerlendirmesi `NOT TESTED` kalabilir.

**Risk esaslı çalışma sırası:** Taslak PR'da hedefli, küçük test ve gerekirse erken gerçek tarayıcı; zorunlu Foundation static/API build çalışır. İncelemeye hazır PR'da tüm ilgili gerçek kabul, güvenlik/CodeQL/CI ve ayrı salt-okunur inceleme korunur. Kod/SHA/base değişmediyse geçerli manuel PASS'i gereksiz tekrar etme; değişen davranış/etki alanına göre yenile. `AGENTS.md` risk-gated test sıklığına aykırı yeni job, her commit için tam 86 ölçüt veya ağır tarama ekleme.

**Ortam koruması:** Yalnız izinli, izole, sentetik aktörlerle test et; üretim/korunan veriyi kullanma, gerçek ödeme, kalıcı veri silme, gizli bilgi isteme veya GitHub'a cookie/token/kişisel veri kaydetme. Salt-okunur denetçi kaynak/CI okuyabilir; browser/DB yazımı, yeni çalışma alanı, test çalıştırması için ayrıca icra yetkisi gerekir. Yetki/ortam yoksa ilgili kriter `BLOCKED` ya da `NOT TESTED`, asla varsayımsal PASS değildir. Ücretli araç/hizmet/deneme kullanma.

## 2. Dayanak ve karar modeli

- **Normatif:** [WCAG 2.2](https://www.w3.org/TR/WCAG22/) ve [Conformance](https://www.w3.org/TR/WCAG22/#conformance).
- **Bilgilendirici yöntem:** [WCAG-EM](https://www.w3.org/TR/WCAG-EM/), [How to Meet WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/), [Understanding](https://www.w3.org/WAI/WCAG22/Understanding/), [ARIA APG](https://www.w3.org/WAI/ARIA/apg/). Bunlar normatif ölçütlerin yerine yeni zorunluluk getirmez.
- Hedef belirtilmedikçe **WCAG 2.2 AA** değerlendirme varsayımıdır; ürün kararı olarak otomatik ilan edilmez. AA, A+AA'nın bütün uygulanabilir koşullarını gerektirir. AAA yalnız açık istek veya tavsiye kapsamıdır.
- Her ölçüt/sayfa-durum-rol için `PASS`, `FAIL`, `NOT_TESTED`, `BLOCKED`, gerekçeli `NOT_APPLICABLE` kullan. Otomatik araç `incomplete` sonuçları manuel değerlendirme bekler. Normatif uygunluk, yalnız puan ortalaması veya örneklemde sıfır hata değildir.
- Beş W3C uygunluk koşulunu ayrıca denetle: **seviye; tam sayfa; tam süreç; yalnız accessibility-supported teknolojilere dayanma; müdahale etmeme.** WCAG 2.2'nin 1.4.2, 2.1.2, 2.2.2, 2.3.1 müdahale etmeme koşullarını unutma. Yalnız örneklem incelendiyse bütün ürün için AA sertifikası verme.

## 3. Önce kapsam ve örneklem

1. Değişen yolculuğu, doğrudan kullanıcı etkisini, aktörü/kuruluşu, dili (`tr`, `en`, `ar` ve RTL), ekranı, uygulama varyantını (Admin, Vendor, Storefront, kişisel alan), kesin HEAD/base ve mevcut gerçek tarayıcı kanıtını tanımla. Ürün yüzeyi gerçekten çalışmıyorsa `NOT TESTED`.
2. WCAG-EM ile sayfa/şablon envanteri çıkar: ortak bileşenler, oturum açma/MFA, form, liste, diyalog, tablo, mobil menü, hata/boş/yükleniyor hali, yönlendirme, süresi dolmuş oturum, geri dönüş, yetki reddi. Tam süreçte kritik olumlu/olumsuz adımları dahil et.
3. Tam site denetiminde yapılandırılmış **ve bağımsız rastgele** örneklem oluştur; örneklem evrenini, seçme yöntemini, seçilen sayfaları ve genişletme nedenlerini yaz. Risk-sınırlı PR denetiminde örneklem yerine etkilenmiş gerçek durumları seç; tam site uygunluğu iddia etme.
4. Kullanılan browser/OS/yardımcı teknoloji ve sürümünü, viewport/zoom, açık-koyu tema, dil/RTL, aktör, test zamanı ve gerçek komut/işlem kayıtlarını belgele. Erişimi olmayan cihazı test etmiş sayma.
5. Otomatik axe-core raporundaki seçili scope'ları ve yanlış pozitif/incomplete bulgularını açığa çıkar; **yalnız açık kalan manuel boşluğu** test et. Kanıtı içermeyen CI özetini gözlem olarak değil iddia olarak değerlendir.

## 4. Manuel ve yarı otomatik doğrulama protokolleri

Her ilgili akışı **gerçek, yetkili UI** üzerinden yap. DOM veya birim testi, gerçek yardımcı teknoloji deneyiminin yerine geçmez.

| Yöntem | Eylem ve yeterli kanıt |
|---|---|
| Yalnız klavye | `Tab`, `Shift+Tab`, `Enter`, `Space`, oklar, `Escape`, `Home/End`; fare kullanmadan tam işlem, iptal, hata ve geri dönüş; odak sırası/görünürlüğü ve tuzak olmaması |
| Ekran okuyucu | Yetkili gerçek kombinasyon: ör. NVDA+Firefox/Chrome, VoiceOver+Safari veya TalkBack+Chrome; duyulan ad/rol/durum, navigasyon, canlı hata, modal ve oturum senaryosunu belgele. Birine erişilemiyorsa `NOT TESTED` |
| Görsel büyütme | %200 yazı, %400 zoom/320 CSS px ve 256 CSS px yükseklik karşılıkları; pan/clip, satır kırılması, yeniden akış, stilin 1.4.12 metin aralığı şartları |
| Odak ve açılır içerik | Odak örtülmesi, modal aç/kapat odak dönüşü, tooltip/popover içeriğini kapatabilme/üzerine gitme/sürdürme; gizli/offscreen kontroller |
| Dokunmatik | Dikey/yatay yönelim, 24 CSS px hedef/istisnalar, sürükle alternatifi, çoklu nokta/karmaşık hareket, pointer down/up iptali, cihaz hareketi alternatifi |
| Metin ve algı | Alt metnin **anlamı**, grafik/tablo ilişkisi, başlık sırası, renk bağımsızlığı, görüntü içindeki yazı, gerçek kontrast/arka plan varyasyonu |
| Form, MFA ve karar | Alan amacının ve talimatın anlaşılması, hata çözümü, zorunlu alan, erişilebilir kimlik doğrulama, parola yöneticisi/yapıştırma, tekrar veri istememe, kritik veri için geri al/onay |
| Medya ve hareket | Altyazı, transkript, sesli betimleme niteliği, durdur/ertele, parlayan içerik, hareket kontrolü ve reduced motion |
| Çok dilli | Türkçe, İngilizce, modern standart Arapça RTL: doğru okuma/dil değişimi, doğal sıra, odak, çeviri, sayı/ikon, yazı yönü ve seslendirme |

### WCAG ölçüt alanları — otomasyonun kanıtlayamadığı boşluklar

Aşağıdaki gruplar, A/AA manuel çalışmada **uygulanıyorsa** değerlendirilir. Ölçüt tanımını ve istisnaları her seferinde normatif W3C metninden doğrula; bir kuralın ismini duyup aynı numara altında farklı zorunluluk icat etme.

- **1.1.1:** Alt metnin sahnedeki anlamı, dekoratif görsel istisnası, CAPTCHA alternatifleri; `alt` özelliğinin varlığı tek başına yeterli değildir.
- **1.2.1–1.2.5:** Önceden kayıtlı/gerçek zamanlı ses ve görüntünün transkript, altyazı, sesli betimleme niteliği. AAA 1.2.6–1.2.9 açık kapsam varsa değerlendirilir.
- **1.3.1–1.3.5:** Anlamsal ilişki ve doğru okuma sırası, yalnız biçim/renkle verilen yönerge, yönelim, veri giriş amacının doğru semantiği.
- **1.4.1–1.4.13:** Yalnız renkle bilgi verme, ses kontrolü, metin/ikon/UI kontrastı (1.4.3/1.4.11), ölçeklenebilirlik ve reflow (1.4.4/1.4.10), resim olarak metin (1.4.5), görsel bilgi ve metin aralığı (1.4.12), hover/focus içerik davranışı (1.4.13). Dinamik görsel durumları ve normatif istisnaları manuel incele.
- **2.1.1–2.1.4:** Tüm işlemi klavyeyle yap, kapatılabilen odak tuzağı, özel kısayollar; otomatik tab döngüsü işlemin anlamını kanıtlamaz.
- **2.2.1–2.2.2:** Süre uzatma/kapama, hareketli/otomatik güncellenen içeriği durdurma. AAA 2.2.3–2.2.6 yalnız hedefteyse.
- **2.3.1:** Çakma/yanıp sönme sınırını video/animasyon için gerçeklikle doğrula; AAA 2.3.2/2.3.3 ayrıca.
- **2.4.1–2.4.7:** Atla bağlantısı, sayfa başlığı, anlamlı odak sırası, bağlantı amacı, birden çok yol, başlık/etiket ve odak görünürlüğü; özellikle yönlendirme, SPA, modal ve RTL durumları.
- **2.4.11 (AA):** Klavye odağının yazarın oluşturduğu içerikle tamamen gizlenmemesi. `2.4.12` (AAA) daha katı; `2.4.13` (AAA) odak göstergesinin alan/kontrast koşulları yalnız AAA hedefinde.
- **2.5.1–2.5.8:** İşaretçi jestleri ve iptal, etiket/ad uyumu, hareketle tetikleme, sürükleme alternatifi (2.5.7 AA), hedef ölçüsü (2.5.8 AA) ve istisnaları; yalnız CSS ölçümü tam kanıt değildir. AAA 2.5.5/2.5.6 istenirse.
- **3.1.1–3.1.2:** Varsayılan dil ve dil değişen parça seslendirmesi; AAA 3.1.3–3.1.6 açıkça istendiğinde.
- **3.2.1–3.2.6:** Odak/giriş değişimlerinde beklenmedik bağlam değişimi, tutarlı navigasyon/tanımlama, yardımın konumu (3.2.6 A). AAA 3.2.5 gerektiğinde.
- **3.3.1–3.3.4:** Hatanın metinsel tanımı, etiketi/talimatı, düzeltme önerisi, kritik yasal/mali/veri kararında kontrol/geri alma. 3.3.7 (A) aynı süreçte tekrar veri girişine zorlamama; 3.3.8 (AA) bilişsel işleve dayalı kimlik doğrulamada destek/alternatif. AAA 3.3.5/3.3.6/3.3.9 gerektiğinde.
- **4.1.2–4.1.3:** Gerçekte duyurulan erişilebilir ad/rol/değer ve durum mesajları; DOM'da ARIA bulunması sesli bildirimin doğru çalıştığını kanıtlamaz. 4.1.1 artık WCAG 2.2 ölçütü değildir.

### WCAG 2.2'nin yeni ölçütlerine özel zorunlu kontrol adımları

1. **2.4.11 (AA), 2.4.12 (AAA), 2.4.13 (AAA):** Bir form/modal/popover'da odakla ilerle; yapışkan üstbilgi ve kayan paneller altında hedefin görünürlüğünü gözle, gerektiğinde ekran videosu + CSS konumu kaydet.
2. **2.5.7 (AA):** Her sürükleme görevini yalnız tek işaretçiyle (drag gerekmeden) gerçekleştir; güvenli alternatif gerçek kullanıcı sonucuna ulaşmalı.
3. **2.5.8 (AA):** Küçük hedefler/komşuları CSS px ölç; her istisnayı W3C metniyle gerekçelendir; mobil dokunmayla etkileşimi ayrıca gözle.
4. **3.2.6 (A):** Aynı akışta yardımın konumu tutarlı mı, hata/oturum değişiminde kayboluyor mu?
5. **3.3.7 (A):** Çok adımlı başvuru, MFA ve işlemin tekrar açılmasında bilgi yeniden isteniyor mu; normatif istisna var mı?
6. **3.3.8 (AA), 3.3.9 (AAA):** Parola yöneticisi, yapıştırma, alternatif/yardım mekanizmaları engelleniyor mu? Güvenlik gerekçesiyle kontrolü atlama; sadece izinli sentetik hesap ve belgeli gerçek davranışı ölç.

## 5. DoğruAdres rol / ekran matrisi

İlgili değişiklikte en küçük yeterli matrisi seç:
- **Anonim:** giriş, kayıt, parola sıfırlama, hata mesajı, kayıt formu ve MFA'ya geçiş.
- **Person/Owner:** kuruluş seçimi, izin yok/var, güvenli MFA, profil, mağaza başvurusu, mağaza durdur/aç, bildirim ve oturum yenileme.
- **Platform Staff:** mağaza inceleme, askıya alma/yeni ad/yeniden açma, doğrulanamayan ad/URL için butonun pasifliği + *anlaşılabilir* uyarı ve odağın davranışı.
- **Seller/Buyer:** satış paneli, katalog/sepet/ödeme yalnız onaylı ve gerçek kullanılabilir kapsama girmişse; mock/olmayan ekranı PASS sayma.
- **Negatif durum:** 401/403, yetki geri alma, yabancı kuruluş, 409 çakışma, 503 geçici hata; bilgi sızdırmadan mesaj, görünür odak, klavye ile geri deneme.
- **Diller:** TR/EN/AR-RTL onaylı ekranlarda test edilir; henüz olmayan çeviriye PASS verilmez.

Örnek WCAG 2.2 AA inceleme: askıdaki mağazanın hakkı doğrulanamadığında, klavye ile sayfaya ilerle; uyarının anlaşılır olduğunu, neden yeniden açmanın kapalı olduğunu, kapalı eylemin yanıltıcı odak/seslendirme yaratmadığını, yenileme eyleminin klavyeyle çalıştığını, durum mesajının ekran okuyucuda duyulduğunu gözlemle. Sunucu yetki/audit/kalıcılık testinin yerine bu kontrolleri koyma.

## 6. Bulgu, kanıt, yeniden test ve çıktı

Her bulguda `SC numarası + A/AA/AAA`, aktör/kuruluş, ekran + durum, kesin HEAD/base, ortam/browser/AT sürümü, **gerçek adım adım yeniden üretim**, beklenen/gözlenen davranış, kullanıcı etkisi, kaynak dosya/satır, anonimleştirilmiş kanıt, istisna değerlendirmesi, en küçük güvenli düzeltme ve etkilenen regresyon yer alır. Önceliği (P0/P1/P2/P3) WCAG seviyesine eşitleme; işlemi tamamen engelleyen erişilebilirlik kusurunu ayrı önemlendir.

**Kanıt örneği (salt şablon):**

```yaml
assessment:
  repo: DenizOner/DogruAdres
  pr: 301
  head: "<tam commit>"
  base: "<tam commit>"
  target: WCAG_2.2_AA
  journey: "Platform Staff / askıdaki mağaza yeniden açma"
  locale: tr-TR
  environment: "isolated authorized browser + synthetic account"
  browser_at: "browser/OS/screen reader and real versions, or NOT TESTED"
  existing_ci_evidence: "GitHub Actions run URL and actual step result"
finding:
  sc: "4.1.3"
  status: NOT_TESTED
  page_state: "invalid name entitlement / review-only"
  evidence: "NO SCREEN READER SESSION"
  user_effect: "status announcement cannot yet be verified"
  next_check: "independent real screen-reader observation"
```

**Rapor:** kapsam/örneklem → mevcut CI ile kanıtlananlar → ölçüt/durum matrisi → tekilleştirilmiş manuel bulgular → açık/engelli kontroller → düzeltme/yeniden test → uygunluk sınırı. Tam denetimde 86 ölçütü resmi kaynaktan envantere al; yapılmayanları NOT TESTED olarak işaretle, N/A için gerekçe ver. Normal PR için yalnız ilgili ölçütleri raporla. Hazır ve değişmemiş PASS'i tekrar yazma veya aynı hataya mükerrer Issue açma.

**Kabul:** Kritik manuel FAIL kalıyorsa ilgili UI kabulü FAIL; erişim yoksa BLOCKED/NOT TESTED; sadece gözlemlenmiş kapsam PASS olabilir. Son kodun farklı bağımsız incelemesi, ASVS 5, CodeQL, gerçek HTTP/DB/Chrome, zorunlu CI ve #208 merge kapıları ayrı geçerlidir. Denetçi yalnız salt-okunursa kod düzeltmesi/commit/PR onayı yapamaz. Ürün Sahibi raporunu kök AGENTS.md'deki **1. Ne çalışıyor? / 2. Ne eksik veya riskli? / 3. Şimdi ne yapılacak?** üç başlığıyla ve sade Türkçeyle tamamla.
