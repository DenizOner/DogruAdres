/**
 * Issue #220 — Medusa 2.21.2 CLI db:migrate discovery against a newly created
 * CI-only database. No migrations or schema changes touch protected M0 data.
 * Runs once; existing MikroORM ledger tests cover late-add and replay.
 */
import assert from "node:assert/strict"
import { verifyB22OwnedSellerConstraints } from "./b22-ownership.pg16.test"
import { createHash, randomBytes } from "node:crypto"
import { Migration20261106090000 } from "../../src/modules/dogruadres-access/migrations/Migration20261106090000"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const adminUrl=new URL(process.env.PG_MFA_TEST_URL??"postgres://invalid/invalid")
if(process.env.CI!=="true" ||
  process.env.PG_MFA_TEST_SENTINEL!=="mfa-pg16-disposable-ci-v1" ||
  adminUrl.protocol!=="postgres:" || adminUrl.hostname!=="127.0.0.1" ||
  adminUrl.port!=="5432" || adminUrl.username!=="mfa_test" ||
  adminUrl.pathname!=="/mfa_ci_ephemeral" ||
  adminUrl.password!=="ci-disposable-only-not-a-real-secret")
  throw Error("REFUSED: Medusa CLI test requires its exact disposable PG16 CI server")
const SQL=(globalThis as any).Bun?.SQL
if(typeof SQL!=="function")throw Error("Bun PostgreSQL driver unavailable")

const scope = (process.env.PG_MFA_TEST_SCOPE ||
  process.argv.slice(2).find(arg => arg.startsWith("--scope="))?.split("=")[1] ||
  "all").toLowerCase()
if (!["all", "mfa", "verification", "b22-ui", "b02", "b04", "b04-ui", "b05-ui", "b06-ui", "b07-ui", "b08-ui"].includes(scope))
  throw Error(`REFUSED: invalid PG_MFA_TEST_SCOPE: "${scope}". Allowed: all, mfa, verification, b22-ui, b02, b04, b04-ui, b05-ui, b06-ui, b07-ui, b08-ui`)
if (scope === "b04-ui" && (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" || process.env.B04_UI_DISPATCH_SCOPE !== "b04-ui"))
  throw Error("REFUSED: B04-UI requires explicit workflow_dispatch scope=b04-ui")
if (scope === "b05-ui" && (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" || process.env.B05_UI_DISPATCH_SCOPE !== "b05-ui"))
  throw Error("REFUSED: B05-UI requires explicit workflow_dispatch scope=b05-ui")
if (scope === "b06-ui" && (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" || process.env.B06_UI_DISPATCH_SCOPE !== "b06-ui"))
  throw Error("REFUSED: B06-UI requires explicit workflow_dispatch scope=b06-ui")
if (scope === "b07-ui" && (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" || process.env.B07_UI_DISPATCH_SCOPE !== "b07-ui"))
  throw Error("REFUSED: B07-UI requires explicit workflow_dispatch scope=b07-ui")
if (scope === "b08-ui" && (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" || process.env.B08_UI_DISPATCH_SCOPE !== "b08-ui"))
  throw Error("REFUSED: B08-UI requires explicit workflow_dispatch scope=b08-ui")

if (scope === "b22-ui" && (process.env.GITHUB_EVENT_NAME !== "pull_request" ||
    process.env.B22_UI_AUTO_SCOPE !== "b22-ui"))
  throw Error("REFUSED: task-owned B22 UI only from approved PR workflow")

const admin=new SQL(adminUrl.toString())
const dbName="mfa_cli_ci_"+randomBytes(8).toString("hex")
const dbUrl=new URL(adminUrl)
dbUrl.pathname="/"+dbName
const secrets=[0,1,2].map(()=>randomBytes(48).toString("hex"))
// Native medusa exec initializes core defaults requiring its built-in link tables.
// Execute only non-destructive link sync in this fresh, random task DB.
const flags=["db:migrate","--execute-safe-links","--skip-scripts","--skip-search"]
const sanitized=(value:string)=>value
  .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi,"postgres://[redacted]")
  .replaceAll(adminUrl.password,"[redacted]")
  .slice(-2500)
let created=false
async function run(){
  try{
    const server=(await admin.unsafe("select current_database() as db, current_setting('server_version_num') as ver"))[0]
    assert.equal(server.db,"mfa_ci_ephemeral")
    assert.match(server.ver,/^16\d{4}$/)
    assert.equal((await admin.unsafe("select count(*)::int as n from pg_database where datname=$1",[dbName]))[0].n,0)
    // A random name is used once, and we refuse any pre-existing collision.
    await admin.unsafe('create database "'+dbName+'"')
    created=true
    const env:NodeJS.ProcessEnv={
      ...process.env,
      DATABASE_URL:dbUrl.toString(),
      NODE_ENV:"test",
      REDIS_URL:"redis://127.0.0.1:1",
      STORE_CORS:"http://127.0.0.1:19040",
      ADMIN_CORS:"http://127.0.0.1:19040",
      VENDOR_CORS:"http://127.0.0.1:19040",
      AUTH_CORS:"http://127.0.0.1:19040",
      FILE_BACKEND_URL:"http://127.0.0.1:19040/static",
      JWT_SECRET:secrets[0],
      COOKIE_SECRET:secrets[1],
      DOGRUADRES_INVITATION_SECRET:secrets[2],
      DOGRUADRES_IDENTITY_ENABLED:"false",
      DOGRUADRES_MFA_RUNTIME_ENABLED:"false",
      DOGRUADRES_MFA_ENROLLMENT_ENABLED:"false",
      DOGRUADRES_MFA_SETTINGS_ENABLED:"false",
      ...(scope==="b22-ui"?{DOGRUADRES_B22_PG_LOCK_TEST:"true"}:{}),
    }
    const result=spawnSync(process.execPath,["run","medusa",...flags],{
      cwd:process.cwd(),env,encoding:"utf8",timeout:180000,maxBuffer:2*1024*1024,
    })
    if(result.error || result.status!==0){
      const cause=String(result.error??("exit "+result.status))
      throw Error("Medusa CLI migration not accepted: "+cause+"; "+sanitized(String(result.stderr??"")+"\n"+String(result.stdout??"")))
    }
    // Independent DB observation, not CLI output matching.
    const target=new SQL(dbUrl.toString())
    try{
      const rows=await target.unsafe("select to_regclass('da_audit_event') as audit,to_regclass('da_audit_outbox') as outbox,to_regclass('da_organization_membership') as membership,to_regclass('da_organization_seller_ownership') as legal_ownership")
      assert.ok(rows[0].audit,"Medusa CLI did not discover Foundation audit migration")
      assert.ok(rows[0].outbox,"Medusa CLI did not discover canonical outbox migration")
      assert.ok(rows[0].membership,"Medusa CLI did not discover Foundation membership migration")
      assert.ok(rows[0].legal_ownership,"Medusa CLI did not discover B22 legal ownership migration")
      if(scope==="b22-ui"){
        const locks=await target.unsafe("select to_regclass('public.locking') as table_name")
        assert.ok(locks[0].table_name,"Missing official PostgreSQL locking provider migration in disposable B22 CI database")
        // Mercur 2.4.1 added a Seller migration with the same bare name as
        // our historical B22 Buyer price-group migration. A green db:migrate
        // exit cannot prove BOTH tables were migrated: inspect the real DB
        // before starting Chrome and preserve the old migration ledger.
        const compatibility=await target.unsafe(`select
          to_regclass('public.da_store_buyer_price_group') as buyer_group,
          exists(select 1 from information_schema.columns
            where table_schema='public' and table_name='member_invite'
              and column_name='token_hash') as invite_hash,
          exists(select 1 from information_schema.columns
            where table_schema='public' and table_name='member_invite'
              and column_name='token') as plaintext_invite`)
        assert.ok(compatibility[0].buyer_group,
          "B22 Buyer price group was skipped by a duplicate upstream migration name")
        assert.equal(compatibility[0].invite_hash,true,
          "Mercur 2.4.1 invite-token hash migration was skipped or not applied")
        assert.equal(compatibility[0].plaintext_invite,false,
          "Plaintext invite-token column survived the Mercur 2.4.1 upgrade")
        const repair=await target.unsafe(`select count(*)::int as n from mikro_orm_migrations
          where name='Migration20261106090000'`)
        assert.equal(Number(repair[0].n),1,
          "Additive B22 migration collision repair was not recorded")
        process.stdout.write("PASS B22 PG16 Mercur 2.4.1 migration collision guard: native hashed invites + audited price group, unique repair ledger\n")
      }
      if(scope==="b22-ui"){
        // Exercise the exact new migration SQL against a PostgreSQL TEMP table
        // shaped like Mercur 2.4.0, not any real invitation or protected data.
        // The same migration was already run by CLI above on the fresh native
        // 2.4.1 schema. This additionally covers the legacy reverse collision.
        const statements:string[]=[]
        const migration=Object.create(Migration20261106090000.prototype)
        migration.addSql=(statement:string)=>{statements.push(statement)}
        await migration.up()
        assert.equal(statements.length,4)
        await target.begin(async(tx:any)=>{
          await tx.unsafe(`create temporary table member_invite (
            id text primary key, token text not null, deleted_at timestamptz
          ) on commit drop`)
          await tx.unsafe(`create index "IDX_member_invite_token"
            on member_invite(token) where deleted_at is null`)
          await tx.unsafe("set local search_path to pg_temp, public")
          const active=await tx.unsafe("select current_schema() as schema")
          assert.match(String(active[0].schema),/^pg_temp_[0-9]+$/,
            "Legacy fixture must resolve only a temporary PostgreSQL schema")
          const raw="synthetic-old-invite-"+randomBytes(24).toString("hex")
          const expected=createHash("sha256").update(raw,"utf8").digest("hex")
          await tx.unsafe("insert into member_invite(id,token) values($1,$2)",
            ["synthetic",raw])
          await tx.unsafe(statements[0])
          const converted=await tx.unsafe(`select token_hash from member_invite
            where id='synthetic'`)
          assert.equal(converted.length,1)
          assert.equal(converted[0].token_hash,expected,
            "Legacy plaintext token must become native Mercur SHA-256")
          const columns=await tx.unsafe(`select column_name from information_schema.columns
            where table_schema=current_schema() and table_name='member_invite'`)
          assert.ok(columns.some((r:any)=>r.column_name==="token_hash"))
          assert.ok(!columns.some((r:any)=>r.column_name==="token"))
          const indexes=await tx.unsafe(`select indexname from pg_indexes
            where schemaname=current_schema() and tablename='member_invite'`)
          assert.ok(indexes.some((r:any)=>r.indexname==="IDX_member_invite_token_hash"))
          assert.ok(!indexes.some((r:any)=>r.indexname==="IDX_member_invite_token"))
          await tx.unsafe(statements[0])
          const repeated=await tx.unsafe(`select token_hash from member_invite
            where id='synthetic'`)
          assert.equal(repeated[0].token_hash,expected,
            "A repeated repair must not double-hash the invitation")
        })
        process.stdout.write("PASS B22 PG16 Mercur 2.4.0 legacy token hash repair: temp-only SHA-256 conversion, old index replaced, no double-hash\\n")
      }
      const ledger=await target.unsafe("select count(*)::int as n from mikro_orm_migrations where name like 'Migration2026102%'")
      assert.ok(Number(ledger[0].n)>=1,"No Foundation migration history from Medusa CLI")
      if(scope==="b22-ui"){
        // SQL-only acceptance before the long, unrelated native Chrome flow:
        // LIKE copies the ACTUAL migrated CHECK and defaults, but NOT foreign
        // keys. The task-owned scratch table never contains a real Person.
        const probe="b22_activity_constraint_probe_"+randomBytes(6).toString("hex")
        const source=await target.unsafe(`select conname from pg_constraint
          where conrelid='da_organization_application'::regclass
            and conname='da_org_application_activities_check'`)
        assert.equal(source.length,1,"B22 activity CHECK missing from native migration")
        await target.unsafe(`create table "${probe}"
          (like da_organization_application including defaults including constraints)`)
        try{
          await target.unsafe(`insert into "${probe}"
            (id,applicant_person_id,business_kind,legal_name,landline_phone)
            values('daorgapp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              'daprs_b22synthetic','individual_business','B22 sentetik eski taslak',
              '+90 212 555 00 00')`)
          const old=await target.unsafe(`select declared_activities::text as activities,
            primary_activity,status,version from "${probe}"`)
          assert.equal(old.length,1)
          assert.equal(old[0].activities,"[]")
          assert.equal(old[0].primary_activity,null)
          assert.equal(old[0].status,"draft")
          assert.equal(Number(old[0].version),1)
          await target.unsafe(`update "${probe}"
            set declared_activities='["service_repair","insurance_claims"]'::jsonb,
                primary_activity='insurance_claims'`)
          const copied=await target.unsafe(`select conname from pg_constraint
            where conrelid='"${probe}"'::regclass
              and conname='da_org_application_activities_check'`)
          assert.equal(copied.length,1,"Activity CHECK not copied to isolated PG16 probe")
          let duplicateRejected=false
          let duplicateSqlState="not-exposed"
          try{
            await target.unsafe(`update "${probe}"
              set declared_activities='["service_repair","service_repair"]'::jsonb,
                  primary_activity='service_repair'`)
          }catch(error:any){
            duplicateRejected=true
            if(typeof error?.errno==="string")duplicateSqlState=error.errno
          }
          const after=await target.unsafe(`select declared_activities::text as activities,
            primary_activity,status,version from "${probe}"`)
          process.stdout.write("B22 PG16 duplicate CHECK probe: rejected="+duplicateRejected+
            ", sqlstate="+duplicateSqlState+
            ", unchanged="+(JSON.stringify(JSON.parse(String(after[0]?.activities)))===
              JSON.stringify(["service_repair","insurance_claims"]))+"\n")
          assert.ok(duplicateRejected,"Migrated PG16 CHECK accepted duplicate activity codes")
          assert.equal(duplicateSqlState,"23514","Unexpected PostgreSQL CHECK SQLSTATE")
          assert.equal(after.length,1)
          assert.deepEqual(JSON.parse(String(after[0].activities)),
            ["service_repair","insurance_claims"],
            "Failed duplicate update must preserve existing valid activities")
          assert.equal(after[0].primary_activity,"insurance_claims")
          assert.equal(after[0].status,"draft")
          assert.equal(Number(after[0].version),1)
          process.stdout.write("PASS B22 PG16 migrated CHECK: valid multi-activity, duplicate 23514 and unchanged row; legacy-shaped []/NULL default on isolated copy\n")
        }finally{
          await target.unsafe(`drop table if exists "${probe}"`)
        }
      }
      process.stdout.write("PASS Medusa 2.21.2 CLI db:migrate: Foundation discovered and ledger recorded on disposable PG16\n")
      // Execute native AuthIdentity TOTP/recovery with this exact disposable
      // database. Only this child enables the local Auth module MFA options;
      // it cannot enable Foundation's persistent rollout latch.
      const nativeEnv:NodeJS.ProcessEnv={
        ...env,
        PG_MFA_NATIVE_TEST_DATABASE:dbName,
        DOGRUADRES_IDENTITY_ENABLED:"true",
        DOGRUADRES_MFA_ENCRYPTION_KEY:randomBytes(48).toString("hex"),
        DOGRUADRES_PUBLIC_ORIGIN:"http://127.0.0.1:19041",
        DOGRUADRES_PRIVATE_API:"http://127.0.0.1:19042",
        DOGRUADRES_FRONTDOOR_HOST:"127.0.0.1",
        DOGRUADRES_FRONTDOOR_PORT:"19041",
      }
      // The harness readback session is a genuine foreign consumer to the child.
      await target.close()

      if(scope==="b22-ui"){
        // R1 requires two primary identities, zero factors and an exclusive
        // clean latch. Another disposable child is mandatory because the
        // verification child has pre-existing SMTP/negative test fixtures.
        const suffix=randomBytes(8).toString("hex")
        const task:NodeJS.ProcessEnv={...nativeEnv,REDIS_URL:undefined,
          ...(process.env.B22_ADMIN_SMTP==="true"?{
            DOGRUADRES_SMTP_ENCRYPTION_KEY:randomBytes(32).toString("hex"),
            B22_SMTP_CANARY:"b22-smtp-"+randomBytes(24).toString("hex"),
            SMTP_ENABLED:"false",SMTP_HOST:"smtp.b22.example.invalid",
            SMTP_FROM_EMAIL:"b22@example.invalid",SMTP_PASSWORD:undefined,
          }:{}),
          B22_UI_EMAIL_A:"b22-a-"+suffix+"@example.invalid",
          B22_UI_EMAIL_B:"b22-b-"+suffix+"@example.invalid",
          B22_UI_PASSWORD_A:randomBytes(32).toString("base64url"),
          B22_UI_PASSWORD_B:randomBytes(32).toString("base64url"),
          B06_EVIDENCE_DIR:join(process.env.RUNNER_TEMP??"/not-authorized",
            process.env.B22_ADMIN_SMTP==="true"?"b22-admin-smtp-evidence":"b22-ui-r1-evidence")
        }
        // The runner only publishes fixed redacted proof lines, never
        // arbitrary child output. Require these real negative acceptance
        // results so a missing scenario cannot masquerade as a PASS.
        const ownerPauseConcurrentMarker="PASS B22 real Owner pause concurrency/authorization: two HTTPS requests 200+409, one durable pause; revoked Owner and stale strong session denied without writes; resume restores unchanged Seller"
        const ownerClosingIndexMarker="PASS B22 real audit relay: Owner 30-day closing/withdrawal delivered to Index, private countdown redacted, durable ACK and lost-ACK retry deduplicated"
        const ownerPauseIndexMarker="PASS B22 real audit relay: Owner temporary pause/resume events delivered to Index with redacted envelopes, durable ACKs and single row on retry"
        const exceptionalStoreTransferMarker="PASS B22 Chrome/HTTPS/PG16: exceptional suspended Seller name-right assigned to approved separate Store; Owner new name and Staff reopen same ID, native/Order untouched before rename, foreign/CSRF/replay denied, audit/outbox and recipient reservation"
        const exceptionalRecipientMarker="PASS B22 Chrome/HTTPS/PG16: recipient B native name and URL adopted after source A vacates, historical 30-day hold retained, unrelated Store C HTTP409 before/after, Staff approval and audit/outbox durable"
        const postHoldRecipientMarker="PASS B22 Chrome/HTTPS/PG16: transferred old name remains reserved for B after source hold day 30, C HTTPS409 without request/audit, original timestamp restored, B native adoption succeeds"
        const independentStaffRaceMarker="PASS B22 Chrome/HTTPS/PG16: two independent strong Staff Persons race same first Store name-right transfer on observed PG advisory lock; HTTP201+409, one transfer/audit/outbox, replay200, both native Seller IDs unchanged"
        const platformCrossSessionMarker="PASS B22 Chrome/HTTPS/PG16: Owner A real private closing GET, same-page logout clears old reason and synthetic email-result DOM; Person B real password+MFA login sees no private text and Gamma GET403; Owner A fresh login re-reads authorized reason"
        const dualRoleLockMarker="PASS B22 Chrome/HTTPS/PG16: same strong Person dual Staff/Owner, Owner Seller-lock wait before Staff session wait; HTTP403+409, no deadlock/503, closing/audit/outbox unchanged"
        const legacyPlatformClosingMarker="PASS B22 Chrome/HTTPS/PG16: legacy approved Store association with native Seller and strong Staff; revoked and foreign Origin HTTP403; single closing/audit/outbox and Owner notice durable; original application proof restored"
        const platformClosingAppealMarker="PASS B22 Chrome/HTTPS/PG16: independent strong platform closing Staff stops sales, protected Owner sees private reason and submits real UI appeal; wrong Staff/Owner/CSRF/replay rejected, audit/outbox and Owner receipt durable, canonical 10+20 clock started on authenticated Owner link before first appeal; external mailbox delivery unverified and no finalization/native Order changes; Beta Buyer HTTPS catalogue Gamma visible-to-hidden, read-only Cart mapping unchanged, final L false, no OrderGroup/Order/payment; closing and appeal notification texts verified; two separate protected Owner Person sessions show actor-neutral appeal receipts in HTTPS/Chrome, no private reason; platform Staff Chrome verified Owner email 1, native ambiguous mapping 0/restored 1/revoked proof 0, 1-to-2 Owners during scheduled receipt reconciliation, no external mailbox delivery claim; one immutable clock, foreign denied"
        const platformStaffReviewMarker="PASS B22 Chrome/HTTPS/PG16: independent third Person strong Staff review decision, original Staff self-review denied, private Owner reason/notice, immutable clock and sales block; repeat idempotent, first-stage parallel single decision, revoked grant denied"
        const platformFinalReviewMarker="PASS B22 Chrome/HTTPS/PG16: synthetic T0+11d second-stage Owner request, real protected Owner/foreign Staff/CSRF/replay, one durable audit/outbox and private notice; Store stays closed, original 10+20 clock unchanged; stage time fixture is synthetic, real Owner Chrome form submitted and confirmed"
        const platformClosingEmailLinkMarker="PASS B22 Chrome/HTTPS/PG16: synthetic hashed email link strong Owner POST, foreign/forged CSRF/scanner GET denied, 10+20 server clock starts once, no finalizer or sales reopening"
        const platformPreflightBoundaryMarker="PASS B22 Chrome/HTTPS/PG16: 720-hour Staff preflight false/true, pending first appeal and SMTP admin exception; permanent finalizer denied"
        const completedSourceOrderMarker="PASS B22 Chrome/HTTPS/PG16: completed native source OrderGroup/Order IDs, Order-Cart FK, source Seller/Offer and immutable Buyer attribution unchanged across A→B transfer, A same-ID recovery and B name adoption; zero payment"
        const historicalCartMarker="PASS B22 Chrome/HTTPS/PG16: pre-existing native two-Seller Cart identity, Customer, line/Offer/Seller links and immutable Buyer attribution unchanged across A→B name right assignment, A same-ID recovery and B native adoption; historical Orders NOT TESTED"
        const ownerClosingNegativeMarker="PASS B22 real closing security: concurrent HTTP 200+409 one commit; revoked Owner/stale session HTTP403 no writes; expired 30-day withdraw HTTP409 no writes; both active Owners read private notices, two receipts each; native Seller unchanged"
        const ownerClosingMarker="PASS B22 real Owner 30-day closing intent/withdraw: Chrome/HTTPS/PG16, exact server deadline, protected Owner notices, whole-Cart L deny then restore, CSRF/foreign/replay denied; native Seller unchanged; irreversible finalization disabled"
        const ownerPauseAcceptanceMarker="PASS B22 real Owner temporary pause/resume: Chrome/HTTPS/PG16 UI, same native Seller ID/name and existing Cart, two audit/outbox, CSRF/foreign/replay/platform-suspend denied, two-Store final L blocked then restored; checkout remains closed"
        const storeDraftNegativeMarkers=[
          "PASS B22 Chrome/PG16: two distinct protected Owners same draft/application ID; second HTTPS reserve waits application row before draft; first native claim finish draft NOWAIT free; loser403, creating/submitting and Seller/audit unchanged",
          "PASS B22 Chrome/HTTPS/PG16: verified Owner initial Store applications GET simulated 503 and malformed response each recover by refresh; actual authorized HTTPS GET, no Store draft/Seller/audit writes",
          "PASS B22 Chrome/PG16: Store draft and Owner closing GET wait Person-first, epoch NOWAIT free, HTTPS200 each, no draft or closing writes",
          "PASS B22 Chrome/PG16: concurrent Store draft GET and Person mobile POST both wait Person-first, epoch NOWAIT free, HTTPS200 each, one private audit/outbox, draft unchanged",
          "PASS B22 PG16/Chrome: global normalized Store name claim; case/NFKC/native legacy conflicts409, no second application or Seller",
          "PASS B22 PG16/Chrome: invisible Store names HTTP400; zero application, native Seller, audit/outbox effects",
          "PASS B22 Chrome/PG16: separate legal Organization Owner cannot reuse Alpha normalized Store name; Gamma original Seller retained",
          "PASS B22 Chrome/PG16: Owner Store name+URL change request with explicit risk acknowledgement, one private pending record and audit/outbox; foreign/CSRF/invalid/duplicate denied; native Seller unchanged",
          "PASS B22 Chrome: #286 private Store rename history denied for terminated Seller 403, approved suspended Owner 200, restored open Owner 200, foreign Owner 403",
          "PASS B22 Chrome: #289 Owner versus Staff rename same PG16 lock, 2 observed advisory waiters, Seller NOWAIT free, HTTP200 Staff and Owner400/409, zero losing writes",
          "PASS B22 Chrome/PG16: authorized Store staff sees private pending name-change, rejects with reason using real UI; Owner reads final rejection; foreign Owner/CSRF/replay denied, single audit/outbox and native Seller unchanged",
          "PASS B22 Chrome/HTTPS: temporary Store list 503 hides private rename panel, same Owner refresh restores request form from fresh real authorized GET",
          "PASS B22 Chrome/PG16: simultaneous distinct-id Store rename requests 201+409, one pending PG row and audit/outbox, loser zero effects and native Seller unchanged",
          "PASS B22 Chrome/HTTPS/PG16: Staff approves native Seller name+handle via real UI; same Store identity, Owner private readback, original name+URL held 30 days, Owner/CSRF/repeat/conflicting reject denied, one durable audit/outbox",
          "PASS B22 Chrome/PG16: requesting Owner withdraws pending Store rename via real UI; foreign/CSRF/forgery/replay and Staff approval denied, native Seller unchanged, one audit/outbox",
          "PASS B22 Chrome/HTTPS/PG16: Staff safely unsuspends same approved Store via real UI; current name/handle/ID preserved, paused new applications allowed, forged/CSRF/Owner/name-conflict/replay denied, one durable audit/outbox and Owner readback",
          "PASS B22 Chrome/HTTPS/PG16: post-native reactivation audit failure preserves durable claim/outbox, Store open and HTTP503; real Staff UI reconciles with no second native opening, Owner notice persists once, replay denied",
          "PASS B22 Chrome/HTTPS/PG16: pre-native crash retains suspended Seller and committed claim/outbox; real Staff UI releases intent with one terminal audit, Owner/CSRF/forgery/replay denied, no blind native retry; new authorized attempt succeeds",
          "PASS B22 Chrome/HTTPS/PG16: suspended Store Owner requests new name, Staff approves unchanged Store ID and suspended status with one audit/outbox, explicit later Staff unsuspend succeeds; Owner/CSRF/forged/replay denied",
          "PASS B22 isolated Next.js/native Mercur HTTP/PG16: ingress 401 preserved; old handle 404 no redirect; new handle 200 same Seller ID",
          "PASS B22 Chrome/PG16: simultaneous Alpha/Gamma normalized Store name 201+409; one native Seller, one durable application, Origin/audit/outbox, loser zero side effects",
          "PASS B22 Chrome/PG16: before-submit stale draft409/zero Seller; concurrent distinct application keys 201+409, one native pending Seller and one durable Origin/audit/outbox",
          "PASS B22 Chrome/PG16: genuine Owner's expired strong proof and temporarily disabled company policy deny same draft with 403, zero native Seller and unchanged private draft",
          "PASS B22 Chrome/PG16: injected native Seller finalization interruption 503, durable creating/submitting, same/different retry409, no duplicate Seller, fault trigger removed",
          "PASS B22 Chrome/PG16: protected platform Staff reasoned pending Seller rejection during company pause, native terminated without approval, private Owner status and redacted notice, one audit/outbox, Owner/CSRF/short reason/replay denied",
          // P1 #323: fixed, redacted evidence text from the exact real Owner
          // Chrome/HTTPS+PG16 revocation test; both log and mandatory assert.
          "PASS B22 real PG16: 51 unrelated audited Store associations do not hide bounded historical Seller proof; revoked candidate denied; global guard retained and fixture rolled back",
          "PASS B22 Chrome/HTTPS/PG16: revoked Store ownership preserves historical application but hides live Seller status and private rejection reason in Owner HTTP and UI; no new audit",
          "PASS B22 Chrome/HTTPS/PG16: two authorized Stores; overlapping refresh dedup, second target and consent preserved, removed target resets name/URL/risk across repeat refresh; manual Store selection restores blank safe form, zero writes",
        ] as const
        function invoke(file:string,env:NodeJS.ProcessEnv,direct=false){
          const child=spawnSync(process.execPath,direct?[file]:["run","medusa","exec",file],{
            // The complete B22 Chrome suite reached the later tax-document
            // journey but the 300s child limit ended the last PR run. Keep
            // every required assertion; allow the same isolated child 8 min.
            cwd:process.cwd(),env,encoding:"utf8",timeout:file.includes('b22-audit-worker.exec.ts')?360000:
              file.includes('b22-store-ui.exec.ts')?480000:210000,
            maxBuffer:3*1024*1024})
          if(task.B22_SMTP_CANARY)assert.ok(!String(child.stdout??"").concat(String(child.stderr??"")).includes(task.B22_SMTP_CANARY),"SMTP canary leaked to child logs")
          const valid=String(child.stdout??"").split("\n")
            .filter(x=>/^PASS B22 Chrome:|^PASS B22 real PG16: post-primary-proof forced audit failure|^PASS B22 native organization\.read role policy:|^PASS B22 Owner role policy:|^PASS B22 protected Owner mutation negatives:|^PASS B22 protected Owner management:|^PASS B22 explicit permission:|^PASS B22 pre-revocation control:|^PASS B22 real Mercur validate:|^PASS B22 native payment simulation:|^PASS B22 native completed Cart retry:|^PASS B22 native payment denial:|^PASS B22 post-L cutoff:|^PASS B22 concurrent native Cart checkout:|^PASS B22 PostgreSQL expired lock behavior:|^OBSERVED B22 abrupt Medusa process exit:|^PASS B22 official Redis provider:|^PASS B22 native Cart TTL units:|^PASS B22 native Mercur product workflow:|^PASS B22 Mercur 2\.4 Store regions:|^PASS B22 native Store BuyerOrg group PriceList capability:|^PASS B22 BuyerOrg native private TRY reference:|^PASS B22 Buyer catalogue:|^PASS B22 native TRY Offer list price:|^PASS B22 audited Store price group:|^PASS B22 Store price group F-01\/F-02:|^PASS B22 suspended Seller Organization:|^PASS B22 audit worker:|^PASS B22 real Owner 30-day closing intent\/withdraw:|^PASS B22 real audit relay:|^PASS B22 audit real ACK:|^PASS B22 audit natural lease:|^PASS B22 audit native scheduler and crash restart:|^PASS B22 native reconciliation confirmed:|^PASS B22 CR-03 real Chrome\/HTTP\/PG16:|^PASS B22 Chrome\/HTTP\/PG16: 10 MiB tax cert upload,|^PASS B22 Chrome\/HTTP\/PG16: staff unscanned document denied,|^PASS B22 Chrome\/HTTP\/PG16: corrected tax certificate|^PASS B22 Chrome\/HTTP\/PG16: PNG drag drop requires visible upload,|^PASS B22 Chrome\/HTTP\/PG16: reviewer 101 submitted queue pages,|^PASS B22 Chrome\/HTTP\/PG16: individual business PNG two retained versions,|^NOT TESTED B22 Chrome:|^PASS B22 test fixture:|^PASS B06 disposable native activation/.test(x) ||
              x==="PASS B22 Chrome/HTTP/PG16: native Mercur Seller approval holds company policy SHARE lock, concurrent platform disable waits then commits, one audit/outbox and current Owner notice; post-disable Owner application403; existing Store open; policy reopened" ||
              x==="PASS B22 Chrome/HTTP/PG16: native Mercur Seller creation holds company policy SHARE lock, concurrent platform disable waits then commits, single audit/outbox and two Owner notices; later creation403; pending Seller preserved on reopen" ||
              x==="PASS B22 Chrome/HTTP/PG16: platform company Store application pause/reopen, private Owner 403, CSRF 403, native pending on hold, old Store open, audit/outbox and no auto-approval" ||
              x==="PASS B22 Owner member-permission policy: protected Owner grant/list 200 despite legacy setting; revoke 200 with audit/outbox" ||
              x==="PASS B22 Chrome/HTTP/PG16: scanned PNG preview loaded and reviewer approval UI gated" ||
              x==="PASS B22 Chrome/HTTP/PG16: full two-page PDF preview, approval disabled until final page scrolled" ||
              x==="PASS B22 Chrome/HTTP/PG16: staff starts in_review, applicant sees stage and withdraws; forged and replayed decisions denied, audit preserved" ||
              x==="PASS B22 Chrome/HTTP/PG16: changed signature triggers genuine re-scan; unchanged reuse; damaged PNG regenerated" ||
              x==="PASS B22 PG16: duplicate activity direct SQL 23514; original private draft unchanged" ||
              x==="PASS B22 PG16/Chrome: legacy-shaped empty activity draft []/NULL, private GET and visible edit persist same id/person to v2; no Organization/Owner" ||
              storeDraftNegativeMarkers.includes(x as (typeof storeDraftNegativeMarkers)[number]) ||
              x===ownerPauseAcceptanceMarker || x===ownerPauseConcurrentMarker ||
              x===ownerPauseIndexMarker || x===ownerClosingNegativeMarker ||
              x===exceptionalStoreTransferMarker || x===exceptionalRecipientMarker ||
              x===postHoldRecipientMarker || x===independentStaffRaceMarker ||
              x===historicalCartMarker || x===completedSourceOrderMarker ||
              (x===legacyPlatformClosingMarker || x===dualRoleLockMarker || x===platformCrossSessionMarker ||
               x===platformClosingAppealMarker || x===platformClosingEmailLinkMarker ||
               x===platformFinalReviewMarker || x===platformStaffReviewMarker ||
               x===platformPreflightBoundaryMarker)).join("\n")
          if(child.error||child.status!==0){
            // The long B22 child can legitimately fail at the still-blocked
            // tax-document approval. Do not bury *completed* earlier native
            // Member/Store browser checks in the 2500-char error tail.
            // Output ONLY these hardcoded proof lines, not arbitrary child
            // stdout, HTTP payloads, credentials, DOM or test fixture IDs.
            const scoped=valid.split("\n").filter(x=>[
              "PASS B22 Chrome: protected Owner excluded from individual products.edit; forged grant/revoke HTTP403, PG16 grant/audit unchanged",
              "PASS B22 Chrome: no new Organization Admin assignment; Owner HTTP400, membership/audit unchanged",
              "PASS B22 Chrome: retired company Admin invitation Owner HTTP400; no invitation or audit write",
              "PASS B22 Chrome: native Store member connection unauthorized/foreign/CSRF/forged denied, no SellerMember or audit",
              "PASS B22 Chrome: native Store member connection via Owner UI persisted one SellerMember and one canonical audit; replay unchanged",
              "PASS B22 Chrome: denied native Member/Store UI stays visible without product submit; verified association enables product form",
              "PASS B22 Chrome: revoked products.edit prevents native Store connection via Owner HTTP; SellerMember and canonical audit unchanged",
              "PASS B22 Chrome/HTTP/PG16: corrected tax certificate resubmission required new upload; two versions retained; withdrawn approval denied",
            ].includes(x))
            if(scoped.length)process.stdout.write(scoped.join("\n")+"\n")
            // Diagnostics must survive a long task log without disclosing
            // request bodies, passwords, TOTP or personal records. The prior
            // tail-only error hid both the failing source line and ETIMEDOUT.
            let b22SourceLine="unknown"
            for(const line of String(child.stderr??"").concat("\n",String(child.stdout??"")).split("\n").reverse()){
              if(!line.includes('"level":"error"')||!line.includes('"stack"'))continue
              try{
                const item=JSON.parse(line.slice(line.indexOf("{")))
                const frame=Array.isArray(item.stack)?item.stack.find((f:any)=>
                  typeof f?.fileName==="string"&&f.fileName.endsWith("/b22-store-ui.exec.ts")):null
                if(Number.isSafeInteger(frame?.lineNumber)&&frame.lineNumber>0){
                  b22SourceLine=String(frame.lineNumber);break
                }
              }catch{}
            }
            const childCode=(child.error as NodeJS.ErrnoException|undefined)?.code??"none"
            const nativeStatus="exit="+String(child.status??"null")+
              " signal="+String(child.signal??"none")+
              " child_code="+String(childCode)+" b22_source_line="+b22SourceLine
            throw Error("B22 dedicated task-only child stage failed ["+nativeStatus+"]: "+sanitized(
              String(child.error??"exit "+child.status)+"\n"+String(child.stderr??"")+"\n"+String(child.stdout??"")))
          }
          process.stdout.write(valid+"\n")
          return valid
        }
        const script="./integration-tests/postgres/b22-store-ui.exec.ts"
        assert.ok(invoke(script,{...task,B22_UI_PREPARE:"true"}).includes("PASS B22 test fixture:"))
        assert.ok(invoke("./integration-tests/postgres/b06-activation.pg16.ts",task,true).includes("PASS B06 disposable native activation"))
        const result=invoke(script,{...task,DOGRUADRES_MFA_RUNTIME_ENABLED:"true",
          DOGRUADRES_MFA_SETTINGS_ENABLED:"true",DOGRUADRES_MFA_ENROLLMENT_ENABLED:"true"})
        if(process.env.B22_ADMIN_SMTP==="true"){
          assert.ok(result.includes("PASS B22 Chrome: native Admin SMTP same-origin MFA/grant GET200"))
          return
        }
        assert.ok(result.split("\n").includes(exceptionalStoreTransferMarker),
          "Missing exact Chrome/HTTPS/PG16 exceptional Store name-right assignment and same-ID Owner recovery acceptance evidence")
        assert.ok(result.split("\n").includes(exceptionalRecipientMarker),
          "Missing real HTTPS/PG16 B native adoption, source vacate and C denied acceptance evidence")
        assert.ok(result.split("\n").includes(postHoldRecipientMarker),
          "Missing actual Chrome/PG16 post-day-30 C exclusion by transfer reservation")
        assert.ok(result.split("\n").includes(independentStaffRaceMarker),
          "Missing concurrent two-Person Staff HTTPS PG16 first-decision 201/409 and one durable audit/outbox")
        assert.ok(result.split("\n").includes(historicalCartMarker),
          "Missing exact PG16 Cart identity/Offer/Seller/Buyer attribution comparison across A→B transfer")
        assert.ok(result.split("\n").includes(completedSourceOrderMarker),
          "Missing real pre-transfer completed OrderGroup/Order IDs, exact Cart FK, source Seller and Buyer attribution across A→B name transfer")
        assert.ok(result.split("\n").includes(dualRoleLockMarker),
          "Missing real same-Person Staff/Owner lock ordering and denied zero-write outcomes")
        assert.ok(result.split("\n").includes(legacyPlatformClosingMarker),
          "Missing legacy audited Store Origin real Staff Chrome/PG16 and foreign/revoked negative evidence")
        assert.ok(result.split("\n").includes(platformCrossSessionMarker),
          "Missing same-page two native Person logins, private DOM clear and foreign 403")
        assert.ok(result.split("\n").includes(platformClosingAppealMarker),
          "Missing real independent strong Staff and protected Owner platform closing/appeal HTTPS+PG16 proof")
        assert.ok(result.split("\n").includes(platformClosingEmailLinkMarker),
          "Missing real authenticated Owner email-link HTTPS/PG16, foreign/CSRF/scanner GET denials, one 10+20 clock and sales-block proof")
        assert.ok(result.split("\n").includes(platformFinalReviewMarker),
          "Missing day-11 second-stage Owner authenticated HTTPS/PG16 review and negative proof")
        assert.ok(result.split("\n").includes(platformStaffReviewMarker),
          "Missing separate strong Staff decision, independent reviewer and real private Owner outcome")
        assert.ok(result.split("\n").includes(platformPreflightBoundaryMarker),
          "Missing HTTP/PG16 boundary, pending appeals and Staff admin-fallback acceptance proof")
        // Both new B22 historical-reader negatives must be visible as full
        // redacted proof lines. Child success alone is not their evidence.
        for(const marker of [
          "PASS B22 Chrome: historical OrderGroup revoked Buyer cookie HTTP403 generic response, audit/outbox unchanged; isolated session restored and own order HTTP200",
          "PASS B22 Chrome: historical OrderGroup authorized own-Org Customer denies foreign completed OrderGroup HTTP403 with no private fields or audit/outbox writes"
        ])
          assert.ok(result.split("\n").includes(marker),
            "Missing required real Chrome/HTTPS/PG16 historical OrderGroup negative: "+marker)
        assert.ok(result.split("\n").includes(ownerPauseConcurrentMarker),
          "Missing real concurrent Owner mutation and revoked/expired HTTP no-write proof")
        assert.ok(result.split("\n").includes(ownerPauseAcceptanceMarker),
          "Missing real Owner temporary pause/resume Chrome/HTTPS/PG16 acceptance proof")
        assert.ok(result.split("\n").includes(ownerClosingMarker),
          "Missing real Owner 30-day closing, sale gate, withdrawal and security acceptance proof")
        assert.ok(result.split("\n").includes(ownerClosingNegativeMarker),
          "Missing real Owner closing race, revoked Owner, deadline and multi-Owner receipt HTTP/PG16 proof")
        for(const marker of storeDraftNegativeMarkers)
          assert.ok(result.split("\n").includes(marker),
            "Missing mandatory real Chrome/PG16 Store draft negative acceptance proof")
        assert.ok(result.includes("PASS B22 Chrome: primary Customer native MFA Person session and explicit Staff grant changed company policy through HTTPS, CSRF denied, two canonical Customer audit/outboxes and Owner-only notices; foreign audit denied, revoked task 403"),
          "Missing linked Customer Staff Chrome HTTPS and PG16 canonical audit proof")
        assert.ok(result.split("\n").includes(
          "PASS B22 Chrome/HTTP/PG16: native Mercur Seller creation holds company policy SHARE lock, concurrent platform disable waits then commits, single audit/outbox and two Owner notices; later creation403; pending Seller preserved on reopen"),
          "Missing real PostgreSQL company policy vs native Mercur Seller create overlap, canonical audit/outbox, Owner notices and denied subsequent Store evidence")
        assert.ok(result.split("\n").includes(
          "PASS B22 Chrome/HTTP/PG16: native Mercur Seller approval holds company policy SHARE lock, concurrent platform disable waits then commits, one audit/outbox and current Owner notice; post-disable Owner application403; existing Store open; policy reopened"),
          "Missing real PG16 company policy pause vs native Mercur Seller approval lock collision, ordering, audit/outbox and private notice proof")
        assert.ok(result.split("\n").includes("PASS B22 Chrome/HTTPS/PG16: verified Owner initial Store applications GET simulated 503 and malformed response each recover by refresh; actual authorized HTTPS GET, no Store draft/Seller/audit writes"),
          "Missing real Owner Store application first-read 503/malformed retry via Chrome and authorized PG16 readback")
        assert.ok(result.includes("PASS B22 Chrome: Owner Store draft saved, edited, reloaded with version and audit/outbox; stale409, CSRF403, foreign403; zero native Seller applications"),
          "Missing real private Owner Store draft persistence and negative Chrome/PG16 acceptance")
        assert.ok(result.split("\n").includes("PASS B22 Chrome/PG16: two distinct protected Owners same draft/application ID; second HTTPS reserve waits application row before draft; first native claim finish draft NOWAIT free; loser403, creating/submitting and Seller/audit unchanged"),
          "Missing real two-protected-Owner same-key application-first PG16 lock witness, HTTP denial and no extra Seller/audit")
        assert.ok(result.split("\n").includes("PASS B22 Chrome/PG16: concurrent Store draft GET and Person mobile POST both wait Person-first, epoch NOWAIT free, HTTPS200 each, one private audit/outbox, draft unchanged"),
          "Missing real #279 Person-first Store draft/mobile concurrency and audit proof")
        assert.ok(result.split("\n").includes("PASS B22 Chrome/PG16: Store draft and Owner closing GET wait Person-first, epoch NOWAIT free, HTTPS200 each, no draft or closing writes"),
          "Missing real #329 Store draft/Owner closing state deadlock regression proof")
        assert.ok(result.includes("PASS B22 Chrome: paused company Store draft remains editable but native Owner submit is denied"),
          "Missing retained editable Store draft while native submissions are paused")
        assert.ok(result.split("\n").includes(
          "PASS B22 Chrome/HTTP/PG16: platform company Store application pause/reopen, private Owner 403, CSRF 403, native pending on hold, old Store open, audit/outbox and no auto-approval"),
          "Missing real Chrome/HTTP/PG16 platform company policy pause/reopen, private authorization, pending Seller, and audit/outbox proof")
        assert.ok(result.split("\n").includes(
          "PASS B22 Chrome/HTTP/PG16: 10 MiB tax cert upload, 10 MiB+1 rejection, private download, corrupt-file submit denial, duplicate-tax confidential flag, staff correction, applicant withdrawal, staff approval/protected Owner"),
          "Missing real Chrome/HTTP/PG16 tax certificate application, independent reviewer decision and protected Owner acceptance")
        assert.ok(result.split("\n").includes(
          "PASS B22 Chrome/HTTP/PG16: staff unscanned document denied, applicant original retained, foreign denied"),
          "Missing real HTTPS authorization boundary for unscanned staff document denial")
        assert.ok(result.split("\n").includes("PASS B22 Chrome/HTTP/PG16: corrected tax certificate resubmission required new upload; two versions retained; withdrawn approval denied"),
          "Missing real Chrome/PG16 correction and preserved revision acceptance")
        assert.ok(result.split("\n").includes(
          "PASS B22 Chrome/HTTP/PG16: PNG drag drop requires visible upload, private hash persisted, multi-drop denied, withdrawn without Organization"),
          "Missing real Chrome drag/drop file selection, intentional upload, private PG16 SHA persistence and withdrawal without Organization")
        assert.ok(result.split("\n").includes(
          "PASS B22 Chrome/HTTP/PG16: reviewer 101 submitted queue pages, unauthorized denied, stale view cleared"),
          "Missing real PG16 101 submitted-application reviewer pagination, forbidden applicant and stale-view privacy checks")
        assert.ok(result.split("\n").includes(
          "PASS B22 Chrome/HTTP/PG16: individual business PNG two retained versions, independent staff approval, one Person two protected Owner Organizations, foreign denied"),
          "Missing real Chrome/HTTP/PG16 individual business two retained private document versions and independent protected Owner acceptance")
        assert.ok(result.split("\n").some(line=>line.startsWith(
          "PASS B22 Chrome: first Person signup HTTPS/PG16, mandatory mobile400, native Customer to one Person")),
          "Missing real Chrome/PG16 successful first Person signup evidence")
        assert.ok(result.includes("PASS B22 PG16: duplicate activity direct SQL 23514; original private draft unchanged"),
          "Missing direct PostgreSQL 16 CHECK rejection evidence for duplicate activity")
        assert.ok(result.includes("PASS B22 PG16/Chrome: legacy-shaped empty activity draft []/NULL, private GET and visible edit persist same id/person to v2; no Organization/Owner"),
          "Missing PG16 legacy-shaped default/read and Chrome edit persistence evidence")
        assert.ok(result.split("\n").includes(
          "PASS B22 Chrome: delayed real draft POST locks selection/form; no stale-value rewrite or silent version overwrite"),
          "Missing delayed HTTP save/selection lock and unchanged PG16 draft evidence")
        assert.ok(result.split("\n").includes(
          "PASS B22 Chrome: 103 private drafts across keyset pages; oldest opened via visible button; foreign Person empty; no Organization/Owner"),
          "Missing real Chrome private pagination, oldest draft read and foreign Person isolation")
        assert.ok(result.split("\n").includes(
          "PASS B22 Chrome: private applicant withdraws draft; foreign/CSRF/stale/replay denied; persisted audit, no Organization/Owner"),
          "Missing real Chrome/PG16 private draft withdrawal acceptance")
        assert.ok(result.split("\n").includes(
          "PASS B22 Chrome: Buyer Organization Owner follows and unfollows approved Store; foreign/CSRF/replay denied, PG16 v1-v2 and two outboxed audits, no checkout"),
          "Missing real Chrome/PG16 Store follow persistence and foreign/replay rejection")
        assert.ok(result.includes("PASS B22 Chrome: declared activities and primary activity saved in PG16; foreign and invalid primary denied; reload restores selection"),
          "Missing actual Chrome/PG16 activity declaration/save/denial/reload proof")
        assert.ok(result.includes("PASS B22 Chrome: Person private Organization draft save/edit, foreign/unauthenticated/CSRF/replay denies, PG16 audit without Organization or Owner"),
          "Missing real Chrome/PG16 applicant-private draft, edit, CSRF/foreign/replay denial and no auto Organization/Owner")
        assert.ok(result.includes("PASS B22 Chrome: Person private Organization draft reload; version-2 reappears in list; Taslağı düzenle opens populated form; zero new draft/Organization/Owner/audit write"),
          "Missing real Chrome/PG16 draft reload persistence: same draft (v2) in list, Taslağı düzenle form populated, zero new DB rows")
        assert.ok(result.includes("PASS B22 Chrome: primary Customer protected in UI, no unlink control, forged unlink403 and unchanged PG16 login/proof/audit"),
          "Missing real browser primary/secondary distinction, forged unlink denial and PG16 non-mutation")
        assert.ok(result.includes("PASS B22 real PG16: post-primary-proof forced audit failure rolls back six Foundation tables"),
          "Missing real PG16 forced post-primary-proof rollback across Person, mapping, login, proof, audit and outbox")
        assert.ok(result.split("\n").some(line=>line.startsWith(
          "PASS B22 Chrome: distinct real TLS client IPs share login/signup budget per source only;")),
          "Missing real HTTPS source-isolated 429 and forged-header negative evidence")
        for(const target of ["active","missing","foreign","revoked"])
          assert.ok(result.split("\n").includes("PASS B22 Chrome: membership non-disclosure "+target+
            " target HTTP403 identical safe body; PG16 membership/canonical audit/audit outbox/security outbox unchanged"),
            "Missing real HTTP/PG16 membership non-disclosure evidence: "+target)
        assert.ok(result.includes("PASS B22 CR-03 real Chrome/HTTP/PG16: active unprotected Owner 403 for grants and listings; service denies block and revoke, zero audit/outbox writes"),
          "Missing actual role-only Owner 403 and zero-side-effect Chrome/PG16 acceptance")
        assert.ok(result.includes("PASS B22 Chrome: real MFA and dual-proof Member link with two Organization scopes"))
        assert.ok(result.includes("PASS B22 native Mercur product workflow: draft persisted, only selected Seller linked"))
        assert.ok(result.split("\n").includes("PASS B22 Chrome: protected Owner excluded from individual products.edit; forged grant/revoke HTTP403, PG16 grant/audit unchanged"),
          "Missing real Chrome/PG16 immutable Owner personal grant/revoke denial with zero DB side effects")
        assert.ok(result.split("\n").includes("PASS B22 Chrome: no new Organization Admin assignment; Owner HTTP400, membership/audit unchanged"),
          "Missing real Owner browser/HTTP rejection of retired company Admin role")
        assert.ok(result.split("\n").includes("PASS B22 Chrome: retired company Admin invitation Owner HTTP400; no invitation or audit write"),
          "Missing real Owner refusal of retired Admin invitation with no audit or invitation mutation")
        assert.ok(result.split("\n").includes("PASS B22 Chrome: native Store member connection unauthorized/foreign/CSRF/forged denied, no SellerMember or audit"),
          "Missing real Chrome/PG16 refusal of unauthorized, foreign and forged native member connection")
        assert.ok(result.split("\n").includes("PASS B22 Chrome: native Store member connection via Owner UI persisted one SellerMember and one canonical audit; replay unchanged"),
          "Missing real Owner UI→Mercur SellerMember persisted link, audited outcome and idempotent replay")
        assert.ok(result.split("\n").includes("PASS B22 Chrome: revoked products.edit prevents native Store connection via Owner HTTP; SellerMember and canonical audit unchanged"),
          "Missing real revoked-grant refusal for existing native SellerMember and unchanged canonical audit")
        assert.ok(result.split("\n").includes("PASS B22 Buyer catalogue: real Chrome HTTPS and PG16 two published Mercur Offers under approved Buyer Org, foreign and forged scopes 403/400, no private inventory leakage and no audit writes"),
          "Missing real Chrome HTTPS/PG16 Buyer catalogue discovery, Store/Org denials and no-write evidence")
        assert.ok(result.split("\n").includes("PASS B22 Store price group F-01/F-02: suspended/de-approved Seller and suspended Buyer GET403; real first-party Member unlink between native HTTP scope and Foundation write denies grant403, zero group/audit mutation"),
          "Missing real Chrome HTTPS + PG16 F-01 Seller/Buyer read denial and F-02 committed Member unlink race with zero price group writes")
        assert.ok(result.split("\n").includes("PASS B22 BuyerOrg native private TRY reference: real Chrome/HTTPS/PG16 active Store group grants only 950.25 TRY to Beta, other Store and Buyer base TRY; revoke and Seller suspension hide price, no checkout or audit writes"),
          "Missing real BuyerOrg-specific native group price Chrome, revocation, cross-Store negative")
        assert.ok(result.split("\n").includes("PASS B22 native Store BuyerOrg group PriceList capability: native group+Offer-scoped TRY override selected only for matching Store/group; anonymous, foreign group and second Store kept base price; no Person Customer enrollment"),
          "Missing real PG16 native group-based Seller-specific PriceList calculation and cross-Store negative evidence")
        assert.ok(result.split("\n").includes("PASS B22 Mercur 2.4 Store regions: two approved task-only Sellers explicitly linked to native Region; unapproved Seller excluded"),
          "Missing native Region/Seller v2.4 explicit scoped link proof")
        assert.ok(result.split("\n").includes("PASS B22 audited Store price group: real Owner Chrome grant/revoke, Mercur SellerCustomerGroup link, Buyer Org PG16 audit/outbox, foreign Person/Store/CSRF denied; no checkout"),
          "Missing real Store Owner price-group grant/revoke, native Seller-owned group, PG16 persistence and cross-Store/Person denial")
        assert.ok(result.split("\n").includes("PASS B22 native TRY Offer list price: two seller-scoped Medusa prices on a shared native variant, EUR-only excluded, browser reference display, no checkout"),
          "Missing real native Medusa direct TRY Offer price linkage, foreign-currency refusal, or browser reference acceptance")
        assert.ok(result.split("\n").includes("PASS B22 suspended Seller Organization: real PG16 legal Owner status hides both approved Offers from active Buyer Beta; reactivation restores, no buyer bypass"),
          "Missing real suspended Seller legal Organization catalog denial with active Buyer and restored Store scope")
        assert.ok(result.includes("PASS B22 Chrome: native private HTTP and signed-in HTTPS payment callbacks return 403; Cart open, zero OrderGroup and payment links; no provider/capture"),"Missing native payment callback fail-closed HTTP/Chrome evidence")
        assert.ok(result.includes("PASS B22 pre-revocation control: real Customer + immutable Beta Cart attribution + approved Gamma Store + active buyer.purchase passes Foundation L; zero-value Cart remains open"),"Missing pre-revocation Foundation L allow evidence")
        assert.ok(result.split("\n").includes("PASS B22 protected Owner mutation negatives: role-only Owner HTTP 403 on membership role-change and invitation revoke; membership/invitation states and canonical audit/outbox unchanged"),
          "Missing real role-only Owner membership role-change + invitation revoke 403 / no-write acceptance")
        assert.ok(result.includes("PASS B22 protected Owner management: active role-only Owner 403 membership/invitation/audit/Store reads, invitation create and membership revoke; no invitations, membership or audit/outbox writes"),
          "Missing role-only Owner HTTP/PG16 management and privacy negative evidence")
        assert.ok(result.split("\n").includes("PASS B22 protected Owner management: real pending invitation HTTP 403 for role-only Owner with no DB/audit mutation; same invitation HTTPS 200 revoked by protected Owner with single audit/outbox"),
          "Missing real pending invitation, denied role-only Owner and authorized protected Owner revoke/PG16 audit evidence")
        assert.ok(result.includes("PASS B22 explicit permission: protected Owner reads 200; role-only Admin private reads, role edit and invitation create 403; no PG16 writes"),
          "Missing protected Owner positive and role-only Admin private read/write 403 no-side-effect evidence")
        assert.ok(result.split("\n").includes("PASS B22 Owner member-permission policy: protected Owner grant/list 200 despite legacy setting; revoke 200 with audit/outbox"),
          "Missing protected Owner member grant/list/revoke and audit after disabled legacy policy narrowing")
        assert.ok(result.split("\n").includes("PASS B22 Owner role policy: fixed invitation.manage keeps Owner HTTPS list200; protected Owner revokes with audit/outbox"),
          "Missing invitation.manage denied and restored real Chrome/PG16 marker")
        assert.ok(result.split("\n").includes("PASS B22 native organization.read role policy: protected Owner remains allowed with legacy setting; Admin/Member unchanged, foreign/role-only Owner denied, native ingress401"),
          "Missing real PG16 Owner organization.read policy/role boundaries with native HTTP ingress still closed")
        assert.ok(result.split("\n").includes("PASS B22 Owner role policy: fixed audit.timeline.read keeps Owner HTTPS200 and Admin403; PG16 membership/audit/outbox unchanged"),
          "Missing immutable protected Owner audit.timeline.read HTTP200, legacy Admin403 and unchanged PG16 evidence")
        assert.ok(result.split("\n").includes("PASS B22 Owner role policy: fixed membership.list keeps Owner HTTPS GET200; Admin403; PG16 data unchanged"),
          "Missing protected Owner and role-only Admin membership.list 403/private data denial, restored Owner 200 and zero-write PG16 evidence")
        assert.ok(result.split("\n").includes("PASS B22 Owner role policy: fixed membership.manage under legacy setting; real Owner HTTP legacy Admin reduction audited"),
          "Missing owner membership.manage role-policy HTTP/PG16 zero-write and restored positive evidence")
        assert.ok(result.includes("PASS B22 Owner role policy: fixed buyer.purchase keeps eligible HTTPS and PG16 checkout L despite legacy setting; zero OrderGroup"),
          "Missing protected Owner purchase HTTPS/PG16 final checkout entitlement with deprecated deployment setting")
        assert.ok(result.includes("PASS B22 Owner role policy: fixed products.edit keeps approved Store visible via HTTP with legacy setting; no product intent write"),
          "Missing protected Owner product edit store visibility with deprecated deployment setting")
        assert.ok(result.includes("PASS B22 real Mercur validate: real Chrome Gamma Store Buyer block denies attributed Beta Cart before OrderGroup/Order/payment writes; unblock restores L without completing Cart"),"Missing real Store block at Mercur validate evidence")
        assert.ok(result.includes("PASS B22 Chrome: authorized zero-value native Mercur split-order persisted one OrderGroup/Order and completed Cart with immutable Beta attribution; no payment or visitor checkout"),"Missing authorized native zero-value positive OrderGroup persistence evidence")
        assert.ok(result.includes("PASS B22 native payment simulation: system provider authorized before L/order; native Mercur persisted single OrderGroup/Order; only then system capture recorded; no external payment, callback or visitor checkout"),"Missing native preauthorized synthetic provider order/capture sequence evidence")
        assert.ok(result.includes("PASS B22 native completed Cart retry: second Mercur split-order invocation denied; original OrderGroup/Order and single system-provider capture unchanged"),"Missing native completed Cart retry without duplicate Order/payment evidence")
        assert.ok(result.includes("PASS B22 native payment denial: pre-authorized system-provider Cart blocked by real Store Owner before L; Mercur rejected with zero OrderGroup/Order/capture and preserved immutable Buyer attribution"),"Missing authorized paid Cart reject-before-capture PG16/Chrome evidence")
        assert.ok(result.includes("PASS B22 post-L cutoff: native OrderGroup INSERT waited after validate L, real Chrome Store block committed during wait; checkout persisted one OrderGroup/Order with unchanged Buyer and zero payment; later L denied"),"Missing real post-L Owner Store block commit/accepted OrderGroup evidence")
        assert.ok(result.includes("PASS B22 concurrent native Cart checkout: two separate Medusa processes observed shared PostgreSQL Cart lock after L at PG16 OrderGroup INSERT barrier; one completed Cart, one OrderGroup/Order, zero payment, unchanged Buyer attribution"),"Missing native concurrent Cart no-duplicate order evidence")
        assert.ok(result.includes("PASS B22 PostgreSQL expired lock behavior: task-owned one-second lock remained after expiration and rejected reacquisition; only explicit scoped release cleared it; crash recovery is NOT proven"),"Missing actual expired PostgreSQL lock recovery limitation evidence")
        assert.ok(result.includes("OBSERVED B22 abrupt Medusa process exit: expired provider lock persists and rejects reacquisition; exact task-only cleanup; checkout recovery BLOCKED"),"Missing independent Medusa process exit and stale lock negative evidence")
        assert.ok(result.includes("PASS B22 official Redis provider: independent process exit, live-lock denial, automatic TTL recovery; native Mercur Cart checkout NOT TESTED on Redis"),"Missing native Redis process exit and recovery evidence")
        assert.ok(result.includes("PASS B22 native Cart TTL units: actual PostgreSQL Cart lease bounded by 120 seconds on Mercur 2.4; checkout/payment still disabled"),"Missing native Mercur Cart lease units mismatch evidence")
        assert.ok(result.includes("PASS B22 real Mercur validate: protected Owner still authorized after self-grant revoke, but Store Buyer Organization block denies native checkout with zero OrderGroup/Order/payment; unblock restores L"),"Missing protected Owner Store-block denial and no-order/payment evidence")
        assert.ok(result.includes("PASS B22 Chrome: real native Member product INSERT and Owner products.edit revoke serialized on PG16; committed product/audit predates revoke; next Member HTTP 403 and zero new product"),"Missing actual native-product and products.edit revoke PG16/Chrome overlap proof")
        assert.ok(result.includes("PASS B22 Chrome: Staff grant revoke waits during real native Seller approval; HTTP200 and Seller open before revoke commit, later Staff HTTP403; authoritative origin retained"),"Missing native Staff approval × grant revoke real PG16 ordering proof")
        assert.ok(result.includes("PASS B22 Chrome: native Seller creation serialized before denied protected Owner removal; Seller pending, Owner remains active, no unauthorized membership audit"),"Missing serialized Seller creation and blocked Owner removal PG16/Chrome proof")

        // Run native Access/Index/crash test only after Chrome is finished,
        // using the same disposable database and installed Medusa modules.
        const audit=invoke("./integration-tests/postgres/b22-audit-worker.exec.ts",
          {...task,DOGRUADRES_MFA_RUNTIME_ENABLED:"true",
            DOGRUADRES_MFA_SETTINGS_ENABLED:"true",
            DOGRUADRES_MFA_ENROLLMENT_ENABLED:"true"})
        assert.ok(audit.includes("PASS B22 audit worker: real Medusa Access/Index job delivered canonical Staff events, ACK and single Index entry on lost-ACK replay; crash recovery NOT TESTED"),
          "Missing native worker crash/Index/ACK/replay evidence")
        assert.ok(audit.split("\n").includes(ownerPauseIndexMarker),
          "Missing real Owner pause/resume Index delivery and durable ACK replay proof")
        assert.ok(audit.split("\n").includes(ownerClosingIndexMarker),
          "Missing real Owner closing Index delivery, redaction and durable deduplicated ACK proof")
        assert.ok(audit.includes("PASS B22 real audit relay: native Owner Store follow/unfollow delivered by Medusa worker to Buyer-only Audit Index, two matching envelopes and durable ACKs"),
          "Missing real indexed Store-follow audit delivery and ACK")
        assert.ok(audit.includes("PASS B22 real audit relay: platform company policy disable/reopen delivered by native Medusa Access/Index, redacted envelopes, durable ACKs and scoped timeline"),
          "Missing real Access/Index receipt, redaction and Organization timeline delivery for platform policy changes")
        assert.ok(audit.includes("PASS B22 real audit relay: primary native Customer Staff HTTPS policy events delivered with Customer actor, redacted durable ACKs and scoped Owner timeline"),
          "Missing linked Customer Staff HTTP producer and Access/Index relay acceptance")
        for(const proof of ["PASS B22 audit real ACK: committed receipt lost,",
          "PASS B22 audit natural lease: DB clock 60s,",
          "PASS B22 audit native scheduler and crash restart: true Medusa cron,"])
          assert.ok(audit.includes(proof),"Missing genuine native audit recovery: "+proof)
      }

      if (scope === "b02") {
        const b02=spawnSync(process.execPath,["run","medusa","exec",
          "./integration-tests/postgres/b02-negatives.exec.ts"],{
          cwd:process.cwd(),env:nativeEnv,encoding:"utf8",timeout:120000,maxBuffer:2*1024*1024,
        })
        // Only explicit sanitized evidence is published; never native debug output.
        const output=String(b02.stdout??"").split("\n").filter(line=>/^(B02_EVIDENCE |PASS B02 |BLOCKED B02 )/.test(line)).join("\n")
        process.stdout.write(output+"\n")
        if(b02.error||b02.status!==0)throw Error("B02 native execution failed; inspect sanitized evidence")
        assert.ok(output.includes("PASS B02 bounded HTTP/SQL execution"),"Missing B02 execution evidence")
      }

      if (scope === "b04") {
        const b04=spawnSync(process.execPath,["run","medusa","exec",
          "./integration-tests/postgres/b04-roles-and-access.exec.ts"],{
          cwd:process.cwd(),env:nativeEnv,encoding:"utf8",timeout:120000,maxBuffer:2*1024*1024,
        })
        const output=String(b04.stdout??"").split("\n").filter(line=>/^(B04_EVIDENCE |PASS B04 |BLOCKED B04 )/.test(line)).join("\n")
        process.stdout.write(output+"\n")
        if(b04.error||b04.status!==0)throw Error("B04 native execution failed; inspect sanitized evidence")
        assert.ok(output.includes("PASS B04 bounded HTTP/SQL execution"),"Missing B04 execution evidence")
      }

      if (scope === "b04-ui") {
        const browser = spawnSync(process.execPath, ["run", "medusa", "exec",
          "./integration-tests/postgres/b04-roles-and-access.exec.ts"], {
          cwd: process.cwd(), env: nativeEnv, encoding: "utf8", timeout: 240000, maxBuffer: 2*1024*1024,
        })
        const output = String(browser.stdout ?? "").split("\n").filter(line => /^(B04_UI_EVIDENCE |PASS B04-UI )/.test(line)).join("\n")
        process.stdout.write(output + "\n")
        if (browser.error || browser.status !== 0) throw Error("B04-UI execution failed; sanitized evidence only; no retry")
        assert.ok(output.includes("PASS B04-UI real Chrome UI/HTTP/SQL"), "Missing B04-UI evidence")
      }

      if (scope === "b05-ui") {
        const browser = spawnSync(process.execPath, ["run", "medusa", "exec",
          "./integration-tests/postgres/b05-memberships.exec.ts"], {
          cwd: process.cwd(), env: nativeEnv, encoding: "utf8", timeout: 300000, maxBuffer: 2*1024*1024,
        })
        const output = String(browser.stdout ?? "").split("\n").filter(line => /^(B05_UI_EVIDENCE |PASS B05-UI )/.test(line)).join("\n")
        process.stdout.write(output + "\n")
        if (browser.error || browser.status !== 0) throw Error("B05-UI failed; sanitized evidence only; no retry")
        assert.ok(output.includes("PASS B05-UI real Chrome membership listing/refresh"), "Missing B05-UI evidence")
      }

      if (scope === "b06-ui") {
        const suffix=randomBytes(8).toString('hex')
        // B06 MFA/challenge stays within one native Medusa process; no Redis service is provisioned in this CI job.
        // Unlike non-interactive migration checks, live personal HTTP must not target the deliberate port-1 Redis sentinel.
        const b06Env={...nativeEnv,REDIS_URL:undefined,B06_EMAIL_A:`b06-a-${suffix}@example.invalid`,B06_EMAIL_B:`b06-b-${suffix}@example.invalid`,B06_PASSWORD_A:randomBytes(32).toString('base64url'),B06_PASSWORD_B:randomBytes(32).toString('base64url')}
        const invoke=(script:string,env:NodeJS.ProcessEnv,activation=false)=>{
          const child=spawnSync(process.execPath,activation?[script]:['run','medusa','exec',script],{cwd:process.cwd(),env,encoding:'utf8',timeout:360000,maxBuffer:4*1024*1024})
          const output=String(child.stdout??'').split('\n').filter(line=>/^(B06_UI_EVIDENCE |PASS B06)/.test(line)).join('\n')
          process.stdout.write(output+'\n')
          if(child.error||child.status!==0){
            const cause=sanitized(String(child.error??'')+String(child.stderr??'')+String(child.stdout??''))
            throw Error('B06 stage failed: '+(activation?'activation':env.B06_PREPARE==='true'?'synthetic setup':'Chrome acceptance')+'; '+cause+'; no retry')
          }
          return output
        }
        invoke('./integration-tests/postgres/b06-roles.exec.ts',{...b06Env,B06_PREPARE:'true'})
        // Same database, no consumer during the existing signed activation CAS.
        invoke('./integration-tests/postgres/b06-activation.pg16.ts',b06Env,true)
        const output=invoke('./integration-tests/postgres/b06-roles.exec.ts',{...b06Env,DOGRUADRES_MFA_SETTINGS_ENABLED:'true',DOGRUADRES_MFA_ENROLLMENT_ENABLED:'true',DOGRUADRES_MFA_RUNTIME_ENABLED:'true'})
        assert.ok(output.includes('PASS B06-UI real Chrome/native MFA/HTTP/SQL'))
      }

      if (scope === "b07-ui") {
        const suffix=randomBytes(8).toString('hex')
        // B07 MFA/challenge stays within one native Medusa process; no Redis service is provisioned in this CI job.
        // Unlike non-interactive migration checks, live personal HTTP must not target the deliberate port-1 Redis sentinel.
        const b06Env={...nativeEnv,REDIS_URL:undefined,B07_EMAIL_A:`b07-a-${suffix}@example.invalid`,B07_EMAIL_B:`b07-b-${suffix}@example.invalid`,B07_PASSWORD_A:randomBytes(32).toString('base64url'),B07_PASSWORD_B:randomBytes(32).toString('base64url')}
        const invoke=(script:string,env:NodeJS.ProcessEnv,activation=false)=>{
          const child=spawnSync(process.execPath,activation?[script]:['run','medusa','exec',script],{cwd:process.cwd(),env,encoding:'utf8',timeout:360000,maxBuffer:4*1024*1024})
          const output=String(child.stdout??'').split('\n').filter(line=>/^(B07_UI_EVIDENCE |PASS B07)/.test(line)).join('\n')
          process.stdout.write(output+'\n')
          if(child.error||child.status!==0){
            const cause=sanitized(String(child.error??'')+String(child.stderr??'')+String(child.stdout??''))
            throw Error('B07 stage failed: '+(activation?'activation':env.B07_PREPARE==='true'?'synthetic setup':'Chrome acceptance')+'; '+cause+'; no retry')
          }
          return output
        }
        invoke('./integration-tests/postgres/b07-roles.exec.ts',{...b06Env,B07_PREPARE:'true'})
        // Same database, no consumer during the existing signed activation CAS.
        invoke('./integration-tests/postgres/b07-activation.pg16.ts',b06Env,true)
        const output=invoke('./integration-tests/postgres/b07-roles.exec.ts',{...b06Env,DOGRUADRES_MFA_SETTINGS_ENABLED:'true',DOGRUADRES_MFA_ENROLLMENT_ENABLED:'true',DOGRUADRES_MFA_RUNTIME_ENABLED:'true'})
        assert.ok(output.includes('PASS B07-UI real Chrome/native MFA/HTTP/SQL'))
      }

      if (scope === "b08-ui") {
        const suffix=randomBytes(8).toString('hex')
        // B08 MFA/challenge stays within one native Medusa process; no Redis service is provisioned in this CI job.
        // Unlike non-interactive migration checks, live personal HTTP must not target the deliberate port-1 Redis sentinel.
        const b06Env={...nativeEnv,REDIS_URL:undefined,B08_EMAIL_A:`b08-a-${suffix}@example.invalid`,B08_EMAIL_B:`b08-b-${suffix}@example.invalid`,B08_PASSWORD_A:randomBytes(32).toString('base64url'),B08_PASSWORD_B:randomBytes(32).toString('base64url')}
        const invoke=(script:string,env:NodeJS.ProcessEnv,activation=false)=>{
          const child=spawnSync(process.execPath,activation?[script]:['run','medusa','exec',script],{cwd:process.cwd(),env,encoding:'utf8',timeout:360000,maxBuffer:4*1024*1024})
          const output=String(child.stdout??'').split('\n').filter(line=>/^(B08_UI_EVIDENCE |PASS B08)/.test(line)).join('\n')
          process.stdout.write(output+'\n')
          if(child.error||child.status!==0){
            const cause=sanitized(String(child.error??'')+String(child.stderr??'')+String(child.stdout??''))
            throw Error('B08 stage failed: '+(activation?'activation':env.B08_PREPARE==='true'?'synthetic setup':'Chrome acceptance')+'; '+cause+'; no retry')
          }
          return output
        }
        invoke('./integration-tests/postgres/b08-revoke-session.exec.ts',{...b06Env,B08_PREPARE:'true'})
        // Same database, no consumer during the existing signed activation CAS.
        invoke('./integration-tests/postgres/b08-activation.pg16.ts',b06Env,true)
        const output=invoke('./integration-tests/postgres/b08-revoke-session.exec.ts',{...b06Env,DOGRUADRES_MFA_SETTINGS_ENABLED:'true',DOGRUADRES_MFA_ENROLLMENT_ENABLED:'true',DOGRUADRES_MFA_RUNTIME_ENABLED:'true'})
        assert.ok(output.includes('PASS B08-UI real Chrome/native MFA/HTTP/SQL'))
      }

      if (scope === "all" || scope === "mfa") {
        // Reuse this already migrated disposable CI database; no additional DB/resource.
        const fixture=spawnSync("node",["-r","ts-node/register","./integration-tests/postgres/native-fixture-entry.pg16.ts"],{
          cwd:process.cwd(),env:nativeEnv,encoding:"utf8",timeout:120000,maxBuffer:2*1024*1024,
        })
        if(fixture.error||fixture.status!==0)throw Error("R0-D native entry CI failed: "+
          sanitized(String(fixture.error??"")+String(fixture.stderr??"")+String(fixture.stdout??"")))
        assert.ok(String(fixture.stdout).includes("PASS R0-D native entry"))
        process.stdout.write(String(fixture.stdout))
        // TEST_FIXTURE / NOT_AUTHORITY: same existing disposable DB, no operator custody.
        const r1=spawnSync("node",["-r","ts-node/register","./integration-tests/postgres/r1-activation.pg16.ts"],{
          cwd:process.cwd(),env:nativeEnv,encoding:"utf8",timeout:120000,maxBuffer:2*1024*1024,
        })
        if(r1.error||r1.status!==0)throw Error("R1 TEST_FIXTURE failed: "+sanitized(String(r1.error??"")+String(r1.stderr??"")+String(r1.stdout??"")))
        assert.ok(String(r1.stdout).includes('PASS R1 TEST_FIXTURE / NOT_AUTHORITY'))
        process.stdout.write(String(r1.stdout))
        const native=spawnSync(process.execPath,["run","medusa","exec",
          "./integration-tests/postgres/native-mfa-lifecycle.exec.ts"],{
          cwd:process.cwd(),env:nativeEnv,encoding:"utf8",timeout:120000,maxBuffer:2*1024*1024,
        })
        if(native.error||native.status!==0)
          throw Error("Native Medusa MFA integration not accepted: "+
            String(native.error??("exit "+native.status))+"; "+
            sanitized(String(native.stderr??"")+"\n"+String(native.stdout??"")))
        const passed=String(native.stdout??"")
        for(const evidence of [
          "PASS Medusa native MFA: synthetic password proof, TOTP start and verify",
          "PASS Medusa native MFA: recovery code consumed exactly once",
          "PASS Medusa native MFA: enabled factor cannot be disabled without fresh challenge",
          "PASS Medusa native MFA challenge: TOTP, owner separation and completed-challenge replay rejection",
          "PASS Medusa native MFA challenge: recovery code consumed and denied on a fresh challenge",
          "PASS Medusa native MFA challenge: five failed attempts lock the challenge",
        ])assert.ok(passed.includes(evidence),"Missing real native MFA acceptance evidence")
        process.stdout.write("PASS exact-DB Medusa native MFA: TOTP, recovery, native challenges and attempt cap\n")
      }

      if (scope === "all" || scope === "verification") {
        // Reuse this same disposable DB and real Medusa CLI boot for #241.
        // The certificate is a temporary test CA; production TLS verification stays on.
        const smtpTemp = mkdtempSync(join(tmpdir(), "dogruadres-smtp-ci-"))
        try {
          for (const name of ["trusted", "untrusted"]) {
            const certificate = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes",
              "-keyout", join(smtpTemp, name + ".key"), "-out", join(smtpTemp, name + ".crt"),
              "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=IP:127.0.0.1"],
              { encoding: "utf8", timeout: 15000 })
            assert.ok(!certificate.error && certificate.status === 0, "Synthetic TLS certificate generation failed")
          }
          const smtp = spawnSync(process.execPath, ["run", "medusa", "exec",
            "./integration-tests/postgres/native-smtp-notification.exec.ts"], {
            cwd: process.cwd(), encoding: "utf8", timeout: 180000, maxBuffer: 2 * 1024 * 1024,
            env: { ...nativeEnv, NODE_EXTRA_CA_CERTS: join(smtpTemp, "trusted.crt"),
              SMTP_TEST_CERT: join(smtpTemp, "trusted.crt"), SMTP_TEST_KEY: join(smtpTemp, "trusted.key"),
              SMTP_TEST_UNTRUSTED_CERT: join(smtpTemp, "untrusted.crt"), SMTP_TEST_UNTRUSTED_KEY: join(smtpTemp, "untrusted.key") },
          })
          if (smtp.error || smtp.status !== 0) throw Error("Native SMTP notification integration failed: " +
            sanitized(String(smtp.error ?? "") + String(smtp.stderr ?? "") + String(smtp.stdout ?? "")))
          const smtpOutput = String(smtp.stdout ?? "")
          for (const marker of ["PASS SMTP native boot:", "PASS SMTP native event:", "PASS SMTP native runtime:",
            "PASS SMTP native failures:", "PASS SMTP native TLS:", "PASS SMTP native local-event failure:", "PASS SMTP native logs:", "PASS SMTP verification origin:",
            "PASS verification CORS:",
            "PASS verification HTTP GET:", "PASS verification HTTP negatives:",
            "PASS browser Next middleware:", "PASS browser token preservation:", "PASS browser native GET inspection:", "PASS browser explicit confirmation:", "PASS browser replay denial:", "PASS browser privacy:", "PASS browser missing backend configuration:", "PASS browser Storefront origin:", "PASS browser HTTPS localhost:", "PASS browser IPv4-mapped loopback:",
            "PASS verification HTTP POST:", "PASS verification HTTP privacy:", "PASS verification scope:"])
            assert.ok(smtpOutput.includes(marker), "Missing native SMTP acceptance marker: " + marker)
          // Only fixed acceptance markers are published, never transport/message/secret data.
          process.stdout.write(smtpOutput.split("\n").filter(line => /^(PASS|OBSERVED) (SMTP|verification|browser) /.test(line)).join("\n") + "\n")
        } finally {
          for (const file of readdirSync(smtpTemp)) unlinkSync(join(smtpTemp, file))
          rmdirSync(smtpTemp)
        }
      }

      if (scope === "verification") {
        const audit = new SQL(dbUrl.toString())
        try {
          const authIdentities = Number((await audit.unsafe("select count(*)::int as n from auth_identity"))[0].n)
          assert.equal(authIdentities, 1, `Scope violation: verification run expected 1 AuthIdentity in database, found ${authIdentities}`)
          const persons = Number((await audit.unsafe("select count(*)::int as n from da_person"))[0].n)
          assert.equal(persons, 0, `Scope violation: verification run expected 0 da_person rows, found ${persons}`)
          const orgs = Number((await audit.unsafe("select count(*)::int as n from da_organization"))[0].n)
          assert.equal(orgs, 0, `Scope violation: verification run expected 0 da_organization rows, found ${orgs}`)
          process.stdout.write("PASS exact-DB scope: exactly 1 AuthIdentity and 0 domain fixture records across disposable database\n")
        } finally {
          await audit.close()
        }
      }

      if (scope === "all" || scope === "verification") {
        // Execute B22 against the exact native Medusa-migrated disposable DB,
        // after all existing MFA/SMTP fixtures; no new database or cleanup path.
        const legalDb = new SQL(dbUrl.toString())
        try { await verifyB22OwnedSellerConstraints(legalDb, dbName) }
        finally { await legalDb.close() }
      }
      if (scope === "verification") {
        // B22 restricted negative-only integration. Reuses the current native
        // Medusa runtime and disposable database, after the exact-DB empty
        // domain attestation and physical schema tests. NEVER inserts a
        // verified secondary Member binding or an approved Store assignment.
        const negative=spawnSync(process.execPath,["run","medusa","exec",
          "./integration-tests/postgres/b22-native-denial.exec.ts"],{
          cwd:process.cwd(),env:nativeEnv,encoding:"utf8",timeout:120000,maxBuffer:2*1024*1024,
        })
        const marker="PASS B22 native HTTP negative: real personal password session, native SellerMember without verified Member binding denied"
        if(negative.error||negative.status!==0||
           !String(negative.stdout??"").includes(marker))
          throw Error("B22 native HTTP negative failed; " +
            sanitized(String(negative.error??("exit "+negative.status))+"\n"+
             String(negative.stderr??"")+"\n"+String(negative.stdout??"")))
        const closedCatalog="PASS B22 closed B4B native HTTP: public catalog/search denied before native data; no Organization audit mutation"
        if(!String(negative.stdout??"").split("\n").includes(closedCatalog))
          throw Error("B22 closed B4B native HTTPS/Organization read gate was not executed")
        process.stdout.write(closedCatalog+"\n")
        process.stdout.write(marker+"\n")
        process.stdout.write("NOT TESTED B22 native HTTP: real MFA/Chrome, verified Member link, approved Store assignment, authorized Store list\n")
      }


    }finally{
      try { await target.close() } catch {}
    }
  }finally{
    try{
      if(created){
        const exists=await admin.unsafe("select count(*)::int as n from pg_database where datname=$1",[dbName])
        if(Number(exists[0].n)!==1)throw Error("Disposable database identity mismatch; refusal to clean")
        await admin.unsafe('drop database "'+dbName+'" with (force)')
        process.stdout.write("CLEANUP: task-owned random Medusa CLI CI database dropped\n")
      }
    }catch(error){
      process.stderr.write("CLEANUP ERROR: "+String(error)+"\n")
      process.exitCode=1
    }finally{
      await admin.close()
    }
  }
}
run().catch(error=>{
  process.stderr.write("Foundation real Medusa CLI PG16 FAILED: "+String(error)+"\n")
  process.exitCode=1
})
