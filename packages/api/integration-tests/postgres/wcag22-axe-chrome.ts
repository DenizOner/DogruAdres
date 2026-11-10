/**
 * WCAG 2.2 A/AA automated subset on an existing authenticated real Chrome page.
 * No second browser, network scanner, screenshots, DOM/text evidence or server writes.
 * An axe rule pass is NOT WCAG conformance; manual review belongs to the skill.
 */
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {createRequire} from "node:module"
import type {B06Chrome} from "./b06-ui-browser"

const require=createRequire(import.meta.url)
const AXE_VERSION="4.14.0"
type AuditedScope="#login"|"#person-mobile-form"|"#store-approval-panel"

export async function assertWcag22AxeInChrome(
  browser:B06Chrome, scope:AuditedScope, label:string
):Promise<void>{
  // Resolve an explicitly locked local dependency, not an online CDN/CLI.
  const source=readFileSync(require.resolve("axe-core/axe.min.js"),"utf8")
  const load=await browser.send("Runtime.evaluate",{expression:source,returnByValue:true})
  assert.ok(!load.exceptionDetails,"WCAG axe-core injection must execute in real Chrome")
  const summary=await browser.callFunction(`async function(selector){
    const root=document.querySelector(selector)
    if(!root||!root.getClientRects().length)return {missing:true}
    if(!globalThis.axe||typeof globalThis.axe.run!=='function')
      return {missing:true}
    const results=await globalThis.axe.run(root,{
      runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}
    })
    // Never return page HTML, element targets, text, URLs, tokens or private data.
    return {
      version:globalThis.axe.version,
      checked:results.passes.length+results.violations.length+results.incomplete.length,
      incomplete:results.incomplete.length,
      violations:results.violations.map(v=>({
        rule:String(v.id).slice(0,64),count:v.nodes.length
      }))
    }
  }`,scope)
  assert.ok(summary&&!summary.missing,`WCAG scope unavailable: ${label}`)
  assert.equal(summary.version,AXE_VERSION,"Unpinned axe-core runtime")
  assert.ok(Number.isInteger(summary.checked)&&summary.checked>0,
    "WCAG engine returned zero evaluated rules; not a PASS")
  assert.ok(Array.isArray(summary.violations),"WCAG violations result missing")
  assert.equal(summary.violations.length,0,
    `WCAG 2.2 A/AA auto violations [${label}]: `+
    summary.violations.map((v:{rule:string;count:number})=>
      `${v.rule}(${v.count})`).join(", "))
  process.stdout.write(
    `PASS WCAG 2.2 A/AA automatic axe-core ${AXE_VERSION} ${label}: `+
    `${summary.checked} evaluated rules, 0 detected violations; `+
    `${summary.incomplete} inconclusive rules require manual review; `+
    "not full conformance\\n")
}
