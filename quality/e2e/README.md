# DoğruAdres — tarayıcı testlerinin gerçek kapsamı

[governance-automation.yml](../../.github/workflows/governance-automation.yml) içindeki Playwright/Chromium işi **sentetik araç ve seçili bileşen güvenliği kontrolüdür**. Gerçek Next.js sayfa gezinmesi, Medusa API, Person/Organization/Store oturumu, PostgreSQL, yetki iptali, sipariş veya ödeme sonucunu doğrulamaz. Bu işe dayanarak ürün E2E kabulü ya da M0 tamamlandı sonucu verilemez.

Gerçek ürün kabul kanıtı her senaryonun **kendi** [#147](https://github.com/DenizOner/DogruAdres/issues/147), [#252](https://github.com/DenizOner/DogruAdres/issues/252) veya ilgili görev Issue/PR kaydındadır. Foundation dahil başka workflow'lardaki Chrome/HTTPS/izole PostgreSQL testleri farklı kapsamda gerçek davranış kanıtı sağlayabilir; yalnız yürütülen testlerin koşum/SHA, aktör, hedef ve olumlu/olumsuz sonuçları kadar geçerlidir.

Yeni gerçek tarayıcı kabulü yalnız mevcut onaylı ve izolasyonu doğrulanmış UI/API/DB/rol kaynaklarında yapılır. Gerçek sayfada tıklama, yetkili/yetkisiz erişim, yenileme, oturum kapanması, HTTP ve kalıcı sunucu sonucu gerektiği yerde birlikte test edilir. Ortam yoksa `NOT TESTED / ENVIRONMENT BLOCKED` denir, yeni DB/servis/senaryo için kendiliğinden izin çıkarılmaz. Kamuya açık CI artefaktlarına cookie, token, oturum görüntüsü veya kişisel veri yüklenmez.

Ek runner, toplu tekrarlanan test, sentetik sonuçtan gerçek PASS veya yeni dağıtım yaratmayın. Ayrı bağımsız #208 kaynak incelemesi ve [AGENTS.md](../../AGENTS.md) gereksinimleri korunur.
