# Güvenli branch/worktree emekliliği — iki aşamalı prosedür

Bu metin Issue #216, #210 ve #229'u **yerine geçmez**. Otomasyon **yalnız uzaktaki branch meta verisini okur**; hiçbir silme eylemi içermez.

## A — Otomatik, salt-okunur envanter

Standart ücretsiz Actions runner'da haftalık/manual `branch-lifecycle-inventory.yml`, tam ref/SHA, açık PR ve koruma durumunu derler; yalnız GitHub Actions job summary oluşturur. `contents:read` ve `pull-requests:read`; `contents:write`, `delete ref`, `git push`, `gh api -X DELETE`, lokal disk/Docker erişimi yoktur. Dallar yalnız **KEEP**, **REVIEW**, **UNKNOWN** olabilir; otomasyon asla **SAFE DELETE** kararı vermez.

## B — Yerel Agent ile zorunlu özel envanter

Operatörün kendi bilgisayarında erişebildiği tüm Git common-dir'ler için `git worktree list --porcelain -z`, `git worktree prune --dry-run`, `git status --porcelain=v2 --untracked-files=all`, index, ignored, stash, reflog, local-only commit, remote reachability ve annotated tag/bundle/backup doğrulanır. Ayrıca junction/realpath, working directory, açık dosya/süreç/PID, port, Docker bind mount, named volume, GitHub PR/dal/HEAD bağımlılıkları incelenir. Çıktı **gizli yerel kanıt** olarak saklanır; API token/env/database kişisel içerikleri GitHub'a yazılmaz.

* **KEEP:** main, aktif PR/worktree, dirty, untracked/ignored tekil içerik, origin unknown, çalışan servis/DB bağlantısı.
* **ARCHIVE THEN REVIEW:** tekil tarihî commit/kanıt ve güvenli geri alma doğrulanmamış birimler.
* **UNKNOWN:** eksik envanter/veri kaybı ihtimali — sakla.
* **SAFE DELETE CANDIDATE:** yalnızca yazılmamış, aktif süreçle bağlı olmayan, eksiksiz remote-reachable temiz linked worktree; ayrıca yerel hash/backup ve bağımsız ikinci kontrol ile tasdiklenmiş birim.

## C — Tek aday, iki aşamalı uygulama

1. Her işlem için tam canonical path / branch / expected HEAD ve görev sahibi beyanı ile immutable manifest hazırla. `git worktree list` ve Docker bindings'te aday kullanılmamalı. Gizli veri yedeği kaynakta doğrulanmalı ve kurtarma testi yapılmalı.
2. Branch silme için son dakika exact SHA ve API PR/read kanıtı; aktif açık PR veya protected ref otomatik HARD BLOCK. GitHub silme eylemini yalnız başka, açık yetkili yerel operatör; son kontrollere bağlı tekil komutla yapabilir. Bu CI hiçbir silme komutu yayımlamaz, çalıştırmaz, otomatik onaylamaz.
3. Silme sonrasında `git worktree list`, remote refs, disk/DB bağımlılık ve arşiv bütünlüğü tekrar karşılaştırılır. Geri alma başarısızsa dur.
4. **#229 OPEN/P0:** Kirli `D:\DogruAdres`, `D:\DogruAdres-backups`, aktif af1a/m0ssi, kaynak dump, Docker named volume, container, database, belirsiz restore ve tüm local data temizliği **BLOCKED**. Sonlu delete planı bu koşullar kapanmadan genişletilemez.
5. Global `git clean`, `git reset --hard`, `git worktree prune` (dry-run dışında), `docker system prune`, `docker volume prune`, wildcard `Remove-Item`, force push ve toplu uzak branch silme yasak.

## D — Ürün Sahibi / bağımsız denetim sınırı

İş tamamlandı iddiası için her adayın gerçek yerel özel envanteri, yedeği, hash ve restore kanıtı, ayrı icracı PASS, son SHA preflight ve normal işlem raporu gerekli. Sırf GitHub'da merge edilmiş PR veya boş `git status` güvenli silme kanıtı değildir. Dosya ve süreç sahipliği farklı yerel Agent'larda olduğundan otomatik CI kararını doğrudan disk silme iznine dönüştürmeyin.

İş akışı geliştirme PR'si #208'e göre gerçek yazardan bağımsız kaynak review PASS ve ilgili CI görmeden birleştirilemez.
