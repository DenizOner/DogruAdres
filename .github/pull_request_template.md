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

## İnceleme / merge kapısı

- [ ] Bağımsız kaynak incelemesi ve gerekli güvenlik testleri yapıldı.
- [ ] Nihai HEAD ve base, CI sonuçlarıyla eşleştirildi.
- [ ] Bağımsız incelemenin gerçek icracısı/yazardan ayrılığı, incelenen tam HEAD/base ve PASS kanıtı kaydedildi.
- [ ] Engelleyici bulgu kalmadı; gerekli CI/test/güvenlik ve varsa tarayıcı/DB/negatif kabul kanıtı HEAD/base ile eşleşiyor.
- [ ] Merge hemen öncesi güncel HEAD/base, GitHub'da gerçekten etkin kurallar ve yetkilendirilmiş uygulama kapsamı doğrulandı.
- [ ] Bu PR'nin kapsamındaki ayrı Product Owner ürün/güvenlik/DB/deploy kararları gerekiyorsa önceden alınmış; sırf merge için yeniden kullanıcı onayı gerekmiyor (#208).
- [ ] `main` üzerinde ücretli plan gerektiren dal korumasının zorunlu uygulandığı iddia edilmiyor.

> Bu şablonun doldurulması, tek başına CI başarısı ya da yazarın kendi incelemesi merge izni değildir. #208'in bağımsız inceleme ve exact-SHA kapıları geçildiyse yetkili yürütücü ayrıca Ürün Sahibi merge onayı istemeden birleştirebilir; eksikse BLOCKED.
