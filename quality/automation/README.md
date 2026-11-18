# GitHub durum bildirimi — yalnız proje meta verisi

[.github/workflows/governance-automation.yml](../../.github/workflows/governance-automation.yml) içindeki `pulse` işi, standart ücretsiz GitHub Actions üzerinde ana dalda haftalık veya yetkili manuel tetikleme ile çalışır. Sadece sınırlı GitHub Issue/PR/durum/otomatik kontrol meta verilerini okur ve anlamlı değişiklik varsa [#245](https://github.com/DenizOner/DogruAdres/issues/245) kaydına yinelenmeyen kısa bildirim yazar. Gizli veri, Issue gövdesi, özel test/DB kaydı veya kimlik bilgisi yayımlamaz.

Bu **ajan çalıştırıcısı, koordinatör, inceleme veya ürün kabul sistemi değildir**. Ajanları uyandırmaz, gelen talepleri yerine getirmez, code review sonucu üretmez, PR açmaz/birleştirmez ve dalları silmez. Ürettiği özet doğrudan [#216](https://github.com/DenizOner/DogruAdres/issues/216) görev/inceleme kayıtları ile [AGENTS.md](../../AGENTS.md) yerine geçmez. Var olan durum bilgisinden yeni onay veya gerçek kullanıcı yolu PASS'i çıkarılamaz.

`pulse` yalnız trusted `main` schedule/manual koşumunda `issues:write` iznine sahiptir. PR'deki `tooling` işi read-only, sentetik bileşen/Chromium testi olup gerçek alıcı, Medusa HTTP, yetkilendirme, DB veya ödeme kabulü değildir. Test/merge kanıtı için gerçek koşum, exact HEAD/base ve [#208](https://github.com/DenizOner/DogruAdres/issues/208) geçerlidir.

Aynı durum değişimini yeniden yorumla çoğaltmayın. Bu otomasyonun kapatılması gerekirse yalnız ilgili workflow kapatılır; veri silme, branch cleanup ve repo güvenlik ayarları ayrı onay/sınırlar altındadır.
