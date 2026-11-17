// #172: Real Next.js production HTTP acceptance on a single disposable PR
// runner. No Medusa/Person/Organization/DB and no live cache credentials.
import { spawn, spawnSync } from "node:child_process";
import { closeSync, openSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.GITHUB_ACTIONS !== "true" ||
    process.env.GITHUB_EVENT_NAME !== "pull_request" ||
    process.env.GITHUB_HEAD_REF !== "fix/baris-172-revalidate-bounded-tags" ||
    !process.env.RUNNER_TEMP) {
  throw new Error("REFUSE #172 HTTP test outside its task-owned GitHub pull request");
}

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const api = join(repo, "packages/api");
const storefront = join(repo, "apps/storefront");
const env = { ...process.env, CI: "1", NEXT_TELEMETRY_DISABLED: "1" };

const compile = [
  ["Mercur codegen", "bun", ["run", "codegen"], api, 180000],
  ["Storefront TypeScript", "node",
    ["../../node_modules/typescript/bin/tsc", "--noEmit", "--incremental", "false", "-p", "tsconfig.json"], storefront, 180000],
  ["Storefront ESLint zero warnings", "node",
    ["../../node_modules/eslint/bin/eslint.js", ".", "--max-warnings", "0"], storefront, 180000],
  ["Storefront Next production build", "bun", ["run", "build"], storefront, 360000],
];

for (const [label, exe, args, cwd, timeout] of compile) {
  const result = spawnSync(exe, args, {
    cwd, env, encoding: "utf8", timeout, maxBuffer: 12 * 1024 * 1024
  });
  const passed = !result.error && result.status === 0;
  console.log("IR14 " + (passed ? "PASS " : "FAIL ") + label);
  if (!passed) {
    // Only synthetic/disposable runner code; no customer or production secrets.
    console.error((result.stdout || "").slice(-9000), (result.stderr || "").slice(-9000));
    throw new Error("Failed " + label + " exit " + result.status + " " + (result.error?.message || ""));
  }
}

const candidates = [
  join(storefront, ".next/standalone/apps/storefront/server.js"),
  join(storefront, ".next/standalone/server.js"),
].filter(existsSync);
if (candidates.length !== 1) throw new Error("Expected exactly one Next standalone entry");
const entry = candidates[0];
const secret = randomBytes(32).toString("hex");
let passed = 0;

const freePort = () => new Promise((resolvePort, reject) => {
  const listener = createServer();
  listener.once("error", reject);
  listener.listen(0, "127.0.0.1", () => {
    const address = listener.address();
    listener.close(() => resolvePort(address.port));
  });
});

async function launch(withSecret) {
  const port = await freePort();
  const startEnv = {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    NEXT_TELEMETRY_DISABLED: "1",
  };
  if (withSecret) startEnv.REVALIDATE_SECRET = secret;
  else delete startEnv.REVALIDATE_SECRET;
  const log = openSync(join(process.env.RUNNER_TEMP,
    withSecret ? "ci172-next-secret-present.log" : "ci172-next-secret-absent.log"),
    "w", 0o600);
  const child = spawn(process.execPath, [entry], {
    cwd: dirname(entry), env: startEnv, stdio: ["ignore", log, log]
  });
  closeSync(log);
  const base = "http://127.0.0.1:" + port + "/api/revalidate";
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error("Next exited before serving HTTP");
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(1200) });
      if (response.status === 405) return { child, base };
    } catch { /* Next may still be starting */ }
    await new Promise(r => setTimeout(r, 200));
  }
  child.kill("SIGTERM");
  throw new Error("Next HTTP startup timed out");
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise(resolveStop => {
    const killTimer = setTimeout(() => child.kill("SIGKILL"), 3000);
    killTimer.unref();
    child.once("exit", () => { clearTimeout(killTimer); resolveStop(); });
    child.kill("SIGTERM");
  });
}

async function assertPost(base, name, expected, body, authorization = secret, options = {}) {
  const headers = { "content-type": "application/json" };
  if (authorization !== null) headers["x-revalidate-secret"] = authorization;
  const response = await fetch(base, {
    method: "POST", headers, body, signal: AbortSignal.timeout(15000), ...options,
  });
  const payload = await response.json();
  if (response.status !== expected ||
      payload.revalidated !== (expected === 200) ||
      (expected === 200 && !Array.isArray(payload.tags))) {
    throw new Error(name + ": unexpected HTTP status or response shape, status=" + response.status);
  }
  if (JSON.stringify(payload).includes(secret)) {
    throw new Error(name + ": secret accidentally reflected");
  }
  passed++;
  console.log("IR14 PASS HTTP " + name + " status=" + expected);
  return payload;
}

let live;
try {
  live = await launch(true);
  const validTags = [
    "products", "product-prod_123", "offers", "offer-off_456",
    "product-offers-prod_123", "collections", "collection-türkçe",
    "categories", "category-lastik-2026"
  ];
  const valid = await assertPost(live.base, "native event tag families", 200,
    JSON.stringify({ tags: validTags }));
  if (JSON.stringify(valid.tags) !== JSON.stringify(validTags)) {
    throw new Error("Native catalog tag order/families changed");
  }
  const duplicate = await assertPost(live.base, "legitimate duplicate tags", 200,
    JSON.stringify({ tags: ["products", "products", "offer-off_456"] }));
  if (JSON.stringify(duplicate.tags) !== JSON.stringify(["products", "offer-off_456"])) {
    throw new Error("Duplicate catalog tags not safely deduplicated");
  }

  await assertPost(live.base, "missing secret", 401,
    JSON.stringify({ tags: ["products"] }), null);
  await assertPost(live.base, "wrong secret", 401,
    JSON.stringify({ tags: ["products"] }), "synthetic-wrong-secret");
  await assertPost(live.base, "malformed JSON", 400, '{"tags":[');
  await assertPost(live.base, "empty payload", 400, "{}");
  await assertPost(live.base, "invalid tag types", 400,
    JSON.stringify({ tags: ["products", 1] }));
  await assertPost(live.base, "zero tags", 400,
    JSON.stringify({ tags: [] }));
  await assertPost(live.base, "cross-scope tag forbidden", 400,
    JSON.stringify({ tags: ["products", "person-abcdef"] }));
  await assertPost(live.base, "disallowed wildcard", 400,
    JSON.stringify({ tags: ["product-*"] }));
  await assertPost(live.base, "path-like suffix refused", 400,
    JSON.stringify({ tags: ["offer-abc/../../secret"] }));
  await assertPost(live.base, "too many tags even if repeated", 400,
    JSON.stringify({ tags: Array(129).fill("products") }));
  await assertPost(live.base, "single overlong catalog tag", 400,
    JSON.stringify({ tags: ["product-" + "a".repeat(257)] }));
  await assertPost(live.base, "oversized JSON body", 413,
    JSON.stringify({ tags: ["products"], filler: "x".repeat(33000) }));
  // Chunked transfer without Content-Length must still obey the byte limit.
  const chunked = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"tags":["products"],"padding":"'));
      controller.enqueue(new Uint8Array(33000).fill(65));
      controller.enqueue(new TextEncoder().encode('"}'));
      controller.close();
    }
  });
  await assertPost(live.base, "chunked oversized body", 413, chunked, secret,
    { duplex: "half" });
  // Ensure prior rejected requests did not poison service for normal events.
  await assertPost(live.base, "valid event after negatives", 200,
    JSON.stringify({ tags: ["products", "offers", "offer-off_789"] }));
} finally {
  await stop(live?.child);
}

let absent;
try {
  absent = await launch(false);
  await assertPost(absent.base, "server missing configured secret", 500,
    JSON.stringify({ tags: ["products"] }), secret);
} finally {
  await stop(absent?.child);
}
console.log("IR14 PASS: " + passed + " real isolated Next.js production HTTP cases, no database or external access");
