// #372: task-only synthetic negative test of the real LoginForm submit handler.
// No HTTP, browser, cookies, Person data, Cart API, protected runner or DB is used.
// This does NOT substitute for a real Chrome/AT, Next HTTP or Person/MFA acceptance.
// Run this Node-only test against the project-supported Node >=22.22.0 when available.
// REAL BROWSER/HTTP ACCEPTANCE CONTRACT — NOT EXECUTED BY THIS FILE:
// Before any run: prove exact HEAD/base/main, authorized isolated task-owned Next/browser
// runner+port, disposable synthetic account/credentials, no protected DB/cookies, and
// explicit single test-writer agreement if shared resources might be affected.
// (1) Wrong password => visible and announced error, unchanged focus, no navigation
//     or Cart transfer; assert independently in real Chrome/HTTP and screen reader.
// (2) Valid legacy customer login => only one /user navigation, existing Cart transfer
//     once; never turn this into checkout/payment activation (#254 PARK).
// (3) Anonymous GET /user => guarded redirect (expected 307); separately inspect
//     canonical /personal/session 401 and MFA 202 da_challenge != da_session.
// (4) Keyboard-only and 320px/400% layout, focus/AT announcement, TR/EN/RTL.
// No runner ownership/protection proof => STOP; do not claim any of (1)-(4) PASS.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("./LoginForm.tsx", import.meta.url), "utf8");
const startMarker = "  const submit = async (data: FieldValues) => {";
const endMarker = "\n  const clearApiError = ";
const start = source.indexOf(startMarker);
assert.ok(start !== -1, "LoginForm submit handler not found; update test against actual source");
assert.equal(source.indexOf(startMarker, start + startMarker.length), -1,
  "ambiguous LoginForm submit handler");
const end = source.indexOf(endMarker, start);
assert.ok(end > start, "LoginForm submit handler boundary changed; fail closed");
// Isolate the actual source handler, not a hand-reimplemented substitute.
// Only erase the known TypeScript parameter annotation for Node's JS evaluator.
const handlerSource = source.slice(start, end)
  .replace("(data: FieldValues)", "(data)");

function setup(authResult) {
  const calls = { navigation: [], transfers: 0, errors: [], resets: [], submitted: [] };
  const context = {
    FormData,
    login: async form => {
      calls.submitted.push({
        email: form.get("email"),
        password: form.get("password"),
      });
      return authResult;
    },
    router: { push: path => calls.navigation.push(path) },
    transferCart: async () => { calls.transfers++; },
    toast: { error: message => calls.errors.push(message) },
    setIsAuthError: value => calls.resets.push(value),
  };
  const submit = runInNewContext(handlerSource + "\nsubmit;", context, {
    timeout: 1000,
    filename: "LoginForm.tsx#submit",
  });
  assert.equal(typeof submit, "function");
  return { submit, calls };
}

test("#372 invalid password never navigates or transfers Cart", async () => {
  const { submit, calls } = setup({ success: false, message: "Invalid login" });
  await submit({ email: "synthetic@example.invalid", password: "not-a-secret" });
  assert.deepEqual(calls.submitted, [{
    email: "synthetic@example.invalid", password: "not-a-secret",
  }], "existing credential input contract");
  assert.deepEqual(calls.navigation, [], "failed login must stay on the login page");
  assert.equal(calls.transfers, 0, "failed login cannot transfer the legacy Cart");
  assert.equal(calls.errors.length, 1, "failed login must show one error");
  assert.equal(calls.errors[0].title, "Invalid login");
  assert.deepEqual(calls.resets, [], "failure must not clear auth error state");
});

test("#372 error response without message stays put and displays safe fallback", async () => {
  const { submit, calls } = setup({ success: false });
  await submit({ email: "synthetic@example.invalid", password: "invalid" });
  assert.deepEqual(calls.navigation, []);
  assert.equal(calls.transfers, 0);
  assert.equal(calls.errors.length, 1);
  assert.equal(calls.errors[0].title, "An error occurred. Please try again.");
  assert.deepEqual(calls.resets, [], "failure must not reset auth-error state");
});

// These are synthetic login() response messages, NOT actual HTTP 429/503 checks.
for (const [failure, message] of [
  ["rate-limited", "Too many attempts. Try again later."],
  ["service-unavailable", "Service temporarily unavailable."],
]) {
  test(`#372 ${failure} login response cannot navigate or transfer Cart`, async () => {
    const { submit, calls } = setup({ success: false, message });
    await submit({ email: "synthetic@example.invalid", password: "invalid" });
    assert.deepEqual(calls.navigation, [], "every failed response must remain on login");
    assert.equal(calls.transfers, 0, "failed response cannot transfer Cart");
    assert.equal(calls.errors.length, 1, "failed response must show one error");
    assert.equal(calls.errors[0].title, message);
    assert.deepEqual(calls.resets, [], "failed response must keep auth-error state");
  });
}

test("#372 successful existing customer login navigates once and transfers Cart once", async () => {
  const { submit, calls } = setup({ success: true });
  await submit({ email: "synthetic@example.invalid", password: "synthetic-password" });
  assert.deepEqual(calls.navigation, ["/user"],
    "successful legacy customer login must not navigate twice");
  assert.equal(calls.transfers, 1, "preserve existing transferCart call count");
  assert.equal(calls.errors.length, 0);
  assert.deepEqual(calls.resets, [false], "success clears auth error once");
});
