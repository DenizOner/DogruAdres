## Amaç ve mevcut kanonik kayıt

<!-- İlgili Issue/ADR bağlantısı, yeni iş veya eski işin devamı -->

## Değişiklik ve kapsam dışı işler

<!-- Değişen dosyalar, hazır Medusa/Mercur işlevlerinin yeniden yazılmadığına dair kısa doğrulama -->

## Güvenlik, veri ve sürüm etkisi

- [ ] Gerçek sır, kullanıcı verisi veya özel `.env` eklenmedi.
- [ ] Migration, upstream, bağımlılık, yetki ve üretim ayarı etkisi belirtildi (yoksa açıkça yok yazıldı).
- [ ] Ücretli hizmet/yazılım ve ücretli GitHub özelliği kullanılmadı.

## Doğrulama ve kanıt

<!-- Exact head SHA, base SHA, koşulan komutlar, CI bağlantıları, negatif testler, gerçek ve sentetik ortam ayrımı -->

## Açık riskler ve geri alma

<!-- Test edilmemiş yollar, geçici kaynak temizliği, korunacak veriler ve geri alma -->

## İnceleme / merge kapısı — ortak GitHub hesabı

**Gerçek kod-yazarı yürütücüsü/bağlamı:** <!-- ChatGPT görüşmesi / Antigravity Agent görevi / insan; bilinmiyorsa UNVERIFIED. GitHub kullanıcı adı bu bilgi değildir. -->

**Bağımsız denetim raporu:** <!-- PR yorumuna REVIEW-PROVENANCE-v1 bağlantısı; rapor ayrı Agent/oturum/icracı, ham diff, tam HEAD/base, test kanıtı, bulgular ve PASS|CHANGES REQUIRED|BLOCKED içermeli. Henüz yoksa NOT REVIEWED. -->

- [ ] Kaynak değişikliğini yazan/düzelten icracıdan **fiilen ayrı** denetim oturumu/görevi ve raporun gerçek kökeni kaydedildi (ortak GitHub login kendi başına kanıt değildir).
- [ ] Ayrı denetçi tam değişiklik/diff'i ve uygulanabilir güvenlik/karar sınırlarını **bizzat** inceleyip gerçek kanıtlı **PASS** verdi; eksik erişim veya kaynak için BLOCKED korundu.
- [ ] Güncel **tam HEAD ve base SHA**, gerekli CI/test/güvenlik/negatif kabul koşulları ve engelleyici bulguların kapanması doğrulandı.
- [ ] Denetim taşınmışsa `AGENT-REPORTED / RELAYED` olduğu ve raporu yayımlayan ortak hesap açıklandı; doğrulanamayan oturum kimliği uydurulmadı.
- [ ] Merge öncesi branch kapsamı, GitHub'da **gerçekten etkin** kurallar ve varsa ayrı ürün/güvenlik/veri/deploy kararları kontrol edildi. **Sırf merge için yeni Ürün Sahibi onayı gerekmez (#208).**

> Bu şablonun doldurulması, tek başına CI başarısı ya da yazarın kendi incelemesi merge izni değildir. #208'in bağımsız inceleme ve exact-SHA kapıları geçildiyse yetkili yürütücü ayrıca Ürün Sahibi merge onayı istemeden birleştirebilir; eksikse BLOCKED.
