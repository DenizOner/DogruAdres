// #372: task-only synthetic negative test of the real LoginForm submit handler.
// No HTTP, browser, cookies, Person data, Cart API, protected runner or DB is used.
// This does NOT substitute for a real Chrome/AT, Next HTTP or Person/MFA acceptance.
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
});

test("#372 error response without message stays put and displays safe fallback", async () => {
  const { submit, calls } = setup({ success: false });
  await submit({ email: "synthetic@example.invalid", password: "invalid" });
  assert.deepEqual(calls.navigation, []);
  assert.equal(calls.transfers, 0);
  assert.equal(calls.errors.length, 1);
  assert.equal(calls.errors[0].title, "An error occurred. Please try again.");
});

test("#372 successful existing customer login navigates once and transfers Cart once", async () => {
  const { submit, calls } = setup({ success: true });
  await submit({ email: "synthetic@example.invalid", password: "synthetic-password" });
  assert.deepEqual(calls.navigation, ["/user"],
    "successful legacy customer login must not navigate twice");
  assert.equal(calls.transfers, 1, "preserve existing transferCart call count");
  assert.equal(calls.errors.length, 0);
});
