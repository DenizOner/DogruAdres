---
name: owasp-asvs-5-auditor
description: Evidence-based OWASP ASVS 5.0.0 L1/L2/L3 auditing across 345 requirements. Use for explicit ASVS baseline, gap assessment or risk-scoped ASVS review. Follow root AGENTS.md testing and independent-review gates.
---

# OWASP ASVS 5.0.0 — Tam Kapsamlı Güvenlik Denetimi

## 1. Görev, yetki ve öncelik

Denetim hedefi, OWASP ASVS 5.0.0 gereksinimlerini *kanıtla* doğrulamaktır. Bu skill bir ürün politikası, denetim sertifikası, merge onayı, yeni zorunlu CI işi veya yeni altyapı değildir. Güncel onaylı Ürün Sahibi kararları, kök AGENTS.md ve geçerli ADR'ler her zaman önceliklidir. #208 bağımsız denetim ve merge, #211 sıfır ücret, #244 orantılı ASVS kapsamı, kökteki 10 Kasım 2026 risk-gated testing politikası uygulanır.

- Kullanıcı tam ASVS değerlendirmesi isterse tüm 345 gereksinimi kaynak envanterine al. Gündelik geliştirmede yalnız değişen saldırı yüzeyine uygun ASVS maddelerini seç: her PR için 345 test çalıştırma.
- Mevcut .agents/skills/security-source-review ve independent-pr-review görevleri geçerlidir. Bu skill onların yerine geçmez, yazara bağımsız denetçi niteliği kazandırmaz.
- Taslak PR'da hedefli kaynak/test ve erken gerekli gerçek HTTP/DB/tarayıcı güvenlik negatif kontrolleri; zorunlu Foundation static ve API build gerçek tetiklemesi sürer. Zorunlu olmayan ağır işler AGENTS.md uyarınca ready aşamasına ertelenebilir; riskli varsayım ertelenmez.
- Ready PR'da ilgili tüm zorunlu CI, gerçek kullanıcı akışı, yetkisiz yol, kalıcılık, WCAG 2.2, CodeQL ve bağımsız inceleme kapıları korunur. Yeni HEAD/base eski kanıtın uygulanabilirliğini yeniden değerlendirmeyi gerektirir. Geçerli PASS'i nedensiz yineleme.
- Salt okunur görevde dosya, ref, test veri tabanı, CI veya kayıtları değiştirme. Yetkili, izole ortam dışında aktif tarama, saldırı, yüksek hacimli fuzzing, gerçek para/üretim yazımı, kişisel veri/secret yayımı yoktur. Ücretli yazılım, servis, abonelik veya ücretli deneme önerme/kullanma.
- OWASP sertifikası veya koşulmamış test için PASS iddia etme. Kodda güvenlik kontrolü görmek tek başına davranış kanıtı değildir.

## 2. Resmî ve sabit normatif kaynak

- Proje: https://asvs.owasp.org/
- Tag: https://github.com/OWASP/ASVS/tree/v5.0.0_release
- JSON: https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0_release/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.json
- Test yöntemleri: https://owasp.org/www-project-web-security-testing-guide/ ve https://cheatsheetseries.owasp.org/

İndirilen kaynağın sürümünü, SHA-256 hash'ini, tarihini, erişim adresini kaydet. Normatif gereksinim metnini resmî JSON'dan aynen al; ezberden uydurma. Version=5.0.0, 17 bölüm, 345 benzersiz gereksinim; tekil L1=70, L2=183, L3=92, kümülatif L1=70, L2=253, L3=345. Uyuşmazlık SOURCE_BLOCKED. Kimlik: v5.0.0-1.1.1. L1/L2/L3 risk şiddeti değildir. Seviye belirtilmediyse L2'yi yalnız açık çalışma varsayımı olarak öner.

## 3. İş akışı

1. Yetkili hedefi, ortamı, uygulama/sürüm/HEAD/base SHA'yı, test aktörlerini, Organization ve Store sınırlarını, API/UI/iş akışını, veriyi, kullanılabilecek araçları, hedef ASVS seviyesini ve test yetkisini belirle. Gizli bilgileri raporlama.
2. Veri akışını gerçek koda göre izle: kimlik → oturum → kaynak/eylem yetkisi → istek → workflow/DB → queue/cache/log → cevap. Medusa/Mercur'de kurulu ve resmî desteklenen kabiliyeti önce incele. Etki alanı dışında tam repo envanteri yapma.
3. Tam denetimde 345 gereksinimin hepsini; PR risk denetiminde ilgili gereksinimleri kimlik, uygulanabilirlik, test yöntemi, kanıt, statü ve eksiklerle eşleştir. N/A için nesnel gerekçe gerekir. Görünmeyen test PASS değildir.
4. Geçerli önceki SHA, gerçek CI, bağımsız inceleme, HTTP/DB/Chrome ve negatif test kanıtlarını değerlendir. Belirleyici en küçük eksik testi yetkili ortamda çalıştır. Salt-okunur denetimde mutasyon yaratma.
5. BOLA/IDOR, roller, tenant, revoke, session, CSRF, XSS, injection, SSRF, dosya, eşzamanlılık/replay, gizli veri/hatayı ilgili yollarda denetle. UI düğmesinin gizli olması sunucu yetkisi kanıtı değildir.
6. Her bulguda saldırgan/aktör, kaynak, önkoşul, dosya/satır/SHA, minimal gizlenmiş HTTP/DB/CI kanıtı, risk, kök neden, küçük güvenli düzeltme, negatif regresyon ve yeniden test kapsamını yaz.
7. Tam raporda kaynak hash'i, hedef seviye, envanter/sayılar, durum dağılımı, uygulanamaz gerekçeleri, bulgular, engeller, kalan yollar; rutin PR raporunda yalnız ilgili maddeler ve kanıt linklerini kullan. Tekrar rapor/issue/CI altyapısı yaratma.

## 4. ASVS 5.0.0 bölüm kataloğu

| Bölüm | Gereksinim | Kapsam / örnek saldırı yüzeyi |
|---|---:|---|
| V1 Encoding and Sanitization | 30 | çıktı kodlama, injection, deserialization, memory |
| V2 Validation and Business Logic | 13 | input validation, iş mantığı, anti-automation |
| V3 Web Frontend Security | 31 | cookie, CSP, origin, CORS, DOM, external resource |
| V4 API and Web Service | 16 | HTTP message, GraphQL, WebSocket |
| V5 File Handling | 13 | upload, content, storage, download |
| V6 Authentication | 47 | password, MFA, recovery, identity provider |
| V7 Session Management | 19 | timeout, revocation, abuse, re-auth |
| V8 Authorization | 13 | operation-level rights, BOLA/IDOR, tenant |
| V9 Self-contained Tokens | 7 | signature/source, token claims |
| V10 OAuth and OIDC | 36 | clients, resource/authorization server, OIDC, consent |
| V11 Cryptography | 24 | encryption, hash, RNG, key handling |
| V12 Secure Communication | 12 | TLS, HTTPS, service-to-service |
| V13 Configuration | 21 | backend config, secrets, disclosure |
| V14 Data Protection | 13 | retention, access, client data |
| V15 Secure Coding and Architecture | 21 | dependency, defensive coding, concurrency |
| V16 Security Logging and Error Handling | 17 | audit, protected logs, errors |
| V17 WebRTC | 12 | TURN, media, signaling |
| **Toplam** | **345** | Her tekil gereksinim resmî JSON'da |

Mevcut olmayan GraphQL/WebRTC/OAuth server gibi bileşenleri belgeyle gerekçelendirerek NOT_APPLICABLE yap. İncelenmemiş bileşen NOT_TESTED; teknik sebeple engellenmiş kontrol BLOCKED. Seçili L seviyesinin üzerindeki maddeler kaynak envanterinde kalır, hedef kapsamdaki PASS paydasına girmez.

## 5. Durumlar ve kanıt standardı

- PASS: tam ilgili gereksinim gerçek ve güncel yeterli kanıtla karşılanıyor.
- FAIL: açık karşı örnek veya başarısız negatif kontrol.
- NOT_APPLICABLE: mimari ve onaylı kapsam bakımından gerekçeli biçimde uygulanmıyor.
- NOT_TESTED: test/inceleme yapılmadı.
- BLOCKED: erişim, ortam, yetki veya gerekli kanıt engeli.
- INCONCLUSIVE: karşıt ya da belirsiz sonuç; tekrar/alternatif inceleme gerekir.
- SOURCE VERIFIED: kaynak incelendi, yalnız başına runtime PASS değildir.

Her madde: requirement_id, level, original_text, chapter, section, actor/resource, applicability + gerekçe, method, revizyon, expected/observed, evidence URL, bulgu, statü, kısıt, reviewer. Orijinal normatif kaynağı değiştirmeden ayrı sakla. SAST/DAST/SCA/CodeQL/CI ve unit testleri tamamlayıcıdır; biri tek başına ASVS uygunluğunu veya gerçek E2E davranışını kanıtlamaz.

## 6. Tam kapsamlı matris için referans Python (yerel ve yetkili ortamda)

Bu kod *yalnızca envanter* üretir, güvenlik testi veya ürün kabulü yapmaz. Salt-okunur görevde çalıştırıp dosya oluşturma. Resmî JSON önceden asvs-5.0.0.json olarak alınmış olmalıdır.

~~~python
import csv, hashlib, json
from collections import Counter
from pathlib import Path
src = Path('asvs-5.0.0.json')
raw = src.read_bytes()
j = json.loads(raw)
assert j['Version'] == '5.0.0'
target_level = 2  # scope-approved L1/L2/L3
assert target_level in (1, 2, 3)
rows, levels = [], Counter()
for ch in j['Requirements']:
    for section in ch['Items']:
        for r in section['Items']:
            lv = int(r['L'])
            levels[lv] += 1
            rows.append(dict(
                requirement_id='v5.0.0-' + r['Shortcode'].removeprefix('V'),
                level='L'+str(lv), chapter=ch['Name'], section=section['Name'],
                original_text=r['Description'], in_target=lv <= target_level,
                applicability='UNDETERMINED', reason='', status='NOT_TESTED',
                actor_asset='', method='', source_sha='', evidence_id='', finding_id='', reviewer=''))
assert len(rows) == len({r['requirement_id'] for r in rows}) == 345
assert levels == Counter({1:70,2:183,3:92})
out = Path('audit/asvs-5.0.0-matrix.csv')
out.parent.mkdir(parents=True,exist_ok=True)
with out.open('w',newline='',encoding='utf-8-sig') as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
print('ASVS JSON SHA-256',hashlib.sha256(raw).hexdigest())
~~~

Güvenilmeyen CSV metni elektronik tabloda formül olarak yorumlanabilir; dışa aktarımı buna karşı güvenli yap. Kaynaktaki normatif değerleri bozma; orijinal JSON'u değişmez referans olarak tut.

## 7. Bulgu şablonu ve karar

ASVS ID/Level; etkilenen aktör/kaynak; kesin HEAD/base ve ortam; ihlal ve risk derecesi; kanıt (kırpılmamış kaynak farkı, maskelenmiş gerçek HTTP/DB, job/run); beklenen ve görülen sonuç; kök neden; en küçük çözüm; pozitif/negatif test; reviewer; yeniden doğrulama ve durum. Yetkisiz/hatalı yolu açıkça belirt. Severity ASVS seviyesiyle karıştırılmaz. Eksik negatif, CI veya bağımsız incelemeye rağmen PASS verme.

DoğruAdres için güncel aktör zincirini doğrudan kanıtla: Person → aktif Organization ve üyelik → eylem izni → Store/Seller ilişkisi → native actor/Store durumu → kaynak. İstemci kimlik beyanı, eski cache/oturum, email eşleşmesi veya UI görünümü yeterli değildir. Ancak uygulama dışı mimari veya ürün politikası uydurma.

## 8. Rapor disiplini

Bulgu ve test bağlantıları mevcut GitHub PR/Issue'da tutulur. Denetçi, yazarın kendisi değilse ve gerçekten ayrı salt-okunur yürütmeyse bağımsız provenance kaydedilebilir. Kod kararlı değilken tekrar tekrar bağımsız denetim çağırma. Sadece süreç/skill değişikliğinde ürün senaryosunu gereksiz tekrar etme; gerçek dosya/CI tetikleme ve kapı uyumunu doğrula. Son raporda kök AGENTS.md kuralına göre yalnız şu üç Türkçe başlığı kullan: **1. Ne çalışıyor? 2. Ne eksik veya riskli? 3. Şimdi ne yapılacak?**
