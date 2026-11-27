// #243: task-only real Next production HTTP test for closed B4B public demo routes.
// A synthetic local region bootstrap is NOT Medusa authorization or production data.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.GITHUB_ACTIONS !== "true" ||
    process.env.GITHUB_EVENT_NAME !== "pull_request" ||
    process.env.GITHUB_HEAD_REF !== "fix/baris-243-anon-b4b-guest-deny" ||
    !process.env.RUNNER_TEMP) {
  throw new Error("Refuse #243 HTTP run outside its exact isolated GitHub PR runner");
}

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const api = join(repo, "packages/api");
const storefront = join(repo, "apps/storefront");
const requireFromStorefront = createRequire(join(storefront, "package.json"));
const nextBin = requireFromStorefront.resolve("next/dist/bin/next");
const regionServer = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET" && req.url?.split("?")[0] === "/store/regions") {
    res.writeHead(200);
    res.end(JSON.stringify({
      regions: [{ id: "reg_task_only", name: "Task-only TR", currency_code: "try",
        countries: [{ iso_2: "tr", display_name: "Türkiye" }] }]
    }));
    return;
  }
  // No catalog, Buyer, Store, Offer, account or real credential data exists here.
  res.writeHead(401);
  res.end(JSON.stringify({ message: "Synthetic backend: denied" }));
});
const listen = server => new Promise((resolvePromise, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    server.off("error", reject);
    resolvePromise(server.address().port);
  });
});
const close = server => new Promise(resolvePromise => {
  server.closeAllConnections?.();
  server.close(() => resolvePromise());
});
const run = (label, exe, args, cwd, env, timeout) => new Promise((resolvePromise, reject) => {
  const child = spawn(exe, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  const append = chunk => { output = (output + chunk.toString()).slice(-12000); };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  let ended = false;
  const finish = (error) => {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    if (error) reject(new Error(label + ": " + error + "\n" + output.slice(-4000)));
    else {
      console.log("B4B243 PASS: " + label);
      resolvePromise();
    }
  };
  const timer = setTimeout(() => {
    child.kill("SIGTERM");
    finish("timeout");
  }, timeout);
  child.on("error", error => finish(error.message));
  child.on("close", code => finish(code === 0 ? null : "exit=" + code));
});
const reservePort = async () => {
  const server = createServer((req, res) => { res.writeHead(503); res.end(); });
  const port = await listen(server);
  await close(server);
  return port;
};
const delay = ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms));
const fetchLocal = async (origin, path) => fetch(origin + path, {
  redirect: "manual",
  signal: AbortSignal.timeout(5000),
  headers: { "User-Agent": "DA-B4B243-task-only-guest" },
});

let frontend;
let backendStarted = false;
try {
  const backendPort = await listen(regionServer);
  backendStarted = true;
  const env = {
    ...process.env,
    CI: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    MEDUSA_BACKEND_URL: "http://127.0.0.1:" + backendPort,
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: "pk_task_only_243",
    NEXT_PUBLIC_DEFAULT_REGION: "us", // intentionally absent from backend regions
    NEXT_PUBLIC_BASE_URL: "http://127.0.0.1",
    NEXT_PUBLIC_SITE_NAME: "DoğruAdres",
  };
  await run("Mercur existing codegen", "bun", ["run", "codegen"], api, env, 180000);
  await run("Storefront TypeScript", process.execPath,
    ["../../node_modules/typescript/bin/tsc", "--noEmit", "--incremental", "false", "-p", "tsconfig.json"],
    storefront, env, 180000);
  await run("Storefront ESLint zero warnings", process.execPath,
    ["../../node_modules/eslint/bin/eslint.js", ".", "--max-warnings", "0"],
    storefront, env, 180000);
  await run("Storefront Next production build", "bun", ["run", "build"],
    storefront, env, 360000);

  const port = await reservePort();
  const origin = "http://127.0.0.1:" + port;
  frontend = spawn(process.execPath,
    [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd: storefront, env, stdio: ["ignore", "pipe", "pipe"] });
  let startLog = "";
  const append = chunk => { startLog = (startLog + chunk.toString()).slice(-2500); };
  frontend.stdout.on("data", append);
  frontend.stderr.on("data", append);
  frontend.on("error", error => { startLog += error.message; });

  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (frontend.exitCode !== null) break;
    try {
      const response = await fetchLocal(origin, "/tr/products/task-only");
      if (response.status === 307) {
        ready = true;
        break;
      }
    } catch {
      // A real Next process may need time to start its listener.
    }
    await delay(250);
  }
  assert.ok(ready, "Next production startup/guest gate failed: " + startLog.slice(-1000));

  const blocked = [
    "/", "/tr", "/tr/", "/us", "/us/products/task-only",
    "/tr/products/task-only", "/%74r/products/synthetic.jpg",
    "/%74r/products/task-only", "/tr/categories", "/tr/categories/task-only",
    "/tr/collections/task-only",
    "/tr/cart", "/tr/checkout", "/tr/order/task-only/confirmed",
    "/tr/products/synthetic.jpg", "/tr/products/task-only?token=not-a-real-token"
  ];
  for (const path of blocked) {
    let response = await fetchLocal(origin, path);
    if (response.status === 308) {
      // Next may first canonicalize a trailing slash. That response must
      // still be local, body-free of commerce data and lead to the same gate.
      const canonical = new URL(response.headers.get("location"), origin);
      assert.equal(canonical.protocol, "http:");
      assert.equal(canonical.port, String(port));
      assert.ok(["localhost", "127.0.0.1"].includes(canonical.hostname));
      const expected = path.replace(/\/$/, "") || "/";
      assert.ok([expected, decodeURIComponent(expected)].includes(canonical.pathname),
        "Next 308 only canonicalizes the path, never bypasses its B4B guard");
      assert.doesNotMatch(await response.text(), /Mercur B2C|Snag your style|trending listings/i);
      response = await fetchLocal(origin, canonical.pathname + canonical.search);
    }
    assert.equal(response.status, 307, "Closed commerce route must redirect: " + path);
    const location = new URL(response.headers.get("location"), origin);
    // Next production normalizes its own loopback Host to "localhost".
    // Accept ONLY same-port loopback aliases, never a remote/open redirect.
    assert.equal(location.protocol, "http:");
    assert.equal(location.port, String(port));
    assert.ok(["127.0.0.1", "localhost"].includes(location.hostname),
      "Redirect escaped the task-only loopback origin");
    assert.equal(location.pathname, "/tr/login", "Use supported region when default is absent");
    assert.equal(location.search, "", "No query or bearer token copied to login");
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    const html = await response.text();
    assert.doesNotMatch(html, /Mercur B2C|Snag your style|trending listings|Shop By Category/i);
  }
  console.log("B4B243 PASS: " + blocked.length + " production HTTP demo-route denials, noindex and no-store");

  // #243 must not break the already accepted B22 Seller rename 404/200 path.
  // The synthetic backend has no Seller, so a former/unknown handle is 404.
  const sellerNotFound = await fetchLocal(origin, "/tr/sellers/task-only");
  assert.equal(sellerNotFound.status, 404,
    "Existing Seller handle route must keep 404 instead of login redirect");
  assert.doesNotMatch(await sellerNotFound.text(), /Snag your style|trending listings/i);
  console.log("B4B243 PASS: Seller old-handle 404 remains, no login redirect");

  const protectedUser = await fetchLocal(origin, "/tr/user/orders");
  assert.equal(protectedUser.status, 307);
  const protectedLocation = new URL(protectedUser.headers.get("location"), origin);
  assert.equal(protectedLocation.pathname, "/tr/login");
  assert.equal(protectedLocation.searchParams.get("sessionRequired"), "true");
  console.log("B4B243 PASS: existing protected /user session-required redirect preserved");

  const login = await fetchLocal(origin, "/tr/login");
  assert.equal(login.status, 200, "Existing real login page must remain accessible");
  assert.equal(new URL(login.url).pathname, "/tr/login");
  console.log("B4B243 PASS: existing real login page available");

  const verification = await fetchLocal(origin, "/tr/auth/verify-email");
  assert.equal(verification.status, 200, "Public email verification page must remain reachable");
  console.log("B4B243 PASS: public verification route not caught by demo gate");
} finally {
  if (frontend && frontend.exitCode === null) {
    frontend.kill("SIGTERM");
    await Promise.race([
      new Promise(resolvePromise => frontend.once("exit", resolvePromise)),
      delay(3000)
    ]);
    if (frontend.exitCode === null) frontend.kill("SIGKILL");
  }
  if (backendStarted) await close(regionServer);
}
