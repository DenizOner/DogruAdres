// #173 IR-15 phase 2: real Storefront RootLayout / Mercur SDK error-log confidentiality.
// Existing free, disposable GitHub PR runner ONLY. No real credentials or buyer data.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { closeSync, existsSync, openSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const branch = "fix/baris-173-cart-raw-error-log";
if (process.env.GITHUB_ACTIONS !== "true" ||
    process.env.GITHUB_EVENT_NAME !== "pull_request" ||
    process.env.GITHUB_HEAD_REF !== branch || !process.env.RUNNER_TEMP) {
  throw new Error("REFUSE IR15 Cart diagnostic outside approved disposable PR runner");
}
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const storefront = join(repo, "apps/storefront");
const api = join(repo, "packages/api");
const canary = "ci173_private_" + randomBytes(24).toString("hex");
const sessionMarker = "ci173_auth_" + randomBytes(18).toString("hex");
const logPath = join(process.env.RUNNER_TEMP, "ir15-cart-next-private.log");
const carried = text => {
  const value = String(text).toLowerCase();
  return value.includes(canary.toLowerCase()) || value.includes(sessionMarker.toLowerCase());
};
let cartRequests = 0;
let customerRequests = 0;
let mode = "500";
const backend = createHttpServer((req, res) => {
  const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
  if (/^\/store\/carts\/cart_ci173_synthetic$/.test(pathname) && req.method === "GET") {
    cartRequests++;
    if (mode === "socket") {
      req.socket.destroy();
      return;
    }
    const status = mode === "401" ? 401 : 500;
    res.writeHead(status, {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-ci173-private-header": canary,
    });
    res.end(JSON.stringify({ message: "Untrusted synthetic cart failure " + canary }));
    return;
  }
  if (pathname === "/store/customers/me") {
    customerRequests++;
    res.writeHead(401, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ message: "Synthetic unauthenticated customer" }));
    return;
  }
  if (pathname === "/store/regions") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ regions: [] }));
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ message: "Synthetic not found" }));
});
await new Promise((ok, fail) => {
  backend.once("error", fail);
  backend.listen(0, "127.0.0.1", ok);
});
const addr = backend.address();
if (!addr || typeof addr !== "object") throw new Error("IR15 missing synthetic backend port");

const env = {
  ...process.env,
  CI: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  MEDUSA_BACKEND_URL: "http://127.0.0.1:" + addr.port,
  NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: "pk_ci173_synthetic",
  NEXT_PUBLIC_DEFAULT_REGION: "tr",
  NEXT_PUBLIC_SITE_NAME: "CI synthetic test",
  NEXT_PUBLIC_BASE_URL: "http://127.0.0.1",
};
const commands = [
  ["Mercur installed codegen", "bun", ["run", "codegen"], api, 180000],
  ["Storefront TypeScript", process.execPath,
    ["../../node_modules/typescript/bin/tsc", "--noEmit", "--incremental", "false", "-p", "tsconfig.json"],
    storefront, 180000],
  ["Storefront ESLint", process.execPath,
    ["../../node_modules/eslint/bin/eslint.js", ".", "--max-warnings", "0"],
    storefront, 180000],
  ["Storefront Next.js production build", "bun", ["run", "build"], storefront, 360000],
];
let next = null;
let port = null;
function readPrivateLog() {
  return existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
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
const cookieHead = "_medusa_cache_id=ci173_private_cache_id";
const cookieCart = cookieHead + "; _medusa_cart_id=cart_ci173_synthetic" +
  "; _medusa_jwt=" + sessionMarker;
try {
  for (const [label, exe, args, cwd, timeout] of commands) {
    const run = spawnSync(exe, args, {
      cwd, env, encoding: "utf8", timeout, maxBuffer: 12 * 1024 * 1024,
    });
    // Never copy backend error bodies, private request headers, logs or tokens
    // into public CI output, even when a build step fails.
    if (run.error || run.status !== 0) {
      throw new Error("IR15 FAIL build " + label + " status " + String(run.status));
    }
    console.log("IR15 PASS build " + label);
  }
  const entries = [
    join(storefront, ".next/standalone/apps/storefront/server.js"),
    join(storefront, ".next/standalone/server.js"),
  ].filter(existsSync);
  if (entries.length !== 1) throw new Error("IR15 FAIL ambiguous Next standalone entry");
  const listener = createTcpServer();
  await new Promise((ok, fail) => {
    listener.once("error", fail);
    listener.listen(0, "127.0.0.1", ok);
  });
  const listenerAddr = listener.address();
  if (!listenerAddr || typeof listenerAddr !== "object") throw new Error("IR15 missing Next port");
  port = listenerAddr.port;
  await new Promise(ok => listener.close(ok));
  const fd = openSync(logPath, "w", 0o600);
  next = spawn(process.execPath, [entries[0]], {
    cwd: dirname(entries[0]),
    env: { ...env, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(port) },
    stdio: ["ignore", fd, fd],
  });
  closeSync(fd);
  const url = "http://127.0.0.1:" + port + "/tr/login";
  async function get(cookie) {
    return fetch(url, {
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(12000),
      redirect: "manual",
    });
  }
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (next.exitCode !== null) throw new Error("IR15 FAIL Next terminated before startup");
    try {
      const resp = await get(cookieHead);
      if (resp.status === 200) {
        await resp.arrayBuffer();
        ready = true;
        break;
      }
    } catch { /* Next is not ready yet */ }
    await new Promise(ok => setTimeout(ok, 250));
  }
  if (!ready) throw new Error("IR15 FAIL real Login RootLayout did not reach HTTP200");
  if (cartRequests !== 0) throw new Error("IR15 FAIL no-cart-cookie path queried native Cart");
  console.log("IR15 PASS real Next login with no Cart cookie, no native Cart request");

  for (const nextMode of ["401", "500", "socket"]) {
    mode = nextMode;
    const before = cartRequests;
    const page = await get(cookieCart);
    const html = await page.text();
    if (page.status !== 200) throw new Error("IR15 FAIL RootLayout response not 200 for " + nextMode);
    if (cartRequests <= before) throw new Error("IR15 FAIL fake legacy Cart API was not exercised for " + nextMode);
    if (carried(html)) throw new Error("IR15 FAIL synthetic private Cart marker in HTML " + nextMode);
    console.log("IR15 PASS real Next RootLayout cart SDK " + nextMode + " denied without HTML leak");
  }
  if (cartRequests !== 3) throw new Error("IR15 FAIL expected three native Cart requests");
  if (customerRequests < 1) throw new Error("IR15 FAIL Next login did not exercise native Customer check");
  const serverLog = readPrivateLog();
  if (carried(serverLog)) {
    throw new Error("IR15 FAIL: synthetic upstream private marker entered Next server logs");
  }
  if (serverLog.includes("Failed to retrieve cart")) {
    throw new Error("IR15 FAIL: raw Cart SDK error logging remains in RootLayout");
  }
  console.log("IR15 PASS: 3 synthetic native Cart 401/500/socket failures, real Next RootLayout/HTTP, no private message/header/token in response or server log");
} finally {
  await stop(next);
  await new Promise(ok => backend.close(ok));
}
