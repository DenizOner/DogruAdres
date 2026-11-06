/**
 * Issue #220 — Medusa 2.21.2 CLI db:migrate discovery against a newly created
 * CI-only database. No migrations or schema changes touch protected M0 data.
 * Runs once; existing MikroORM ledger tests cover late-add and replay.
 */
import assert from "node:assert/strict"
import { verifyB22OwnedSellerConstraints } from "./b22-ownership.pg16.test"
import { randomBytes } from "node:crypto"
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
        function invoke(file:string,env:NodeJS.ProcessEnv,direct=false){
          const child=spawnSync(process.execPath,direct?[file]:["run","medusa","exec",file],{
            cwd:process.cwd(),env,encoding:"utf8",timeout:file.includes('b22-audit-worker.exec.ts')?360000:210000,maxBuffer:3*1024*1024})
          if(task.B22_SMTP_CANARY)assert.ok(!String(child.stdout??"").concat(String(child.stderr??"")).includes(task.B22_SMTP_CANARY),"SMTP canary leaked to child logs")
          const valid=String(child.stdout??"").split("\n")
            .filter(x=>/^PASS B22 Chrome:|^PASS B22 real PG16: post-primary-proof forced audit failure|^PASS B22 native organization\.read role policy:|^PASS B22 Owner role policy:|^PASS B22 protected Owner mutation negatives:|^PASS B22 protected Owner management:|^PASS B22 explicit permission:|^PASS B22 pre-revocation control:|^PASS B22 real Mercur validate:|^PASS B22 native payment simulation:|^PASS B22 native completed Cart retry:|^PASS B22 native payment denial:|^PASS B22 post-L cutoff:|^PASS B22 concurrent native Cart checkout:|^PASS B22 PostgreSQL expired lock behavior:|^OBSERVED B22 abrupt Medusa process exit:|^PASS B22 official Redis provider:|^PASS B22 native Cart TTL units:|^PASS B22 native Mercur product workflow:|^PASS B22 Mercur 2\.4 Store regions:|^PASS B22 native Store BuyerOrg group PriceList capability:|^PASS B22 BuyerOrg native private TRY reference:|^PASS B22 Buyer catalogue:|^PASS B22 native TRY Offer list price:|^PASS B22 audited Store price group:|^PASS B22 Store price group F-01\/F-02:|^PASS B22 suspended Seller Organization:|^PASS B22 audit worker:|^PASS B22 real audit relay:|^PASS B22 audit real ACK:|^PASS B22 audit natural lease:|^PASS B22 audit native scheduler and crash restart:|^PASS B22 native reconciliation confirmed:|^PASS B22 CR-03 real Chrome\/HTTP\/PG16:|^NOT TESTED B22 Chrome:|^PASS B22 test fixture:|^PASS B06 disposable native activation/.test(x) ||
              x==="PASS B22 PG16: duplicate activity direct SQL 23514; original private draft unchanged" ||
              x==="PASS B22 PG16/Chrome: legacy-shaped empty activity draft []/NULL, private GET and visible edit persist same id/person to v2; no Organization/Owner").join("\n")
          if(child.error||child.status!==0)
            throw Error("B22 dedicated task-only child stage failed: "+sanitized(
              String(child.error??"exit "+child.status)+"\n"+String(child.stderr??"")+"\n"+String(child.stdout??"")))
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
        assert.ok(result.split("\n").includes("PASS B22 Owner role policy: narrowed invitation.manage denies Owner HTTPS list/create/revoke and Foundation writes with unchanged PG16 invitation/audit/outbox; restored Owner revokes"),
          "Missing invitation.manage denied and restored real Chrome/PG16 marker")
        assert.ok(result.split("\n").includes("PASS B22 native organization.read role policy: real PG16 protected Owner default/restored allow, centrally narrowed deny without private response; active Admin/Member unchanged, foreign and role-only Owner denied; native HTTPS ingress remains 401, zero audit/outbox mutations"),
          "Missing real PG16 Owner organization.read policy/role boundaries with native HTTP ingress still closed")
        assert.ok(result.split("\n").includes("PASS B22 Owner role policy: narrowed audit.timeline.read denies Owner HTTPS GET 403 without private audit items; Admin 403; restored Owner 200; PG16 membership/audit/outbox unchanged"),
          "Missing real Chrome audit.timeline.read narrowed Owner and ungranted Admin 403/no data, restored Owner 200, PG16 zero write")
        assert.ok(result.split("\n").includes("PASS B22 Owner role policy: narrowed membership.list denies real Owner HTTPS GET 403 with no private rows or PG16 membership/audit/outbox writes; Admin 403; restored Owner 200"),
          "Missing protected Owner and role-only Admin membership.list 403/private data denial, restored Owner 200 and zero-write PG16 evidence")
        assert.ok(result.split("\n").includes("PASS B22 Owner role policy: narrowed membership.manage denies Chrome role/revoke/protected Owner and native Foundation change; PG16 membership/audit/outbox unchanged; restored Owner role changes 200"),
          "Missing owner membership.manage role-policy HTTP/PG16 zero-write and restored positive evidence")
        assert.ok(result.includes("PASS B22 Owner role policy: narrowed buyer.purchase denies real HTTPS and PG16 final checkout L with zero OrderGroup; default restored"),
          "Missing real Owner role buyer.purchase narrowed-denial and restored-policy PG16/HTTP evidence")
        assert.ok(result.includes("PASS B22 Owner role policy: narrowed products.edit denies real HTTP POST and native PG16 product/intent writes, restored default lists approved Store"),
          "Missing real Owner role products.edit narrowed-denial/no-write and restored-policy PG16/HTTP evidence")
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
        assert.ok(result.includes("PASS B22 Chrome: real native product INSERT and protected Owner products.edit revoke serialized on PG16; committed product/audit predates revoke; next Member HTTP 403 and zero new product"),"Missing actual native-product and products.edit revoke PG16/Chrome overlap proof")
        assert.ok(result.includes("PASS B22 Chrome: Staff grant revoke waits during real native Seller approval; HTTP200 and Seller open before revoke commit, later Staff HTTP403; authoritative origin retained"),"Missing native Staff approval × grant revoke real PG16 ordering proof")
        assert.ok(result.includes("PASS B22 Chrome: real Mercur Seller INSERT and Owner membership revoke serialized on PG16; Seller pending plus source audit/outbox before revoke, next Owner Store POST403 and zero Seller"),"Missing real Owner membership revocation versus native Seller create PG16/Chrome overlap proof")

        // Run native Access/Index/crash test only after Chrome is finished,
        // using the same disposable database and installed Medusa modules.
        const audit=invoke("./integration-tests/postgres/b22-audit-worker.exec.ts",
          {...task,DOGRUADRES_MFA_RUNTIME_ENABLED:"true",
            DOGRUADRES_MFA_SETTINGS_ENABLED:"true",
            DOGRUADRES_MFA_ENROLLMENT_ENABLED:"true"})
        assert.ok(audit.includes("PASS B22 audit worker: real Medusa Access/Index job delivered canonical Staff events, ACK and single Index entry on lost-ACK replay; crash recovery NOT TESTED"),
          "Missing native worker crash/Index/ACK/replay evidence")
        assert.ok(audit.includes("PASS B22 real audit relay: native Owner Store follow/unfollow delivered by Medusa worker to Buyer-only Audit Index, two matching envelopes and durable ACKs"),
          "Missing real indexed Store-follow audit delivery and ACK")
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
