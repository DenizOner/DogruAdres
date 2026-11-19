// #376: first-arrival verification bearer privacy on REAL Next production HTTP.
// Fail-first test source only. The fixture has no real Person, email, token,
// native Medusa auth, PostgreSQL, Chrome or protected resource access.
// A task-only, explicitly approved free CI runner must execute this file;
// being present in a PR does NOT mean this scenario ran.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const branch = "test/emre-376-verify-email-initial-privacy-20261119";
if (process.env.GITHUB_ACTIONS !== "true" ||
    process.env.GITHUB_REPOSITORY !== "DenizOner/DogruAdres" ||
    process.env.GITHUB_EVENT_NAME !== "pull_request" ||
    process.env.GITHUB_HEAD_REF !== branch ||
    process.env.DA_EMRE376_TASK_LEASE !== "verified-free-disposable-next" ||
    !process.env.GITHUB_WORKSPACE || !process.env.RUNNER_TEMP) {
  throw new Error("REFUSED: #376 requires an explicitly leased, task-only PR runner");
}
const [major, minor] = process.versions.node.split(".").map(Number);
assert.ok(major > 22 || (major === 22 && minor >= 22),
  "REFUSED: run the production Next test with supported Node >=22.22.0");

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
assert.equal(resolve(process.env.GITHUB_WORKSPACE), repo,
  "REFUSED: GitHub workspace must be the exact checked-out repository");
assert.ok(!resolve(process.env.RUNNER_TEMP).startsWith(repo + "/"),
  "REFUSED: temporary runner evidence directory must be outside the repository");

const storefront = join(repo, "apps/storefront");
const api = join(repo, "packages/api");
const requireStorefront = createRequire(join(storefront, "package.json"));
const nextBin = requireStorefront.resolve("next/dist/bin/next");

function listen(server) {
  return new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", fail);
      ok(server.address().port);
    });
  });
}
function close(server) {
  return new Promise(ok => {
    server.closeAllConnections?.();
    server.close(ok);
  });
}
const sleep = ms => new Promise(ok => setTimeout(ok, ms));
async function reservePort() {
  const server = createServer((_req, res) => res.writeHead(503).end());
  const port = await listen(server);
  await close(server);
  return port;
}
function runBuild(label, command, args, cwd, env, limitMs) {
  return new Promise((ok, fail) => {
    const child = spawn(command, args, {
      cwd, env, stdio: ["ignore", "pipe", "pipe"],
    });
    // Intentionally suppress raw build logs. This report must never print
    // request URLs, tokens, credentials or process environment values.
    child.stdout.on("data", () => {});
    child.stderr.on("data", () => {});
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      child.kill("SIGTERM");
      finish(false);
    }, limitMs);
    function finish(success) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (success) ok();
      else fail(new Error("FAIL #376: " + label + " (inspect restricted CI logs)"));
    }
    child.on("error", () => finish(false));
    child.on("close", code => finish(code === 0));
  });
}
const backend = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET" && req.url?.split("?")[0] === "/store/regions") {
    res.writeHead(200);
    res.end(JSON.stringify({
      regions: [{ id: "reg_emre376", name: "Disposable TR", currency_code: "try",
        countries: [{ iso_2: "tr", display_name: "Türkiye" }] }],
    }));
    return;
  }
  // No native authorization, verification state, real user or commerce data.
  res.writeHead(401);
  res.end(JSON.stringify({ message: "Synthetic backend denied" }));
});

let backendStarted = false;
let next = null;
let nextLog = "";
try {
  const backendPort = await listen(backend);
  backendStarted = true;
  const env = {
    ...process.env,
    CI: "true",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "production",
    NEXT_PUBLIC_DEFAULT_REGION: "tr",
    MEDUSA_BACKEND_URL: "http://127.0.0.1:" + backendPort,
    // Deliberate production fail-closed configuration: the client rejects
    // loopback as an auth bearer destination; this test ONLY inspects HTML.
    NEXT_PUBLIC_MEDUSA_BACKEND_URL: "http://127.0.0.1:" + backendPort,
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: "pk_emre376_synthetic",
    NEXT_PUBLIC_BASE_URL: "http://127.0.0.1",
    NEXT_PUBLIC_SITE_NAME: "DoğruAdres",
  };
  await runBuild("installed Mercur codegen", "bun", ["run", "codegen"], api, env, 180000);
  await runBuild("real Next production build", "bun", ["run", "build"],
    storefront, env, 360000);

  const port = await reservePort();
  const origin = "http://127.0.0.1:" + port;
  next = spawn(process.execPath,
    [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd: storefront, env, stdio: ["ignore", "pipe", "pipe"] });
  const collect = chunk => {
    // In-memory only; no raw Next request output or URL is published.
    nextLog = (nextLog + String(chunk)).slice(-1024 * 1024);
  };
  next.stdout.on("data", collect);
  next.stderr.on("data", collect);
  next.on("error", () => {});

  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (next.exitCode !== null) break;
    try {
      const response = await fetch(origin + "/tr/auth/verify-email", {
        redirect: "manual", signal: AbortSignal.timeout(1500),
      });
      if (response.status === 200) { ready = true; break; }
    } catch {
      // Next production start can take a few seconds.
    }
    await sleep(250);
  }
  assert.ok(ready, "FAIL #376: real Next production verification route did not start");

  const makeBearer = label => "da376-" + label + "-" + randomBytes(18).toString("hex");
  // These are deliberately synthetic *first-landing shapes*, not proof of
  // native Medusa pending/expired/replay token or real account state.
  const bearerCases = ["pending-shape", "invalid-shape", "expired-shape", "replay-shape"]
    .map(label => ({ label, bearer: makeBearer(label) }));
  const paths = [
    { label: "no-token", path: "/tr/auth/verify-email" },
    { label: "unlocalized", path: "/auth/verify-email?token=" + bearerCases[0].bearer },
    ...bearerCases.map(x => ({
      label: x.label, path: "/tr/auth/verify-email?token=" + x.bearer,
    })),
  ];
  const secrets = bearerCases.map(x => x.bearer);

  for (const entry of paths) {
    const response = await fetch(origin + entry.path, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "DA-EMRE376-disposable-http" },
    });
    assert.equal(response.status, 200,
      "FAIL #376: first Next landing must render without an external redirect");
    assert.ok((response.headers.get("content-type") ?? "").includes("text/html"),
      "FAIL #376: expected real HTML from Next, not a mocked JSON response");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer",
      "FAIL #376: initial Next HTML response must block Referer disclosure");
    assert.ok(/(?:^|,|\s)no-store(?:,|\s|$)/i.test(
      response.headers.get("cache-control") ?? ""),
    "FAIL #376: initial Next HTML response must explicitly prohibit storage");
    assert.ok(!response.headers.has("location"),
      "FAIL #376: first bearer landing must not redirect");
    assert.ok(!response.headers.has("set-cookie"),
      "FAIL #376: anonymous landing must not issue an auth cookie");

    const html = await response.text();
    assert.ok(html.includes("DoğruAdres") || html.includes("DogruAdres"),
      "FAIL #376: real verification page branding absent");
    // Include all headers, not only Location: Next internal rewrite headers
    // must not reflect a one-time bearer to the browser or intermediaries.
    const headerValues = [...response.headers].map(([, value]) => value);
    for (const secret of secrets) {
      assert.ok(!html.includes(secret),
        "FAIL #376: one-time bearer reflected in first HTML");
      assert.ok(headerValues.every(value => !value.includes(secret)),
        "FAIL #376: one-time bearer reflected in first response headers");
    }
    console.log("EMRE376 FIRST-LANDING PASS: " + entry.label);
  }

  for (const secret of secrets) {
    assert.ok(!nextLog.includes(secret),
      "FAIL #376: initial bearer appeared in task Next process stdout/stderr");
  }
  console.log("EMRE376 PASS: first landing no-store/no-referrer/no redirect, no bearer HTML/headers/process logs");
  console.log("EMRE376 SCOPE: native token lifecycle, Chrome, PG16, production proxy/CDN logs NOT TESTED");
} finally {
  if (next && next.exitCode === null) {
    next.kill("SIGTERM");
    await Promise.race([
      new Promise(ok => next.once("exit", ok)),
      sleep(3000),
    ]);
    if (next.exitCode === null) next.kill("SIGKILL");
  }
  if (backendStarted) await close(backend);
}
