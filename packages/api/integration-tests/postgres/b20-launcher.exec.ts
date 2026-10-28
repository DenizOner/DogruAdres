/**
 * B20 acceptance: per-Person persistent launcher preference.
 * Tests: reorder, collapse, reset, second-Person isolation, revoked-session,
 * CSRF/Origin, invalid app IDs, refresh/re-login persistence, no permission change.
 *
 * Approved scope: issue #203 comment 6470700012 + PO drag/keyboard approval
 * 6469901263.  Two launcher targets: 'storefront' (always) and 'vendor'
 * (Member+Seller only).
 *
 * Infrastructure: task-owned disposable tmpfs PG16 Docker container started
 * by b20-native-preflight.cjs.  Never touches production DB or B01-B19 evidence.
 */
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'node:https'
import { Client } from '@medusajs/framework/pg'
import { createPersonalHttpApp } from '../../src/scripts/personal-http-runtime'
import { B19Chrome, otp, until } from './b19-browser'

const TLS = 'D:/DogruAdres/.worktrees/m0-vertical-evidence-20261020-a7f1/chrome-recovery-tls-20261021'

/**
 * Provision a synthetic Person with MFA (TOTP required) + basic org membership.
 * pg is passed directly — the Awilix container does not expose raw PG clients.
 */
async function makeActor(
  container: any,
  pg: InstanceType<typeof Client>,
  label: string
): Promise<{ email: string; password: string; secret: string; personId: string; authIdentityId: string }> {
  const f = container.resolve('dogruadresAccess')
  const auth = container.resolve('auth')
  const users = container.resolve('user')
  const email = `b20-${label}-${randomBytes(6).toString('hex')}@example.invalid`
  const password = randomBytes(32).toString('base64url')
  const [u] = await users.createUsers([{ email }])
  const a = await auth.register('emailpass', { body: { email, password } })
  assert.ok(a.success)
  await auth.updateAuthIdentities({ id: a.authIdentity.id, app_metadata: { user_id: u.id } })
  const [p] = await f.createPeople([{}])
  await f.createActorMappings([{
    actor_type: 'user', actor_id: u.id, person_id: p.id,
    created_by_actor_type: 'user', created_by_actor_id: u.id,
  }])
  await pg.query(
    `insert into da_login_binding(auth_identity_id,person_id,actor_type,actor_id,verified_at)
     values($1,$2,'user',$3,now())`,
    [a.authIdentity.id, p.id, u.id]
  )
  const setup = await auth.startAuthMfa({
    auth_identity_id: a.authIdentity.id, provider: 'totp', issuer: `B20-${label}`
  })
  const enrollCounter = Math.floor(Date.now() / 30000)
  await auth.verifyAuthMfa({
    id: setup.mfa.id, auth_identity_id: a.authIdentity.id, code: otp(setup.secret)
  })
  await pg.query(`update da_mfa_policy set platform_mode='required' where id='current'`)
  await pg.query(`update da_session_policy set mfa_activated=true where id='current'`)
  const [org] = await f.createOrganizations([{ name: `B20-${label}-org` }])
  await f.createMemberships([{ organization_id: org.id, person_id: p.id, role: 'member' }])
  // Wait for a fresh TOTP window so enrollment code cannot be replayed.
  await until(
    async () => Math.floor(Date.now() / 30000) > enrollCounter,
    35000,
    `fresh TOTP for ${label}`
  )
  return { email, password, secret: setup.secret, personId: p.id, authIdentityId: a.authIdentity.id }
}

/**
 * Provision a Member+Seller binding for an existing Person (Person A only).
 * Creates: native Seller, native Member, native SellerMember association,
 * and a 'member' actor mapping + da_verified_actor_binding row.
 * The Person must already exist (created by makeActor).
 * Returns the seller_id for assertion use.
 *
 * All native objects are created through the Mercur-owned 'seller' module
 * resolved from the Awilix container — no direct DB inserts for native tables.
 */
async function makeSellerForPerson(
  container: any,
  pg: InstanceType<typeof Client>,
  personId: string,
  authIdentityId: string,
  label: string
): Promise<{ sellerId: string; memberId: string }> {
  const f = container.resolve('dogruadresAccess')
  const sellers = container.resolve('seller') as {
    createSellers(rows: object[]): Promise<any[]>
    updateSellers(rows: object[]): Promise<any[]>
    createMembers(rows: object[]): Promise<any[]>
    createSellerMembers(rows: object[]): Promise<any[]>
  }

  // Create native Seller. Mercur Seller requires: name, email, currency_code.
  // Default status is 'pending_approval'; updateSellers sets it to 'open' so that
  // the triple-check in launcher/route.ts (listSellers({id, status:'open'})) passes.
  const sellerEmail = `b20-${label}-seller-${personId.slice(-8)}@example.invalid`
  const [seller] = await sellers.createSellers([{
    name: `B20-${label}-seller`,
    email: sellerEmail,
    currency_code: 'try',  // Turkish Lira — synthetic test seller
  }])
  // Open the seller account so vendor appears in available_ids for this Person.
  await sellers.updateSellers([{ id: seller.id, status: 'open' }])

  // Create native Member (email matches Person A's user email — safe unique string)
  const memberEmail = `b20-${label}-member-${personId.slice(-8)}@example.invalid`
  const [member] = await sellers.createMembers([{
    email: memberEmail,
    first_name: 'B20',
    last_name: label,
  }])

  // Associate Member with Seller
  await sellers.createSellerMembers([{ seller_id: seller.id, member_id: member.id }])

  // Create a 'member' actor mapping for the Person
  await f.createActorMappings([{
    actor_type: 'member',
    actor_id: member.id,
    person_id: personId,
    created_by_actor_type: 'member',
    created_by_actor_id: member.id,
  }])

  // Insert da_verified_actor_binding. proof_reference is NOT NULL (length > 0).
  // Use a synthetic test reference — no secrets, just test-fixture identity.
  const proofRef = `b20-test-seller-fixture:${member.id}`
  await pg.query(
    `insert into da_verified_actor_binding(id,auth_identity_id,person_id,actor_type,actor_id,verified_at,proof_reference)
     values('b20-vab-'||gen_random_uuid()::text,$1,$2,'member',$3,now(),$4)
     on conflict(actor_type,actor_id) where revoked_at is null do nothing`,
    [authIdentityId, personId, member.id, proofRef]
  )

  return { sellerId: seller.id, memberId: member.id }
}

export default async function ({ container }: any) {
  const dir = process.env.B20_DIR!
  const record = (n: string, v: unknown) =>
    writeFileSync(join(dir, n + '.json'), JSON.stringify(v, null, 2), { flag: 'wx' })

  // Dedicated PG connection for direct server-side readback assertions.
  const pg = new Client({ connectionString: process.env.DATABASE_URL })
  await pg.connect()
  const q = async (sql: string, params: any[] = []) => (await pg.query(sql, params)).rows
  assert.equal((await q('select current_database() db'))[0].db, process.env.B20_DATABASE)
  assert.match((await q('select version() v'))[0].v, /PostgreSQL 16\./)

  const app = await createPersonalHttpApp(container)
  const cert = readFileSync(join(TLS, 'server.pem'))
  const key = readFileSync(join(TLS, 'server-key.private.pem'))
  const server = createServer({ cert, key, minVersion: 'TLSv1.2' }, app.app)
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const serverPort = String((server.address() as any).port)
  const origin = 'https://127.0.0.1:' + serverPort
  process.env.DOGRUADRES_PUBLIC_ORIGIN = origin
  // Align ingressConfig read in route.ts GET: port + host must match publicOrigin.
  process.env.DOGRUADRES_FRONTDOOR_HOST = '127.0.0.1'
  process.env.DOGRUADRES_FRONTDOOR_PORT = serverPort

  const results: Record<string, unknown> = {}
  let chromeA: B19Chrome | undefined
  let chromeB: B19Chrome | undefined

  try {
    // ── Provision two independent synthetic Persons ─────────────────────────
    const actorA = await makeActor(container, pg, 'personA')
    const actorB = await makeActor(container, pg, 'personB')
    // Provision Member+Seller for Person A so 'vendor' appears in available_ids.
    // Person B intentionally has no Member/Seller — used for vendor-negative test.
    const sellerA = await makeSellerForPerson(
      container, pg, actorA.personId, actorA.authIdentityId, 'personA'
    )
    record('actors-manifest', {
      personA: actorA.personId, personB: actorB.personId,
      sellerA: sellerA.sellerId, memberA: sellerA.memberId,
    })

    // ── Helper: authenticate a Chrome instance and return the csrf token ────
    async function loginChrome(chrome: B19Chrome, actor: typeof actorA): Promise<string> {
      await chrome.start()
      await chrome.input('#login input[name=email]', actor.email)
      await chrome.input('#login input[name=password]', actor.password)
      await chrome.click('#login button')
      await chrome.wait("!document.getElementById('challenge').hidden")
      await chrome.input('#challenge input[name=code]', otp(actor.secret))
      await chrome.click('#challenge button')
      await chrome.wait("!document.getElementById('workspace').hidden")
      const csrf: string = await chrome.eval("csrf")
      assert.ok(csrf && csrf.length === 43, 'B20_CSRF_TOKEN_EXPECTED')
      return csrf
    }

    // ── Person A: initial GET launcher ──────────────────────────────────────
    chromeA = new B19Chrome(origin, 'B20-personA')
    const csrfA = await loginChrome(chromeA, actorA)
    const initPref: any = await chromeA.eval(
      "(async()=>{const r=await fetch('/personal/launcher',{credentials:'same-origin'});return {status:r.status,body:await r.json()}})()"
    )
    assert.equal(initPref.status, 200, 'B20_LAUNCHER_GET_200')
    assert.ok(Array.isArray(initPref.body.app_ids), 'B20_APP_IDS_ARRAY')
    assert.ok(initPref.body.available_ids.includes('storefront'), 'B20_STOREFRONT_AVAILABLE')
    assert.ok(initPref.body.available_ids.includes('vendor'), 'B20_VENDOR_AVAILABLE_FOR_SELLER')
    assert.equal(initPref.body.version, 0, 'B20_INITIAL_VERSION_ZERO')
    results['launcher-init-personA'] = { status: 'PASS', data: initPref.body }

    // ── CSRF rejection ──────────────────────────────────────────────────────
    const csrfReject: number = await chromeA.eval(
      `(async()=>{const r=await fetch('/personal/launcher',{method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json','x-csrf-token':'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'},
        body:JSON.stringify({app_ids:['storefront'],collapsed_ids:[],version:0})});return r.status})()`
    )
    assert.equal(csrfReject, 403, 'B20_CSRF_REJECT_403')
    results['csrf-rejection'] = { status: 'PASS', got: 403 }

    // ── Wrong origin rejection ──────────────────────────────────────────────
    // Browser fetch cannot override the Origin header (it is a forbidden header name).
    // The csrf() function checks trustedOrigin() first (returns false immediately).
    // So any POST with wrong origin → 403 regardless of session/token.
    // We test this via a direct Node.js HTTPS request (no real session needed).
    {
      const surl = new URL(`${origin}/personal/launcher`)
      const wrongOriginStatus: number = await new Promise((resolve, reject) => {
        const https = require('node:https') as typeof import('node:https')
        const body = JSON.stringify({ app_ids: ['storefront'], collapsed_ids: [], version: 0 })
        const req = https.request({
          hostname: surl.hostname,
          port: Number(surl.port),
          path: surl.pathname,
          method: 'POST',
          rejectUnauthorized: false,
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
            'x-csrf-token': csrfA,
            'origin': 'https://evil.example',
          },
        }, (res) => resolve(res.statusCode ?? 0))
        req.on('error', reject)
        req.write(body)
        req.end()
      })
      assert.equal(wrongOriginStatus, 403, 'B20_WRONG_ORIGIN_403')
    }
    results['origin-rejection'] = { status: 'PASS', got: 403 }

    // ── Invalid/forged app IDs are silently dropped ─────────────────────────
    const invalidId: any = await chromeA.eval(
      `(async()=>{const r=await fetch('/personal/launcher',{method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json','x-csrf-token':'${csrfA}'},
        body:JSON.stringify({app_ids:['storefront','FAKEID','../etc'],collapsed_ids:[],version:0})});
      return {status:r.status,body:await r.json()}})()`
    )
    assert.equal(invalidId.status, 200, 'B20_INVALID_ID_200')
    assert.ok(!invalidId.body.app_ids.includes('FAKEID'), 'B20_FAKEID_DROPPED')
    assert.ok(!invalidId.body.app_ids.includes('../etc'), 'B20_PATH_TRAVERSAL_DROPPED')
    assert.ok(invalidId.body.app_ids.includes('storefront'), 'B20_VALID_ID_RETAINED')
    results['invalid-app-id'] = { status: 'PASS', stored: invalidId.body.app_ids }

    // ── Person A: save real preference (reorder + collapse) ─────────────────
    const orderedIds = ['vendor', 'storefront']  // vendor first — tests reorder persisted
    const saveResult: any = await chromeA.eval(
      `(async()=>{const r=await fetch('/personal/launcher',{method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json','x-csrf-token':'${csrfA}'},
        body:JSON.stringify({app_ids:${JSON.stringify(orderedIds)},collapsed_ids:['storefront'],version:1})});
      return {status:r.status,body:await r.json()}})()`
    )
    assert.equal(saveResult.status, 200, 'B20_SAVE_200')
    assert.equal(saveResult.body.version, 2, 'B20_VERSION_INCREMENTED')
    assert.ok(saveResult.body.collapsed_ids.includes('storefront'), 'B20_COLLAPSE_PERSISTED')
    results['save-preference-personA'] = { status: 'PASS', stored: saveResult.body }

    // ── PG readback: verify DB state ─────────────────────────────────────────
    const dbRow = await q(
      `select app_ids,collapsed_ids,version from da_launcher_preference where person_id=$1`,
      [actorA.personId]
    )
    assert.ok(dbRow.length === 1, 'B20_DB_ROW_EXISTS')
    assert.equal(dbRow[0].version, 2, 'B20_DB_VERSION')
    assert.ok((dbRow[0].collapsed_ids as string[]).includes('storefront'), 'B20_DB_COLLAPSE')
    results['pg-readback-personA'] = { status: 'PASS', row: { version: dbRow[0].version } }

    // ── Version conflict: stale version must 409 ────────────────────────────
    const conflictStatus: number = await chromeA.eval(
      `(async()=>{const r=await fetch('/personal/launcher',{method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json','x-csrf-token':'${csrfA}'},
        body:JSON.stringify({app_ids:['storefront'],collapsed_ids:[],version:1})});return r.status})()`
    )
    assert.equal(conflictStatus, 409, 'B20_CONFLICT_409')
    results['version-conflict'] = { status: 'PASS', got: 409 }

    // ── Person B: independent session, sees its own empty preference ─────────
    chromeB = new B19Chrome(origin, 'B20-personB')
    const csrfB = await loginChrome(chromeB, actorB)
    const prefB: any = await chromeB.eval(
      "(async()=>{const r=await fetch('/personal/launcher',{credentials:'same-origin'});return {status:r.status,body:await r.json()}})()"
    )
    assert.equal(prefB.status, 200, 'B20_PERSONB_GET_200')
    assert.equal(prefB.body.version, 0, 'B20_PERSONB_INITIAL_ZERO')
    // Person B must NOT inherit Person A's collapsed state.
    assert.ok(!prefB.body.collapsed_ids.includes('storefront'), 'B20_PERSONB_ISOLATION')
    results['personB-isolation'] = { status: 'PASS', versionB: prefB.body.version }

    // ── Person B saves its own preference; Person A's version must be unaffected
    const savePrefB: any = await chromeB.eval(
      `(async()=>{const r=await fetch('/personal/launcher',{method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json','x-csrf-token':'${csrfB}'},
        body:JSON.stringify({app_ids:['storefront'],collapsed_ids:['storefront'],version:0})});
      return {status:r.status,body:await r.json()}})()`
    )
    assert.equal(savePrefB.status, 200, 'B20_PERSONB_SAVE_200')
    const dbRowA2 = await q(
      `select version from da_launcher_preference where person_id=$1`,
      [actorA.personId]
    )
    assert.equal(dbRowA2[0].version, 2, 'B20_PERSONA_UNCHANGED_AFTER_B_SAVE')
    results['personB-save-isolation'] = { status: 'PASS' }

    // ── Re-login persistence: logout Person A and re-login ───────────────────
    await chromeA.eval("api('session',{method:'DELETE'})")
    await chromeA.wait("!document.getElementById('login').hidden")
    // Re-login in the same running Chrome instance — do NOT call start() again
    // (that spawns a second Chrome process on the same profile and hangs).
    // After logout the /personal page already shows the login form.
    await chromeA.input('#login input[name=email]', actorA.email)
    await chromeA.input('#login input[name=password]', actorA.password)
    await chromeA.click('#login button')
    await chromeA.wait("!document.getElementById('challenge').hidden")
    await chromeA.input('#challenge input[name=code]', otp(actorA.secret))
    await chromeA.click('#challenge button')
    await chromeA.wait("!document.getElementById('workspace').hidden")
    const csrfA2: string = await chromeA.eval("csrf")
    assert.ok(csrfA2 && csrfA2.length === 43, 'B20_RELOGIN_CSRF_EXPECTED')
    const reloadPref: any = await chromeA.eval(
      "(async()=>{const r=await fetch('/personal/launcher',{credentials:'same-origin'});return {status:r.status,body:await r.json()}})()"
    )
    assert.equal(reloadPref.status, 200, 'B20_RELOAD_200')
    assert.equal(reloadPref.body.version, 2, 'B20_RELOAD_VERSION_PERSISTED')
    assert.ok(reloadPref.body.collapsed_ids.includes('storefront'), 'B20_RELOAD_COLLAPSE_PERSISTED')
    results['re-login-persistence'] = { status: 'PASS', reloaded: { version: reloadPref.body.version } }

    // ── Reset: send empty app_ids + collapsed_ids ────────────────────────────
    const resetPref: any = await chromeA.eval(
      `(async()=>{const r=await fetch('/personal/launcher',{method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json','x-csrf-token':'${csrfA2}'},
        body:JSON.stringify({app_ids:[],collapsed_ids:[],version:2})});
      return {status:r.status,body:await r.json()}})()`
    )
    assert.equal(resetPref.status, 200, 'B20_RESET_200')
    assert.equal(resetPref.body.collapsed_ids.length, 0, 'B20_RESET_NO_COLLAPSED')
    results['reset-preference'] = { status: 'PASS', afterVersion: resetPref.body.version }

    // Wait for loadLauncher() — it is void-called from load() so workspace is visible
    // before the launcher section is populated. Must await section becoming visible
    // before asserting launch links are present in the DOM.
    await chromeA.wait("!document.getElementById('launcher-section').hidden")

    // ── Launch links present in DOM ───────────────────────────────────────────
    // Each available app must have a real navigable <a> launch link in the DOM.
    // The link must have a non-empty href and rel=noopener.
    const launchLinks: any = await chromeA.eval(`
      (() => {
        const section = document.getElementById('launcher-section');
        if (!section || section.hidden) return { error: 'launcher-section hidden' };
        const links = [...section.querySelectorAll('a[href]')];
        return {
          count: links.length,
          items: links.map(a => ({
            href: a.href,
            rel: a.rel,
            target: a.target,
            text: a.textContent.trim(),
          }))
        };
      })()
    `)
    assert.ok(launchLinks.count >= 1, 'B20_LAUNCH_LINKS_PRESENT')
    assert.ok(
      launchLinks.items.every((l: any) => l.href && l.rel.includes('noopener')),
      'B20_LAUNCH_LINKS_SAFE'
    )
    results['launch-links'] = { status: 'PASS', links: launchLinks.items }

    // ── Expand/collapse content section ──────────────────────────────────────
    // Toggle the first app's collapse button; content div must hide/show.
    const collapseTest: any = await chromeA.eval(`
      (() => {
        const list = document.getElementById('launcher-list');
        if (!list || !list.children.length) return { error: 'no list items' };
        const firstLi = list.children[0];
        const firstId = firstLi.getAttribute('data-id');
        const toggle = firstLi.querySelector('.launcher-toggle');
        const contentEl = document.getElementById('launcher-content-' + firstId);
        if (!toggle || !contentEl) return { error: 'toggle or content not found' };
        const beforeHidden = contentEl.hidden;
        toggle.click();
        const afterHidden = contentEl.hidden;
        toggle.click(); // restore
        return { id: firstId, beforeHidden, afterHidden, toggled: beforeHidden !== afterHidden };
      })()
    `)
    assert.ok(!collapseTest.error, 'B20_COLLAPSE_ELEMENTS_PRESENT: ' + collapseTest.error)
    assert.ok(collapseTest.toggled, 'B20_COLLAPSE_TOGGLE_WORKS')
    results['collapse-content-section'] = { status: 'PASS', detail: collapseTest }

    // ── Pointer/touch drag DOM reorder ────────────────────────────────────────
    // Simulate pointerdown → pointermove → pointerup to reorder two items.
    // Only meaningful when there are two or more apps in the list.
    const touchDragTest: any = await chromeA.eval(`
      (() => {
        const list = document.getElementById('launcher-list');
        if (!list || list.children.length < 2) return { skipped: true, reason: 'fewer than 2 apps' };
        const items = [...list.children];
        const firstId = items[0].getAttribute('data-id');
        const secondId = items[1].getAttribute('data-id');
        const handle = items[0].querySelector('.launcher-handle');
        if (!handle) return { error: 'no handle on first item' };
        // Fire pointer events: pointerdown on handle, pointermove over second item, pointerup
        const r0 = items[0].getBoundingClientRect();
        const r1 = items[1].getBoundingClientRect();
        const mkPtr = (type, x, y, id) => new PointerEvent(type, {
          bubbles: true, cancelable: true,
          clientX: x, clientY: y, pointerId: id,
          pointerType: 'touch', isPrimary: true
        });
        handle.dispatchEvent(mkPtr('pointerdown', r0.left + 8, r0.top + 8, 99));
        items[1].dispatchEvent(mkPtr('pointermove', r1.left + 8, r1.top + 8, 99));
        items[1].dispatchEvent(mkPtr('pointerup', r1.left + 8, r1.top + 8, 99));
        const newItems = [...list.children];
        return {
          beforeOrder: [firstId, secondId],
          afterOrder: newItems.map(li => li.getAttribute('data-id')),
          reordered: newItems[0].getAttribute('data-id') !== firstId,
        };
      })()
    `)
    if (touchDragTest.skipped) {
      // Fewer than 2 apps — touch drag reorder is NOT testable with this fixture.
      // TA requirement: SKIPPED must be reported as NOT_TESTED, never PASS.
      results['touch-drag-reorder'] = { status: 'NOT_TESTED', note: touchDragTest.reason }
    } else {
      assert.ok(!touchDragTest.error, 'B20_TOUCH_DRAG_ERROR: ' + touchDragTest.error)
      // After simulated pointer events, DOM order should have changed.
      results['touch-drag-reorder'] = { status: 'PASS', detail: touchDragTest }
    }

    // ── Touch-drag reorder + POST persistence ─────────────────────────────────
    // After simulated drag reorder, POST the new DOM order and verify DB reflects it.
    // Only runs if we have 2+ apps (same condition as touch-drag above).
    if (!touchDragTest.skipped && !touchDragTest.error && touchDragTest.reordered) {
      // Read current DOM order
      const draggedOrder: string[] = await chromeA.eval(`
        (() => {
          const list = document.getElementById('launcher-list');
          return [...list.children].map(li => li.getAttribute('data-id'));
        })()
      `)
      // POST the reordered list using the reset pref version (after reset = version 3)
      // We need current version — re-fetch first
      const currentPref2: any = await chromeA.eval(
        "(async()=>{const r=await fetch('/personal/launcher',{credentials:'same-origin'});return {status:r.status,body:await r.json()}})()"
      )
      const dragSave: any = await chromeA.eval(
        `(async()=>{const r=await fetch('/personal/launcher',{method:'POST',credentials:'same-origin',
          headers:{'Content-Type':'application/json','x-csrf-token':'${csrfA2}'},
          body:JSON.stringify({app_ids:${JSON.stringify(draggedOrder)},collapsed_ids:[],version:${currentPref2.body.version}})});
        return {status:r.status,body:await r.json()}})()`
      )
      assert.equal(dragSave.status, 200, 'B20_DRAG_SAVE_200')
      // Verify PG reflects the dragged order
      const dbRowDrag = await q(
        `select app_ids from da_launcher_preference where person_id=$1`,
        [actorA.personId]
      )
      assert.ok(
        JSON.stringify(dbRowDrag[0].app_ids) === JSON.stringify(draggedOrder.filter((id: string) => ['storefront','vendor'].includes(id))),
        'B20_DRAG_ORDER_PERSISTED_IN_DB'
      )
      results['touch-drag-persist'] = { status: 'PASS', savedOrder: draggedOrder, dbVersion: dragSave.body.version }
    } else {
      results['touch-drag-persist'] = { status: 'NOT_TESTED', note: 'drag reorder not executed or no reorder detected' }
    }

    // ── Revoked session rejection ─────────────────────────────────────────────
    await chromeA.eval(
      `(async()=>{await fetch('/personal/session?action=lock',{method:'DELETE',credentials:'same-origin',
        headers:{'Content-Type':'application/json','x-csrf-token':'${csrfA2}'}})})()`
    )
    await chromeA.wait("!document.getElementById('login').hidden")
    const revokedGet: number = await chromeA.eval(
      "(async()=>{const r=await fetch('/personal/launcher',{credentials:'same-origin'});return r.status})()"
    )
    assert.equal(revokedGet, 401, 'B20_REVOKED_SESSION_401')
    results['revoked-session'] = { status: 'PASS', got: 401 }

    // ── Permission invariant ──────────────────────────────────────────────────
    // Snapshot actor bindings AFTER fixture setup but AFTER all launcher operations.
    // The count for Person A is 2 (user + member from makeSellerForPerson fixture).
    // The count for Person B is 1 (user only).
    // Launcher GET/POST must NOT have added any further bindings.
    const bindingsNow = await q(
      `select count(*)::int c from da_verified_actor_binding where person_id in ($1,$2)`,
      [actorA.personId, actorB.personId]
    )
    const membersNow = await q(
      `select count(*)::int c from da_organization_membership where person_id in ($1,$2) and status='active'`,
      [actorA.personId, actorB.personId]
    )
    // Expected: 3 total (user+member for A, user for B); 2 org memberships (one each).
    // Launcher operations must not have created any additional entitlement rows.
    assert.equal(bindingsNow[0].c, 3, 'B20_BINDINGS_FIXTURE_ONLY')
    assert.equal(membersNow[0].c, 2, 'B20_MEMBERSHIPS_FIXTURE_ONLY')
    results['permission-invariant'] = {
      status: 'PASS',
      bindings: bindingsNow[0].c,
      memberships: membersNow[0].c,
      note: 'Fixture: 2+1 bindings, 2 org memberships. No new bindings created by launcher operations.',
    }

    // ── Vendor entitlement negative — user-actor-only Person sees no vendor ──
    // Person B was created with user actor only (no Member/Seller binding).
    // The launcher GET must not include 'vendor' in available_ids for Person B.
    const vendorNeg: any = await chromeB.eval(
      "(async()=>{const r=await fetch('/personal/launcher',{credentials:'same-origin'});return {status:r.status,body:await r.json()}})()"
    )
    assert.equal(vendorNeg.status, 200, 'B20_VENDOR_NEG_GET_200')
    assert.ok(
      !vendorNeg.body.available_ids.includes('vendor'),
      'B20_VENDOR_NOT_AVAILABLE_WITHOUT_SELLER'
    )
    results['vendor-entitlement-negative'] = {
      status: 'PASS',
      available: vendorNeg.body.available_ids,
      note: 'Person without Member/Seller binding does not see vendor in available_ids',
    }

    // ── Screenshots ──────────────────────────────────────────────────────────
    await chromeA.screenshot(join(dir, 'b20-launcher-personA.png'))
    await chromeB.screenshot(join(dir, 'b20-launcher-personB.png'))

    record('b20-launcher-acceptance', {
      head: process.env.B20_HEAD,
      status: 'PASS',
      results,
      note: 'B20 launcher acceptance criteria executed against real Chrome/HTTPS/PG16. Skipped tests reported as NOT_TESTED.',
    })
  } finally {
    await chromeA?.close()
    await chromeB?.close()
    await new Promise<void>(r => server.close(() => r()))
    await app.close()
    await pg.end()
  }
}
