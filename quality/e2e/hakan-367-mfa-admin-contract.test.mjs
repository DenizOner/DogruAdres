/**
 * #367 — actual Admin React source's pure server-response authorization parser.
 * No browser/session/PG16 runtime is claimed here: those require separate CI.
 * Source is transpiled in memory, no app/server/configuration is modified.
 */
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import assert from "node:assert/strict"
import test from "node:test"
import ts from "typescript"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const route = join(root, "apps/admin/src/routes/settings/mfa/page.tsx")
const source = readFileSync(route, "utf8")

// Exercise real production parsing functions without an HTTP call or a
// synthetic route implementation. Only mark the functions as exports.
const instrumented = source
  .replace("function parsePolicy(", "export function parsePolicy(")
  .replace("function parseRead(", "export function parseRead(")
assert.notEqual(instrumented, source, "Production parser must remain present")
const compiled = ts.transpileModule(instrumented, {
  fileName: "page.tsx",
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022,
  },
  reportDiagnostics: true,
})
const errors = (compiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error)
assert.equal(errors.length, 0, "Platform Admin UI TSX syntax must transpile")
const module = { exports: {} }
runInNewContext(compiled.outputText, {
  module,
  exports: module.exports,
  require(id) {
    if (id === "react" || id === "react/jsx-runtime" || id === "@medusajs/ui") return {}
    throw Error("Unexpected source dependency: " + id)
  },
})
const { parsePolicy, parseRead } = module.exports
assert.equal(typeof parsePolicy, "function")
assert.equal(typeof parseRead, "function")

test("strictly accepts only the three platform modes and bounded integer CAS versions", () => {
  for (const mode of ["required", "optional", "disabled"]) {
    assert.deepEqual(JSON.parse(JSON.stringify(parsePolicy({
      platform_mode: mode, version: 0,
    }))), { platform_mode: mode, version: 0 })
  }
  assert.equal(parsePolicy({ platform_mode: "disabled", version: 2147483646 }).version,
    2147483646)
  for (const candidate of [
    null, [], "optional", {},
    { platform_mode: "owner", version: 1 },
    { platform_mode: "REQUIRED", version: 1 },
    { platform_mode: "required", version: -1 },
    { platform_mode: "required", version: 1.2 },
    { platform_mode: "required", version: "1" },
    { platform_mode: "required", version: 2147483647 },
    { platform_mode: "required", version: Number.NaN },
  ]) {
    assert.equal(parsePolicy(candidate), null)
  }
})

test("never enables Admin controls from Owner, SMTP or inferred client privilege", () => {
  const valid = {
    can_manage_platform: true,
    platform: { platform_mode: "optional", version: 5 },
    runtime_enforcement: "not_yet_enabled",
  }
  assert.equal(parseRead(valid).platform.platform_mode, "optional")
  for (const value of [
    { ...valid, can_manage_platform: false },
    { ...valid, can_manage_platform: "true" },
    { ...valid, can_manage_platform: undefined, role: "owner" },
    { ...valid, can_manage_platform: undefined, task: "smtp.manage" },
    { ...valid, runtime_enforcement: "enabled" },
    { ...valid, runtime_enforcement: undefined },
    { ...valid, platform: { platform_mode: "optional", version: "5" } },
  ]) assert.equal(parseRead(value), null)
})

test("form protects CSRF, optimistic version and a separate user confirmation", () => {
  assert.match(source, /fetch\("\/personal\/session"/)
  assert.match(source, /fetch\("\/personal\/mfa"/)
  assert.match(source, /credentials:\s*"include"/)
  assert.match(source, /"x-csrf-token": csrfToken/)
  assert.match(source, /expected_version: previousVersion/)
  assert.match(source, /action:\s*"platform"/)
  assert.match(source, /window\.confirm\(/)
  assert.match(source, /inFlight\.current \|\| saving \|\| locked \|\| !policy/)
  assert.match(source, /response\.status === 409/)
  assert.match(source, /setLocked\(true\)/)
  assert.match(source, /await refresh\(selected, previousVersion\)/)
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\.log/)
  assert.doesNotMatch(source, /person_id:|actor_id:|organization_id:/)
})

test("accessible radio controls disclose each option and native-factor limitations", () => {
  for (const mode of ["required", "optional", "disabled"]) {
    assert.match(source, new RegExp('value: "' + mode + '"'))
  }
  assert.match(source, /<fieldset disabled=/)
  assert.match(source, /<legend/)
  assert.match(source, /type="radio"/)
  assert.match(source, /aria-describedby=/)
  assert.match(source, /role="status"/)
  assert.match(source, /role="alert"/)
  assert.match(source, /native faktör/i)
  assert.match(source, /politika sürümü/i)
})


test("a failed or uncertain platform save conceals stale policy and its CSRF proof", () => {
  // Execute the actual production function body, without a DOM, server or
  // client-owned authorization state. Stale data must never look current.
  const extracted = source.match(/  function concealStalePolicy\(\) \{[\s\S]*?\n  \}/)
  assert.ok(extracted, "Production must provide a stale-display guard")
  const calls = []
  const conceal = new Function(
    "setPolicy", "setCsrfToken", "setConfirmed",
    extracted[0] + "; return concealStalePolicy"
  )(
    value => calls.push(["policy", value]),
    value => calls.push(["csrf", value]),
    value => calls.push(["confirmed", value]),
  )
  conceal()
  assert.deepEqual(calls, [
    ["policy", null], ["csrf", ""], ["confirmed", false],
  ])

  const mutator = source.slice(source.indexOf("  async function save("),
    source.indexOf("  const hasChange ="))
  assert.ok(mutator.includes("concealStalePolicy()"))
  for (const failureCase of [
    /if \(response\.status === 401 \|\| response\.status === 403\) \{[\s\S]*?concealStalePolicy\(\)/,
    /if \(response\.status === 409\) \{\s*concealStalePolicy\(\)/,
    /if \(!response\.ok\) \{\s*concealStalePolicy\(\)/,
    /if \(!posted \|\| posted\.platform_mode !== selected \|\| posted\.version <= previousVersion\) \{\s*concealStalePolicy\(\)/,
    /\} catch \{\s*concealStalePolicy\(\)/,
  ]) assert.match(mutator, failureCase)
  assert.match(mutator, /setLocked\(true\)/)
  assert.doesNotMatch(mutator, /retry|setTimeout|setInterval/i)
})
