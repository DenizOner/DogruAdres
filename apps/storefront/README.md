# DoğruAdres — Alıcı (Storefront) uygulaması

`apps/storefront` mevcut monoreponun Next.js tabanlı alıcı arayüzüdür. Bu, upstream Mercur'un B2C demo mağazası veya herkese açık checkout ürünü değildir. Geçerli davranışlar yalnız [AGENTS.md](../../AGENTS.md), [#171](https://github.com/DenizOner/DogruAdres/issues/171), [#243](https://github.com/DenizOner/DogruAdres/issues/243), [#252](https://github.com/DenizOner/DogruAdres/issues/252) ve yetkili görev kayıtlarıyla belirlenir.

## Yetki ve ürün sınırı

- Alıcı ve satıcı işlevleri, kanonik Person'ın etkin ve yetkili tüzel Organization/Store bağlamında yürür; upstream Customer/Seller hesabı tek başına izin veya mülkiyet değildir.
- Kullanıcıya gösterilen fiyat, stok, sipariş ve özel teklifler güncel sunucu yetkisi ile Store/Organization izolasyonunu korumalıdır. Ön bellek eski veya yabancı kuruluşa ait bilgiyi açmamalıdır.
- [#254](https://github.com/DenizOner/DogruAdres/issues/254) nedeniyle gerçek checkout, ödeme/capture, ödeme sağlayıcısı ve callback akışları **kapalıdır**. Demo ekranlar veya kurulu Stripe/TalkJS/Algolia paketleri bu hizmetlerin kullanılmasına/onayına izin vermez.
- Ücretli/deneme/kapalı üçüncü taraf hizmetleri, yeni gerçek kullanıcı verisi veya deployment için bu belgede izin verilmez; [#211](https://github.com/DenizOner/DogruAdres/issues/211) ve gizlilik sınırları uygulanır.

## Çalışma ve test

İşe başlamadan önce gerçek repo kökünü, hedef dal/HEAD'i, bağımlılıkları ve izinli API/DB ortamını [AGENTS.md](../../AGENTS.md) ve [#229](https://github.com/DenizOner/DogruAdres/issues/229) ile doğrulayın. Kök proje `bun@1.4.2` kullanır. Mevcut izinli monorepo bağımlılıkları kurulduktan sonra yalnız bu uygulamada:

```bash
cd apps/storefront
bun run dev
```

`dev`, `build`, `start`, `lint` komutlarının güncel karşılığı bu klasördeki [package.json](package.json) dosyasındadır. Hazır upstream örnek .env değerleri, gerçek servis anahtarları veya demo ödeme anahtarları kopyalanmamalıdır. Mevcut yerel yapılandırma ve gizli değerler GitHub'a yazılmaz.

Kabul için yalnız görsel görüntü yeterli değildir: izinli ve reddedilen Person/Organization/Store yollarını gerçek UI/HTTP ve izole kalıcı veri üzerinden ilgili görevde test edin. Birim/sentetik Chrome sağlığı, ürünün uçtan uca çalıştığı anlamına gelmez.
