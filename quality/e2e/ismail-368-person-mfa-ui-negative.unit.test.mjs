// #368 — SOURCE-ONLY, test-first Person MFA UI fail-closed negative controls.
// Never use live Person, Customer, factor, cookie, browser, backend, DB or secrets.
// These tests evaluate only the real /personal HTML refreshMfa handler with
// synthetic server-response objects; a passing test is NOT native MFA acceptance.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../packages/api/src/api/personal/route.ts', import.meta.url), 'utf8');
const begin = '  async function refreshMfa(){';
const end = '\n  async function links(){';
const start = source.indexOf(begin);
assert.ok(start >= 0, 'Canonical Person UI refreshMfa missing; fail closed');
assert.equal(source.indexOf(begin, start + begin.length), -1,
  'Ambiguous Person UI refreshMfa definition');
const stop = source.indexOf(end, start + begin.length);
assert.ok(stop > start, 'Cannot safely isolate Person UI refreshMfa');

// Exact project-owned browser function: no reimplementation of the behavior.
// The existing project mfa-settings Jest suite uses this source-isolation pattern.
const makeRefresh = new Function('api', 'el', 'clearMfaCodes',
  `let mfaState=null;let smtpSettings=null;${source.slice(start, stop)};` +
  'return {refreshMfa, state:()=>mfaState};');

const valid = Object.freeze({
  runtime_enforcement: 'enforced',
  platform: {platform_mode: 'optional'},
  personal: {user_enabled: false},
  native_factor_state: 'enabled',
  effective_mfa_target: {next_step: 'verify_mfa'},
  can_manage_platform: false,
});

function harness(value, fails = false) {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) {
      const button = {disabled: true};
      elements.set(id, {
        hidden: true,
        textContent: '',
        elements: {
          user_enabled: {checked: false, disabled: true},
          platform_mode: {value: ''},
        },
        querySelector: () => button,
      });
    }
    return elements.get(id);
  };
  let cleared = 0;
  const render = makeRefresh(
    async () => { if (fails) throw new Error('synthetic outage'); return value; },
    el,
    () => { cleared++; },
  );
  return {...render, el, clearCount: () => cleared};
}

function assertMfaControlsClosed(ui) {
  for (const id of ['mfa-person', 'mfa-platform', 'mfa-management', 'mfa-enroll-launch']) {
    assert.equal(ui.el(id).hidden, true, `${id} must be concealed on uncertain MFA state`);
  }
  assert.equal(ui.state(), null, 'Untrusted MFA state must not be cached as valid');
  assert.equal(ui.clearCount(), 1, 'Prior recovery codes must be cleared');
  assert.match(ui.el('mfa-info').textContent, /MFA.*(açılmadı|doğrulanamadı)/i);
  assert.doesNotMatch(ui.el('mfa-info').textContent, /undefined/);
}

test('#368 valid, already-enabled Person factor renders only authorized controls', async () => {
  const ui = harness(valid);
  await ui.refreshMfa();
  assert.equal(ui.el('mfa-person').hidden, false);
  assert.equal(ui.el('mfa-platform').hidden, true);
  assert.equal(ui.el('mfa-enroll-launch').hidden, true);
  assert.equal(ui.el('mfa-management').hidden, false);
  assert.match(ui.el('mfa-info').textContent, /Native doğrulama gerekli/);
});

test('#368 MFA response outage hides controls and erases cached recovery codes', async () => {
  const ui = harness(valid, true);
  await ui.refreshMfa();
  assertMfaControlsClosed(ui);
});

test('#368 malformed native factor state must fail closed (no enrollment button)', async () => {
  const ui = harness({...valid, native_factor_state: 'unknown',
    effective_mfa_target: {next_step: 'allow_primary'}});
  await ui.refreshMfa();
  assertMfaControlsClosed(ui);
});

test('#368 malformed platform mode must fail closed (no Person/platform controls)', async () => {
  const ui = harness({...valid, platform: {platform_mode: 'future-mode'},
    can_manage_platform: true});
  await ui.refreshMfa();
  assertMfaControlsClosed(ui);
});
