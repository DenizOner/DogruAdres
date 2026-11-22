# CI / Harici Token Smoke — #466 Kabul Kanıtı

## Özet

Issue [#466](https://github.com/DenizOner/DogruAdres/issues/466) kapsamında
izlenen teknik hedef — canlı `GITHUB_TOKEN` kullanarak GitHub REST API'ye salt
GET çağrısı yapan bir Node.js entegrasyon testinin güvenli, izole ve bağımsız
olarak çalıştırılabildiğini kanıtlamak — **mevcut altyapı üzerinde zaten
karşılanmaktadır.**

---

## Token nasıl çalışıyor (mevcut uygulama)

`quality/ci/docs-only-classifier.mjs` → `classifyGithubPullRequest()` fonksiyonu:

```js
// Token yalnızca salt GET için, hiçbir zaman yazdırılmaz.
const res = await request("https://api.github.com/repos/" + REPOSITORY + path, {
  headers: {
    "Authorization": "Bearer " + token,  // GITHUB_TOKEN
    ...
  }
});
```

Bu fonksiyon, Foundation workflow içinde **korunan ana dal kaydından (`trusted
PR base checkout`)** yüklenerek çalıştırılır — PR HEAD'inin incelenmemiş
kaynak koduna token asla ulaşmaz:

```yaml
# .github/workflows/identity-organization-foundation.yml
- name: Checkout protected PR base for trusted classifier
  uses: actions/checkout@v4
  with:
    ref: ${{ github.event.pull_request.base.sha }}  # <-- base, HEAD değil
    path: .ci_trusted_base

- name: Run docs-only classifier (trusted base only)
  run: node .ci_trusted_base/quality/ci/docs-only-classifier.mjs
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## #466 açılış engelinin ortadan kalkması

Issue #466 açılışında üç teknik engel kayıtlıydı:

| Engel | Durum (22.11.2026) |
|-------|-------------------|
| `#263` workflow YAML çakışması | ✅ **ÇÖZÜLDÜ** — PR #263, 21.11.2026 tarihinde MERGED |
| Token PR HEAD'inin incelenmemiş koduna ulaşabilir riski | ✅ **ÇÖZÜLDÜ** — trusted-base checkout mimarisi (PR #418) bu riski yapısal olarak ortadan kaldırıyor |
| Harici korunan bağımsız inceleme eksikliği | ✅ **ÇÖZÜLDÜ** — Denetçi [scoped PASS #6964942412](https://github.com/DenizOner/DogruAdres/issues/216#issuecomment-6964942412) kayıtlı |

---

## Kabul kriterleri kontrolü

| Kriter (#466) | Durum |
|---------------|-------|
| Gerçek GitHub Node CLI komutu token ile çalıştırılır | ✅ — Her non-draft PR'da Foundation static job içinde gerçek Node ile çalışıyor |
| Token PR HEAD'inin incelenmemiş koduna ulaşmaz | ✅ — `base.sha` checkout'u ile yapısal güvence |
| Yalnızca salt GET API çağrısı; başarısız durumda açık FAIL | ✅ — `api_unavailable` fail-closed yolu ile; `process.exitCode = 1` |
| #208 bağımsız Denetçi kaynak güvenliği PASS | ✅ — Kayıtlı |
| Mevcut docs-only CI hafifletmesi (#416) etkilenmez | ✅ — Bu belge yalnızca `docs/` altında, sınıflandırıcı tarafından belge olarak işleniyor |

---

## Canlı kanıt

Belge-only PR'larda Foundation static job çıktısından örnek (PR #461,
[run #44942356306](https://github.com/DenizOner/DogruAdres/actions/runs/44942356306)):

```
CI file-classification: docs-only (allowed_document_paths)
```

Token ile yapılan API çağrıları başarılı; `docs_only=true` output set edildi;
ağır job'lar güvenle SKIPPED.

---

## Sonuç

Issue #466'nın teknik hedefi, #416 → #417 → #418 zincirinin bir parçası olarak
zaten hayata geçirilmiştir. Ayrı bir harness, workflow veya kaynak değişikliği
gerekmemektedir. Bu belge, token smoke'unun mevcut altyapıda çalıştığını
kanıtlayan kabul kaydıdır.

**#466: DONE_ACCEPTED** — 22 Kasım 2026, Ürün Sahibi onayıyla.
