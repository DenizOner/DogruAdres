# DoğruAdres

DoğruAdres, açık kaynak Mercur 2.4.1 ve MedusaJS 2.22.3 üzerinde geliştirilen, onaylı Person → Organization → Store yetkilendirmesini temel alan pazaryeri ürünüdür. Mercur/Medusa çekirdekleri değiştirilmez; DoğruAdres işlevleri proje uzantılarıyla geliştirilir.

## Güncel karar ve teslim akışı

- [AGENTS.md](AGENTS.md): tek geçerli ajan yürütme sözleşmesi, tek ACTIVE yazıcı, test ve güvenlik sınırları
- [#216](https://github.com/DenizOner/DogruAdres/issues/216): güncel görev/koordinasyon ve tek bağımsız inceleme kuyruğu
- [#208](https://github.com/DenizOner/DogruAdres/issues/208): ayrı, gerçek kaynağa dayalı bağımsız inceleme ve PR merge koşulları
- [#229](https://github.com/DenizOner/DogruAdres/issues/229): korunan veri, çalışma ortamı ve geri yükleme engelleri
- [#211](https://github.com/DenizOner/DogruAdres/issues/211): yalnız ücretsiz araç ve hizmetler
- [#147](https://github.com/DenizOner/DogruAdres/issues/147) ve [#252](https://github.com/DenizOner/DogruAdres/issues/252): M0/B22 gerçek kullanıcı kabulü
- [#254](https://github.com/DenizOner/DogruAdres/issues/254): checkout/ödeme PARK; ödeme etkinleştirmesi yok

**Başarı ölçüsü** açılan Issue/PR sayısı veya yeşil otomatik kontrol değildir: güvenli, izinli ve kalıcı gerçek kullanıcı işleminin doğrulanmış tamamlanmasıdır. Henüz onaylanmamış ürün davranışı, ücretli hizmet, korunan veriye yazma veya production deployment bu README ile yetkilendirilmez.

## Kaynak ağacı

| Yol | Kullanım |
| --- | --- |
| `packages/api/` | Medusa/Mercur API, modüller, iş akışları, yetki, kalıcılık ve testler |
| `apps/admin/` | Platform yönetimi arayüzü |
| `apps/vendor/` | Satıcı arayüzü |
| `apps/storefront/` | Alıcı arayüzü (yalnız yetkili kapsam) |
| `.agents/skills/` | Göreve özel, `AGENTS.md`ye tabi yürütme/inceleme prosedürleri |
| `.github/workflows/` | Gerçek GitHub Actions kontrol tanımları |
| `quality/` | Test ve salt-okunur proje kontrol yardımcıları |

## Güvenli geliştirme başlangıcı

Mevcut **yetkili** çalışma ağacını, dalı, kesin kod sürümünü ve ilgili servis/DB sahipliğini doğrulayın. Bilinmeyen bir ortamda yeni PostgreSQL/Redis/volume oluşturmayın, migration/seed çalıştırmayın veya veritabanını sıfırlamayın; [#229](https://github.com/DenizOner/DogruAdres/issues/229) geçerlidir.

Depo `bun@1.4.2` ve Node.js `>=22.22.0` kullanır. Sadece doğrulanmış çalışma ortamında:

```bash
bun install --frozen-lockfile
bun run dev
```

İşin özelliğine göre küçük hedefli testler kullanın. `bun run build` geniş monorepo derlemesidir; gerekmiyorsa rutin olarak çalıştırmayın. Gerçek tarayıcı/API/DB kabulü için onaylı sentetik izolasyon ve kaynağa bağlanmış test koşumları gerekir.

Mercur'un kurulu sürüm belgeleri için `node_modules/@mercurjs/docs/llms.txt` ve yalnız ilgili `content/**/*.mdx` bölümlerini kullanın. Ürün gereksinimlerini upstream örnek ekranlardan, paketlerden veya geçmiş PR yorumlarından türetmeyin.

## Mevcut sürümün kritik işletim sınırları

- **Telemetri:** `packages/api/medusa-config.ts` Mercur sunucu telemetrisini kapatır ve zorla açma değişkenini reddeder. Mercur CLI işlemleri için `MERCUR_DISABLE_TELEMETRY=true` ayrı gereklidir. Kurulu Admin/Vendor içindeki kullanıcı başlatımlı Feedback gönderiminin bu ayarla kapandığını varsaymayın; özel gizlilik/egress kanıtı olmadan üretimde açmayın.
- **Önbellek:** Mercur 2.4.1'in önbellek varsayılanından bağımsız olarak DoğruAdres `withMercur` yapılandırması `caching: false` kullanır. Yetki/tenant iptal ve veri tazelik kabulü olmadan bunu açmayın.
- **Eski mağazalar ve arama:** Eski Store/Seller/Offer verisine otomatik bölge, fiyat/izin veya indeks yetkisi atamayın. `POST /admin/index/sync` yalnız izinli izole Admin ortamında, gerçek yetki/olumsuz-yol ve kaynak kanıtıyla kullanılabilir.
- **Migration ve sürüm yükseltme:** `medusa db:migrate`, seller/region/payout/order group ve teklif bağları, invite-token hash gibi geçişler önce yetkili izole veride doğrulanır. Korunan veri ve üretim geçişi ayrı izin ve gerçek kurtarma/restore kanıtı gerektirir.
- **Ödeme:** Kurulu `processPaymentWorkflow` veya bir paket/anahtarın varlığı, sipariş kalıcılığı öncesi capture/crash riskini gidermez. [#254](https://github.com/DenizOner/DogruAdres/issues/254) çözülmeden gerçek checkout, callback ve ödeme aktifleştirilmez.

## Ürün güvenliği

Her korunan işlemde güncel sunucu kaynağından Person → Organization → Store yetki zinciri ve olumsuz senaryolar doğrulanır. Başka kuruluşun verisine erişim, eski yetkinin yeniden kullanımı, kişisel veri sızıntısı ve yetkisiz sipariş/ödeme kabul edilmez. Ödeme, checkout callback'i ve gerçek deployment ayrı onay olmadan **kapalıdır**. Güvenlik açığı ayrıntıları için [.github/SECURITY.md](.github/SECURITY.md) geçerlidir.
