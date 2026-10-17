# DoğruAdres araştırma arşivi — envanter ve düzen önerisi

İnceleme tarihi: 10 Ekim 2026 (Europe/Istanbul).
Durum: Arşiv envanteri ve onay bekleyen düzen önerisi. Ürün gereksinimi, kabul edilmiş ADR veya uygulama onayı değildir.
Kapsam: D:\DogruAdres\docs\dogruadres\research\ içindeki başlangıçta mevcut bütün raporların salt okunur incelemesi. Bu dosya dışında hiçbir yazma yetkisi kullanılmadı.

## 1. Yöntem ve yönetişim

Gerçek çalışma dizini ve Git kökü D:\DogruAdres. Kök AGENTS.md, docs/dogruadres/README.md, PRINCIPLES.md, ARCHITECTURE.md, SECURITY.md, MERCUR-INTEGRATION.md, UPGRADE-POLICY.md ve adr/plans README dosyaları okundu. Ek AGENTS.md bulunmadı. Kullanıcı bu görev için yalnızca bir yeni envanter raporuna açık izin verdi. Okunan kurallarda bu ayrı araştırma artefaktını açıkça yasaklayan hüküm bulunmadı. Mimari/API davranışı hakkında yeni bir teknik doğrulama veya mimari karar yapılmadı; aşağıdaki teknik konular raporların ne söylediğinin sınıflandırmasıdır.

Arşivdeki dokuz dosyanın metinleri, konuşma/araç çağrısı kayıtları dahil okundu. Dosya boyutları bayt olarak ve SHA-256 hash'leri alındı. Yaygın credential biçimleri ve credential ataması göstergeleri metinsel olarak tarandı; değerler bu belgeye kopyalanmadı. Dış referanslar tekrar açılmadı, geçmiş araştırma yeniden yürütülmedi. Tarih, açık rapor tarihi bulunan metinden alındı; kaynak commit tarihi veya dosyanın kaydedilme zamanı rapor tarihi sayılmadı.

Başlangıç arşivi: yalnızca 01.md–09.md; alt dizin, README.md, başka Markdown/text raporu veya ilgisiz belge yok. Toplam kaynak boyutu 403.251 bayt. Bu envanter sonradan eklenen ayrı bir belge olup A1–A7/A3-R/G0 dizisinin parçası değildir.

## 2. Tam dosya envanteri

| Mevcut dosya | İçerikten belirlenen aşama | Gerçek konu | Açık rapor tarihi | Boyut (bayt) | Bütünlük ve biçim | İlişki ve sınır | Credential/secret değerlendirmesi |
|---|---|---|---|---:|---|---|---|
| 01.md | A1 | Domain sahipliği; Mercur/Medusa ile DoğruAdres sınırları; Organization–Seller ayrımı, ilişki cardinality'leri, güvenlik ve extension noktaları | Belirtilmemiş | 70.079 | 1.257 satır; ön araştırma konuşması/araç çağrıları ve 13 bölümlü sonuç raporu. Sonuç ve no-change teyidi mevcut; belirgin kesilme yok | A2'nin sınır/topoloji araştırmasının temeli. A/B/C kavramsal karşılaştırma; nihai servis veya şema seçimi yapmıyor | Gerçek credential saptanmadı; secret fallback riskine değer vermeden atıf var |
| 02.md | A2 | Platform çekirdeğinin yerleşimi, selective hybrid/modular monolith; ownership, synchronous/async sınırlar ve log/audit/ledger ayrımı | Belirtilmemiş | 48.466 | 544 satır; araç kayıtları ve 15 bölümlü sonuç raporu; açık bitiş var | A1'i devam bağlamı olarak kullanıyor; A3–A6'ya açık kararlar bırakıyor. Ortak backend önerisi uygulanmış veya kabul edilmiş karar değil | Gerçek credential saptanmadı; credential saklama ve redaction kuralları tartışılıyor |
| 03.md | A3 | Bigcapital/Basic Accounting fizibilitesi; ayrı servis, lisans, tenant DB, API/SSO, idempotency ve reconciliation | Belirtilmemiş | 53.861 | 1.451 satır; uzun araç çağrısı/delegasyon kayıtları ve 12 bölümlü nihai rapor. Sonuç ve salt okunur teyit mevcut | Bigcapital'ı ayrı servis olarak koşullu tercih ediyor. A3-R yeniden değerlendiriyor. Metindeki 9 Ekim 2026, incelenen commit tarihidir; rapor tarihi değildir | Gerçek credential saptanmadı; API key öneki ve kimlik mekanizmaları açıklanıyor, gerçek anahtar yok |
| 04.md | A4 | Çoklu kaynak para birimi, TRY fiyat yayını, TCMB/EVDS geçmişi, quote/checkout, refund ve komisyon | 2026-10-09 | 44.576 | 622 satır; 18 bölümlü bağımsız sonuç raporu; kaynaklar ve açık bitiş var | A1/A2 özetlerini bağlam alıyor, tam A1–A3'ün o tarihte bulunmadığını söylüyor. A5/A6'nın fiyat/finans önkoşullarını besliyor | Gerçek credential saptanmadı; EVDS key header anlatımı var, anahtar değeri yok |
| 05.md | A3-R | Native TypeScript/PostgreSQL Basic Accounting yeniden değerlendirmesi; double-entry, atomiklik, tenancy, FX ve optional accounting | 2026-10-10 | 43.373 | 507 satır; 17 bölümlü bağımsız rapor; PoC önerisi, kaynaklar ve bitiş var | A3'teki tercih yönünü değiştiriyor: dar yerel modül tercih, Bigcapital harici alternatif. Önceki A3 tam metninin o araştırmada bulunmadığını açıkça belirtiyor | Gerçek credential saptanmadı; secret/API key yaşam döngüsü açıklamaları var |
| 06.md | A5 | Kanonik kişi, Organizations, membership/Owner, kimlik doğrulama ve merkezi authorization; actor adapter'ları, davet/revocation, connector/AI/OEM scope | Belirtilmemiş | 40.473 | 480 satır; 18 numaralı bölümlü bağımsız rapor; açık bitiş var | A1–A4 tam metni yerine kullanıcı bağlamını kullanmış; A6 ve A7 için güvenlik temeli. Runtime/exploit ve bütün endpoint kapsaması kanıtlanmamış | Gerçek credential saptanmadı; token/credential güvenlik kuralları anlatılıyor |
| 07.md | A6 | Geliştirme yol haritası, güvenli foundation → marketplace, release minimumu, dikey dilimler ve kabul kapıları | Belirtilmemiş | 28.015 | 366 satır; 17 numaralı bölüm; 8–9 birlikte işlenmiş, eksik bölüm göstergesi değil. Sonuç var | A1–A5/A3-R özetlerinden planlama yönü çıkarıyor. Accounting sonraya, AI/OEM daha sonraya öneriliyor; onaylı plan veya takvim taahhüdü değil | Geliştirme JWT/cookie fallback değerinin literal alıntısı var; gerçek üretim sırrı veya çalışır credential olduğu doğrulanmadı. Değer burada yayımlanmıyor |
| 08.md | A7 | Organization BYOK, provider-neutral AI adapter, dar araç yürütücüsü, delegation/approval; gelecekte OEM/VIN ve provenance | 2026-10-10 | 43.347 | 486 satır; açık başlık/tarih ve 17 bölüm; kaynaklar, sınırlar ve bitiş var | A5 yetki ve A6 roadmap yönüne bağlı; A1–A6 tam metinlerinin o araştırmada bulunmadığını belirtiyor. Gerçek AI/OEM bağlantısı veya PoC yok | Gerçek credential saptanmadı; örnek secret değer vermeden fallback ve şifreleme tasarımına atıf var |
| 09.md | G0 / Step 1 | Mimari karar ve dokümantasyon boşluk denetimi; gereksinim/ADR/onay ayrımı, P0–P2 gap matrisi ve ilk security PoC hazırlığı | Belirtilmemiş | 31.061 | 297 satır; 14 bölümlü bağımsız rapor; kaynaklar ve bitiş var | A1–A7'nin o tarihte yerelde bulunmaması ve onay izlerinin eksikliğini kaydediyor. Araştırma tamamlanmışlığını veya mimari onayı kanıtlamıyor. Yalnız G0 Step 1 belgesi tanımlanabiliyor | Geliştirme JWT/cookie fallback değerinin literal alıntısı var; gerçek üretim sırrı veya çalışır credential olduğu doğrulanmadı. Değer burada yayımlanmıyor |

Bütünlük değerlendirmesi: Dokuz dosyada da konuya uygun sonuç, kaynak/kanıt bölümü ve görev bitişi bulunuyor; beklenen aşamalardan eksik olan yok. Özgün konuşmalar ve görev metinleriyle karşılaştırma yapılamadığından birebir eksiksiz ihracat garantisi verilemez. 01–03'te araçların adları, girdileri, hata kayıtları ve geçici çıktı dosyası yolları var; tam araç çıktıları ve A3'teki alt araştırmacı raporunun tam metni yok. Bu yollar bu incelemede açılmadı. Sonuç raporu tam görünse de bağımsız olarak bütün kanıtların yeniden üretilebilmesi sınırlı. 04–09 sonuç raporu biçiminde; tam araştırma konuşması içerdiği ileri sürülmüyor.

## 3. Eksikler, tekrarlar ve ilişkili sürümler

- Beklenen A1, A2, A3, A3-R, A4, A5, A6, A7 ve G0/Step 1 mevcut.
- G0 için başka adımlar, düzeltilmiş baskılar veya ek raporlar bulunmadı. Böyle raporların varlığı varsayılmıyor.
- Dokuz SHA-256 hash'i farklı: byte-for-byte kopya yok. İlgisiz belge veya ikinci baskı saptanmadı.
- A3 ile A3-R duplicate değildir. A3 ayrı Bigcapital servisini koşullu tercih ediyor; A3-R dar yerel Basic Accounting'i tercih ediyor. İki öneri ayrı araştırma anlarıdır; A3-R'nin A3'ü yetkili karar olarak supersede ettiği veya ürün sahibince kabul edildiği kanıtlanmadı.
- A3-R ayrıca Bigcapital çoklu kullanıcı/tenant üyeliği yorumunu güncelleme gereğini bildiriyor. A3'ün tamamıyle birebir yeniden denetim yapıldığı iddiası A3-R'de yok; tersine tam A3 metninin erişilemediği yazılı.
- A1/A2 → A3 ve A4 → A3-R → A5 → A6 → A7; G0 bu dizinin kalıcı belge ve onay izlerini denetliyor. Bu ilişki konu/atıf ilişkisidir; tarihleri bilinmeyen belgelerin kesin kronolojisi değildir. Mevcut numaralı kaydetme sırası A4'ü A3-R'den önce koyuyor; değiştirilmedi.
- A4–A7 ve G0'daki önceki raporların yerelde bulunmadığına dair cümleler tarihsel sınırlamalardır. Bugün raporların arşivde bulunması bu cümleleri geçmişe dönük yanlış yapmaz; kaynak raporlar güncellenmemeli.
- Kavramların sonraki aşamalarda ayrıntılandırılması approval sayılmaz. A6'da A1 adlı muhasebe dikey dilimi de var; bu, A1 domain audit'inden ayrı yerel dilim etiketidir.

## 4. Dosya adı eşleştirme önerisi

Bu tablo öneridir; hiçbir rename yapılmadı. Stage öneki + küçük harfli İngilizce konu slug'ı + .md kullanımı öneriliyor; mevcut numaralı ADR örüntüsünün araştırma için sade uyarlaması, henüz kabul edilmiş zorunlu kural değil. Bilinmeyen rapor tarihleri adlara eklenmedi. A3-R yeniden değerlendirme, G0-step-1 yönetişim denetimi ayrımını koruyor.

| Eski | Önerilen yeni dosya adı |
|---|---|
| 01.md | A1-domain-ownership-and-mercur-integration-boundaries.md |
| 02.md | A2-platform-core-placement-and-integration-topology.md |
| 03.md | A3-bigcapital-basic-accounting-feasibility.md |
| 04.md | A4-multi-currency-pricing-and-tcmb-exchange-rates.md |
| 05.md | A3-R-native-basic-accounting-reassessment.md |
| 06.md | A5-canonical-identity-organizations-and-authorization.md |
| 07.md | A6-development-roadmap-and-release-sequencing.md |
| 08.md | A7-ai-byok-and-future-oem-architecture.md |
| 09.md | G0-step-1-architecture-decisions-and-documentation-gap-audit.md |

Kontrol anında önerilen dokuz hedef adın hiçbirinde çakışma yoktu. Gelecekte rename öncesi yeniden kontrol gerekir. Çakışmada overwrite/merge yapılmamalı; yeni araştırma için bilinen tarih ve benzersiz zaman eki, bilinmeyen tarihli eski belge için -edition-02 gibi ayrı baskı eki önerilir. -revised yalnız gerçek düzeltilmiş rapor olduğunda, reassessment ise araştırmanın yeniden değerlendirildiği durumda kullanılmalı.

Basit arşiv önerisi: dokuz bağımsız rapor, ileride onaylanacak README ve ayrı envanter dosyaları mevcut research/ altında düz yapıda kalsın. Şu boyutta stage başına alt klasör, birleşik ana rapor veya silme gerekmiyor. Bu düzen uygulama onayı değildir.

## 5. Gelecek README.md tasarımı — yazılmadı

Hedef: docs/dogruadres/research/README.md. Henüz yok ve bu görevde oluşturulmadı.

Önerilen bölümler:

1. Amaç/kapsam: tam ve bağımsız araştırma raporlarının tarihsel korunması.
2. Statü/otorite: Archived research; rapor varlığı önerilerin onaylandığını kanıtlamaz. Gereksinim, kabul edilmiş ADR ve uygulama kanıtı ayrı belge türleridir.
3. Rapor dizini: ID, açıklayıcı başlık, göreli link, konu, açık tarih, önceki araştırmayla ilişki, kanıt/sınırlamalar ve arşiv statüsü.
4. İlişkili sürümler: A3/A3-R farklı tercihleri ve diğer tarihsel sınırlamalar.
5. Envanter/provenance: kaynak adı, hash, save tarihi ile report tarihinin ayrımı; envanter raporları ana audit dizisinden ayrı.
6. Onaylandıktan sonra kayıt ve indeks bakım kuralları.

Aşağıdaki göreli linkler yalnız önerilen rename işlemi ayrıca onaylanıp tamamlandığında geçerli olur. Rename yapılmazsa aynı indeks satırları 01.md–09.md mevcut adlarına bağlanmalıdır. Gelecek indeks mevcut olmayan hedeflere kırık link yazmamalıdır.

| ID | Başlık | Önerilen göreli link | Konu | Belge tarihi | Önceki araştırmayla ilişki | Kanıt ve sınırlama | Statü |
|---|---|---|---|---|---|---|---|
| A1 | Domain sahipliği ve Mercur sınırları | ./A1-domain-ownership-and-mercur-integration-boundaries.md | Ownership/integration | Bilinmiyor | Dizinin temel sınır araştırması | Yerel sürüm/source ve referanslar; canlı DB/runtime yok; transcript çıktıları eksik | Archived research |
| A2 | Platform çekirdeği ve entegrasyon topolojisi | ./A2-platform-core-placement-and-integration-topology.md | Placement/consistency | Bilinmiyor | A1'i ayrıntılandırır | Modular monolith önerisi; workflow ≠ ACID; deploy/runtime yok | Archived research |
| A3 | Bigcapital muhasebe fizibilitesi | ./A3-bigcapital-basic-accounting-feasibility.md | External accounting | Bilinmiyor | A2'nin muhasebe sınırını araştırır; A3-R ile birlikte okunur | Sabit kaynak commit'i; lisans/tenant/SSO ve idempotency açık; kurulum yok | Archived research |
| A3-R | Yerel Basic Accounting yeniden değerlendirmesi | ./A3-R-native-basic-accounting-reassessment.md | Native accounting | 2026-10-10 | A3 tercihine alternatif yeniden değerlendirme | A3 tam metni o görevde yok; finans/DB atomiklik PoC'si yok | Archived research |
| A4 | Çoklu kaynak fiyatları ve TCMB kurları | ./A4-multi-currency-pricing-and-tcmb-exchange-rates.md | Pricing/FX/checkout | 2026-10-09 | A1/A2 bağlamını fiyat alanına taşır | Yerel pricing/source; sınırlı TCMB örneği; backfill/runtime/EVDS3 kontratı eksik | Archived research |
| A5 | Kanonik kimlik ve Organization yetkileri | ./A5-canonical-identity-organizations-and-authorization.md | IAM/tenancy | Bilinmiyor | Önceki sınır ve muhasebe/FX yönlerinden yararlanır | Kaynak incelemesi; bypass/revocation runtime testi yok; auth onayı değil | Archived research |
| A6 | Yol haritası ve sürüm sıralaması | ./A6-development-roadmap-and-release-sequencing.md | Release planning | Bilinmiyor | A1–A5/A3-R özetlerinin planlama sentezi | Takvim/benchmark yok; onaylı uygulama planı değil | Archived research |
| A7 | AI/BYOK ve gelecekte OEM mimarisi | ./A7-ai-byok-and-future-oem-architecture.md | AI/delegation/OEM | 2026-10-10 | A5 güvenlik ve A6 aşamalama yönüne bağlı | Sağlayıcı/OEM sözleşmeleri ve gerçek pilot yok; online kaynaklar zaman bağımlı | Archived research |
| G0 / Step 1 | Mimari karar ve belge boşlukları | ./G0-step-1-architecture-decisions-and-documentation-gap-audit.md | Governance/approval gaps | Bilinmiyor | A1–A7'nin belge/onay izlerini inceler | O görevde tam raporlar yoktu; öneri/onay ayrımı ve gap matrisi; implementasyon denetimi değil | Archived research |

README kısa router olmalı; tam raporların yerine geçen özet belge olmamalı. Teknik iddialar indeks içinde yeni doğrulanmış gerçekler gibi tekrarlanmamalı. Onay durumu, onay tarihi/kanıtı ayrı yetkili kayda link vermelidir; eksik onay 'bilinmiyor/onay kanıtı yok' kalmalıdır.

İleride ana docs/dogruadres/README.md araştırma indeksine link için adaydır. adr/README.md ve plans/README.md yalnız ilgili karar/planlarla kanıt ilişkisi gerekiyorsa değerlendirilmelidir. Bu router'ların hiçbiri bu görevde değiştirilmedi.

## 6. Gelecek Agent raporu kaydetme konvansiyonu önerisi

Kullanıcı gelecekte tam araştırma raporlarının onaylı research/ konumuna kaydına izin verdi. Aşağıdaki bakım yapısı öneridir; indeks yapısı ve bakım yetkisi henüz onaylanmadı.

1. Atanan araştırmayı belirtilen kapsamda tamamla; ilgili AGENTS/router/governance ve gerekiyorsa sürüm eşleşmeli framework belgelerini oku.
2. Tam raporu Agent konuşmasında sun; kanıtları, belirsizlikleri, açık kararları ve görev sınırlamalarını koru.
3. Aynı tam rapor gövdesini research/ içinde ayrı Markdown belge olarak koru. Onay izlenebilirliği ve arşiv metadata'sı eklenebilir; sonuçlar kısaltılmaz veya bir önceki raporun üzerine yazılmaz.
4. Önerilen yeni ad: STAGE-descriptive-subject-YYYY-MM-DD.md. Tarih gerçek rapor tarihidir; eski tarih bilinmiyorsa icat edilmez. Aynı ad varsa -HHmmss+benzersiz ek veya ayrı edition adı seç. Dosyayı create-new semantiğiyle oluştur; overwrite yapma.
5. İlk rapor, reassessment ve corrected/revised edition ayrı tutulur; revision/reassessment önceki rapora açık link verir. Yeni öneri önceki belgeyi Accepted/Superseded yapmaz.
6. Başlıkta ID, konu, araştırma tarihi, Archived research statüsü, kapsam, kaynak sürümleri/commit'leri, kanıt etiketleri ve önceki rapor ilişkisi kaydedilir. Saklama zamanı gerekirse ayrı alandır. Kaynak atıfları tam raporda korunur.
7. Gerçek sır veya credential rapora dahil edilmez. Böyle bir içerik bulunursa değeri yaymadan dosya/konum düzeyinde bildirilir; kaynak belgeyi değiştirme/redact etme ayrı açık yetki gerektirir.
8. README yapısı ve bakım politikası ürün sahibi tarafından onaylandıktan sonra indeks güncellenir. Bu onay gelene kadar rapor kaydetme izni, README yazma veya router değiştirme izni sayılmaz.
9. Görev raporlarını AGENTS.md veya CODEBASE.md içine yazma. Gereksinim, ADR, plan ve governance değişiklikleri kendi onaylı iş akışlarıyla yapılır.
10. Kaydetme sonrası hash ve Git farkını kontrol et; korunan untracked dosyalar ve mevcut raporların değişmediğini teyit et.

Araştırma raporu kaydetme izni kaynak kodu, DB/schema/veri, migration, dependency kurulumu, config veya authoritative governance değişikliği yetkisi vermez. Resmileşmiş governance güncellemesi yapılana kadar önerilen konvansiyon daha kısıtlayıcı mevcut kuralları geçersiz kılmaz; yeni bir açık çatışma varsa bildirilir. Bu görevdeki tek-dosya sınırı, gelecekteki indeks güncelleme önerisine rağmen aynen uygulandı.

## 7. Yönetişim ve kanıt riskleri

- Aktif docs/dogruadres/README.md kendisini project-owned governance katmanı olarak tanımlar; research henüz router'da listelenmiyor. Ham araştırmanın otoritatif doküman olarak yanlış okunmaması için ileride açık statü ve router ayrımı onaylanmalıdır.
- G0/A6 bir kaynak olarak öneriler içerir; kendileri governance değişikliği talimatı değildir. Kaynak metinlerdeki önerilen uygulamalar bu envanterde yürütülmedi.
- A3/A3-R tercih farkı korundu. Yeni accounting politikası seçilmedi.
- Önceki raporların 'approved requirements' veya kullanıcı bağlamı referansları özgün görev/onay kayıtlarının tamamını içermez. Bu ifadeler bütün önerilere toplu onay kanıtı değildir.
- Online API/lisans/hukuk/provider ifadeleri tarihsel araştırma iddialarıdır; bu görev bunları güncel teknik/hukuki doğruluk olarak yeniden onaylamıyor. Uygulama tarihinde kendi resmi kaynaklarıyla yeniden doğrulanmalıdır.
- Bilinmeyen tarihler dosya mtime'ından doldurulmadı. Yerel save timestamp'leri report tarihi değildir.
- Gerçek secret saptanmaması eksiksiz güvenlik sertifikası değildir. 07/09 geliştirme fallback alıntıları içerir; üretimde kullanım doğrulanmadı. Bu envanter değerleri yayımlamaz, kaynakları redact etmez.
- PRINCIPLES development compose'u altyapı sayarken MERCUR-INTEGRATION temporary compatibility listesine koyuyor. Bu mevcut sınıflandırma çelişkisi okunan metinlerde de doğrulandı; arşiv işlemini engellemiyor ve burada düzeltilmedi.

## 8. SHA-256 bütünlük kayıtları

| Kaynak dosya | SHA-256 |
|---|---|
| 01.md | 04C4A8F7B8D71AAFEF1F7648AABF677CF7ED0A26C29A6280EDB83F608A09C7C9 |
| 02.md | 3E64E0FE62B5BD17EFFEEC6DD256A80F87536725BD00AFD2565403E3E4CF8DAD |
| 03.md | AF6F69B1AE8CC64101CACF9188979D95FE008837F5C51F271726FDDA396F650E |
| 04.md | D48154B5E5A68CC69C3AF017F49CA7ED9B5AD1469309D5015FA133A65AE03C35 |
| 05.md | 7D83105BF1FF66A52514EAAF3578AF72AEA6D3B8154C971E9562BB2BAD1EB2B0 |
| 06.md | 0E73E7B1AEA9B3CC637BBCE3669A3F76B9974C9D714B0AA6C3C89869B6CEBC6A |
| 07.md | 4173DCA02665C991B5952AABD30270C62E9BFC4CAD753AC7F90414217E401B84 |
| 08.md | 0218E37FBE24862B07A5DC9375BC8DC38B24FDA21F4E66C69EC9CAB7D192632F |
| 09.md | 2B922B188EF17AB5F8CAD0B5781E4FD09BA37580BC6457B97516C55E7AD5C1BE |

## 9. Git durumu ve izin sınırı

Başlangıç Git status --short:

```text
?? .vscode/
?? DESIGN.md
?? docs/dogruadres/research/
```

Tek yeni envanter dosyası aynı untracked research/ dizini altında olduğundan kısa status dizini topluca gösterir; dosya düzeyindeki yeni artefakt bu belgedir. Bitiş statusu ve kaynak hash karşılaştırması kaydetme sonrasında ayrıca doğrulanacaktır; sonuç Agent'ın son yanıtında bildirilecektir.

Mevcut dosyalar değiştirilmedi, silinmedi, yeniden adlandırılmadı, birleştirilmedi veya redact edilmedi. README/index oluşturulmadı. Kaynak/config/ADR/requirement/plan/governance değişikliği, DB işlemi, dependency kurulumu veya Git clean/reset/restore/stash yapılmadı. .vscode/ ve DESIGN.md korundu. Envanter sonrası durulur; rename, indeks ve bakım politikasının uygulanması ürün sahibi onayını bekler.