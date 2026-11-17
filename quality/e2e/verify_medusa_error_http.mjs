// #173 IR-15: branch-owned real Next.js + installed Mercur SDK HTTP confidentiality check.
// Disposable GitHub runner only. All credentials/PII markers are random synthetic bytes.
// The fixture is NEVER committed or deployed; no customer data, DB, payments or remote hosts.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.GITHUB_ACTIONS !== "true" ||
    process.env.GITHUB_EVENT_NAME !== "pull_request" ||
    process.env.GITHUB_HEAD_REF !== "fix/baris-173-medusa-error-redaction" ||
    !process.env.RUNNER_TEMP) {
  throw new Error("REFUSE IR15 diagnostics outside isolated #173 PR runner");
}

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const api = join(repo, "packages/api");
const storefront = join(repo, "apps/storefront");
const fixtureDir = join(storefront, "src/app/[locale]/auth/verify-email/ci-only-173");
const fixture = join(fixtureDir, "route.ts");
const markerFile = join(fixtureDir, ".ci173-owned");
const marker = "IR15-ephemeral-route-only-173";
const canary = "ci173_" + randomBytes(20).toString("hex");
const carriesCanary = text => String(text).toLowerCase().includes(canary.toLowerCase());
const logPath = join(process.env.RUNNER_TEMP, "ir15-next-synthetic.log");
let caseMode = "denied";
let upstreamHits = 0;
const backend = createHttpServer((req, res) => {
  upstreamHits++;
  if (caseMode === "socket") {
    req.socket.destroy();
    return;
  }
  const success = caseMode === "ok";
  const status = success ? 200 : caseMode === "forbidden" ? 403 : 500;
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-ci173-synthetic-private-header": canary,
  });
  res.end(JSON.stringify(success
    ? { regions: [{ id: "reg_synthetic", name: "Synthetic" }] }
    : { message: "Synthetic upstream error " + canary }));
});
await new Promise((ok, fail) => {
  backend.once("error", fail);
  backend.listen(0, "127.0.0.1", ok);
});
const backendAddr = backend.address();
if (!backendAddr || typeof backendAddr !== "object") throw new Error("No loopback backend port");

const env = {
  ...process.env,
  CI: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  CI173_CANARY: canary,
  MEDUSA_BACKEND_URL: "http://127.0.0.1:" + backendAddr.port,
  NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: "ci173-synthetic-not-a-real-key",
  NEXT_PUBLIC_DEFAULT_REGION: "tr",
};
if (existsSync(fixtureDir)) throw new Error("IR15 fixture path already exists; refuse overwrite");
mkdirSync(fixtureDir, { recursive: true });

const source = [
  'import medusaError from "@/lib/helpers/medusa-error";',
  'import { sdk } from "@/lib/client";',
  'export const dynamic = "force-dynamic";',
  'export async function GET(request: Request) {',
  '  const testCase = new URL(request.url).searchParams.get("case");',
  '  try {',
  '    if (testCase === "raw-response") {',
  '      medusaError({ response: { status: 500, data: { message: "Synthetic private payload " + process.env.CI173_CANARY }, headers: { authorization: process.env.CI173_CANARY } } });',
  '    } else if (testCase === "string-response") {',
  '      medusaError({ response: { status: 400, data: "Synthetic private payload " + process.env.CI173_CANARY } });',
  '    } else if (testCase === "setup") {',
  '      medusaError(new Error(process.env.CI173_CANARY));',
  '    } else if (testCase === "request") {',
  '      medusaError({ request: { url: process.env.CI173_CANARY } });',
  '    } else {',
  '      await sdk.store.regions.query({ fetchOptions: { cache: "no-store" } });',
  '      return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });',
  '    }',
  '    return Response.json({ unexpected: true }, { status: 500 });',
  '  } catch (error) {',
  '    let message = "Request failed";',
  '    if (["raw-response", "string-response", "setup", "request"].includes(testCase || "")) {',
  '      // For direct helper inputs inspect its first thrown Error, without wrapping twice.',
  '      message = error instanceof Error ? error.message : "Request failed";',
  '    } else {',
  '      // SDK failures are passed to the actual project helper exactly once.',
  '      try { medusaError(error); } catch (safeError) {',
  '        message = safeError instanceof Error ? safeError.message : "Request failed";',
  '      }',
  '    }',
  '    // This synthetic route intentionally exposes the caught Error message',
  '    // to ASSERT that it has already been sanitized by the actual helper.',
  '    // Never ship the fixture: its source is removed before CI completes.',
  '    return Response.json({ ok: false, message }, { headers: { "cache-control": "no-store" } });',
  '  }',
  '}',
].join("\n");
writeFileSync(markerFile, marker, { flag: "wx" });
writeFileSync(fixture, source, { flag: "wx" });

function ownedCleanup() {
  if (existsSync(markerFile) && readFileSync(markerFile, "utf8") === marker) {
    rmSync(fixtureDir, { recursive: true, force: false });
  } else {
    throw new Error("REFUSE: IR15 temporary fixture marker changed");
  }
}
const compile = [
  ["Mercur installed codegen", "bun", ["run", "codegen"], api, 180000],
  ["Storefront TypeScript", "node",
    ["../../node_modules/typescript/bin/tsc", "--noEmit", "--incremental", "false", "-p", "tsconfig.json"], storefront, 180000],
  ["Storefront ESLint", "node",
    ["../../node_modules/eslint/bin/eslint.js", ".", "--max-warnings", "0"], storefront, 180000],
  ["Storefront real Next production build", "bun", ["run", "build"], storefront, 360000],
];

try {
  for (const [label, exe, args, cwd, timeout] of compile) {
    const result = spawnSync(exe, args, {
      cwd, env, encoding: "utf8", timeout, maxBuffer: 12 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) {
      // CI uses only synthetic environment; still never print canary or request headers.
      throw new Error("IR15 build FAIL: " + label + " exit=" + result.status +
        (result.error ? " process failed" : ""));
    }
    console.log("IR15 PASS build: " + label);
  }
} finally {
  ownedCleanup();
}

const candidates = [
  join(storefront, ".next/standalone/apps/storefront/server.js"),
  join(storefront, ".next/standalone/server.js"),
].filter(existsSync);
if (candidates.length !== 1) throw new Error("IR15 needs exactly one production Next standalone server");

const freePort = async () => {
  const server = createTcpServer();
  await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", ok);
  });
  const addr = server.address();
  if (!addr || typeof addr !== "object") throw new Error("IR15 port");
  await new Promise(ok => server.close(ok));
  return addr.port;
};
const port = await freePort();
const entry = candidates[0];
const fd = openSync(logPath, "w", 0o600);
const next = spawn(process.execPath, [entry], {
  cwd: dirname(entry),
  env: { ...env, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(port) },
  stdio: ["ignore", fd, fd],
});
closeSync(fd);
const base = "http://127.0.0.1:" + port + "/tr/auth/verify-email/ci-only-173";

async function waitReady() {
  for (let i = 0; i < 120; i++) {
    if (next.exitCode !== null) throw new Error("IR15 production Next exited early");
    try {
      const res = await fetch(base + "?case=request", { signal: AbortSignal.timeout(1100) });
      if (res.status === 200) return;
    } catch { /* server booting */ }
    await new Promise(ok => setTimeout(ok, 250));
  }
  throw new Error("IR15 production Next route did not start");
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise(ok => {
    const t = setTimeout(() => child.kill("SIGKILL"), 3000);
    t.unref();
    child.once("exit", () => { clearTimeout(t); ok(); });
    child.kill("SIGTERM");
  });
}
let passed = 0;
async function check(name, shouldSucceed = false) {
  const response = await fetch(base + "?case=" + name, { signal: AbortSignal.timeout(12000) });
  if (response.status !== 200) throw new Error("IR15 Next returned unexpected HTTP status for " + name + ": " + response.status);
  const data = await response.json();
  if (data.ok !== shouldSucceed || typeof data.message === (shouldSucceed ? "string" : "undefined")) {
    // For successful response, no error message is expected.
    throw new Error("IR15 unexpected synthetic Next payload shape " + name);
  }
  if (!shouldSucceed && (!data.message || carriesCanary(data.message))) {
    throw new Error("IR15 FAIL: unsanitized upstream marker in caught Error for " + name);
  }
  const fixedMessages = {
    "raw-response": "Request failed",
    "string-response": "Request failed",
    "setup": "Error setting up the request",
    "request": "No response received",
  };
  if (Object.prototype.hasOwnProperty.call(fixedMessages, name) &&
      data.message !== fixedMessages[name]) {
    throw new Error("IR15 FAIL: unexpected normalized error type for " + name);
  }
  passed++;
  console.log("IR15 PASS real Next production HTTP: " + name);
}
try {
  await waitReady();
  await check("raw-response");
  await check("string-response");
  await check("setup");
  await check("request");
  caseMode = "forbidden";
  await check("sdk-403");
  caseMode = "denied";
  await check("sdk-500");
  caseMode = "socket";
  await check("sdk-socket");
  caseMode = "ok";
  await check("sdk-success", true);
  if (upstreamHits < 4) throw new Error("IR15 real Mercur SDK did not reach loopback backend");
} finally {
  await stop(next);
  await new Promise(ok => backend.close(ok));
}
// The test-only raw upstream header and body must never appear in Next logs.
if (carriesCanary(readFileSync(logPath, "utf8"))) {
  throw new Error("IR15 FAIL: synthetic upstream private marker entered Next server logs");
}
console.log("IR15 PASS: " + passed + " real Next/Mercur SDK/127.0.0.1 cases and sanitized server log; no protected data");