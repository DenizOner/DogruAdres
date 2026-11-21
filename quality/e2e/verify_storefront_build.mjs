// Scoped existing-runner Storefront diagnostics for #374 / PR #388.
// No new workflow, service, DB, worktree, paid tool, or persistent artifact.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const api = join(repo, "packages", "api");
const storefront = join(repo, "apps", "storefront");
if (
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.GITHUB_EVENT_NAME !== "pull_request" ||
  !["fix/baris-374-chip-keyboard-filters", "fix/baris-374-filter-dialog-keyboard"].includes(process.env.GITHUB_HEAD_REF) ||
  !process.env.RUNNER_TEMP
) {
  throw new Error("Refuse Storefront diagnostics outside the exact task-owned GitHub PR runner");
}

const env = {
  ...process.env,
  CI: "1",
  NEXT_TELEMETRY_DISABLED: "1",
};
// Test-only route compiled into this PR runner's production build; never committed.
// The special auth/verify-email path uses the application's existing public
// middleware exception, without touching Medusa, users, stores or shared DB.
const fixtureDir = join(storefront, "src/app/[locale]/auth/verify-email/ci-only-374");
const fixtureFile = join(fixtureDir, "page.tsx");
const fixtureMarker = join(fixtureDir, ".owned-ci374");
const marker = "PR388-ephemeral-next-http-fixture-374";
if (existsSync(fixtureDir)) {
  throw new Error("REFUSE: CI fixture target already exists; no overwrite or cleanup");
}
mkdirSync(fixtureDir, { recursive: true });
writeFileSync(fixtureMarker, marker);
writeFileSync(fixtureFile, [
  '"use client";',
  'import { Suspense } from "react";',
  'import { useSearchParams } from "next/navigation";',
  'import { SizeFilter } from "@/components/cells/SizeFilter/SizeFilter";',
  'import { ActiveFilterElement } from "@/components/cells/ActiveFilterElement/ActiveFilterElement";',
  'import { ProductSearchSidebar } from "@/components/organisms/ProductSearchSidebar/ProductSearchSidebar";',
  'function LiveFilters() {',
  '  const search = useSearchParams();',
  '  const size = search.get("size");',
  '  return <main data-testid="ci374-real-next-route">',
  '    <h1>Isolated keyboard filter fixture — not a catalog page</h1>',
  '    <SizeFilter />',
  '    {size ? <ActiveFilterElement filter={["size", size]} /> : null}',
  '    <ProductSearchSidebar facets={{attributes:{size:[{value:"M",count:2},{value:"L",count:2}],color:[{value:"Red",count:2}]}}} />',
  '  </main>;',
  '}',
  'export default function Page() {',
  '  return <Suspense fallback={<div>Loading synthetic filters</div>}><LiveFilters /></Suspense>;',
  '}'
].join("\n"), { flag: "wx" });
console.log("STORE374 FIXTURE: temporary Next route, never checked in; no Medusa, identity, DB or payment");

const checks = [
  {
    label: "Mercur existing route codegen (disposable runner)",
    exe: "bun",
    args: ["run", "codegen"],
    cwd: api,
    timeout: 180000,
  },
  {
    label: "Storefront TypeScript --noEmit",
    exe: "node",
    args: ["../../node_modules/typescript/bin/tsc", "--noEmit", "--incremental", "false", "-p", "tsconfig.json"],
    cwd: storefront,
    timeout: 180000,
  },
  {
    label: "Storefront ESLint zero warnings",
    exe: "node",
    args: ["../../node_modules/eslint/bin/eslint.js", ".", "--max-warnings", "0"],
    cwd: storefront,
    timeout: 180000,
  },
  {
    label: "Storefront Next.js production build",
    exe: "bun",
    args: ["run", "build"],
    cwd: storefront,
    timeout: 360000,
  },
];

try {
  for (const check of checks) {
  console.log("STORE374 START: " + check.label);
  const result = spawnSync(check.exe, check.args, {
    cwd: check.cwd,
    env,
    encoding: "utf8",
    timeout: check.timeout,
    maxBuffer: 12 * 1024 * 1024,
    windowsHide: true,
  });
  const passed = !result.error && result.status === 0;
  console.log("STORE374 " + (passed ? "PASS" : "FAIL") + ": " + check.label + " exit=" + String(result.status));
  if (!passed) {
    // Print only a bounded excerpt of diagnostic output from the disposable test runner.
    // There must be no real-user data or production credentials in this synthetic CI job.
    const output = [result.stdout ?? "", result.stderr ?? ""].join("\n");
    console.error(output.slice(-16000));
    if (result.error) console.error("STORE374 process error: " + String(result.error.message));
    throw new Error("STORE374 test failed: " + check.label);
  }
}
console.log("STORE374 PASS: codegen, TypeScript, zero-warning ESLint and Next.js production build");
} finally {
  // Only remove the directory created by this single CI runner and only when
  // its ownership marker exactly matches. Never touch existing user files.
  if (existsSync(fixtureMarker) && readFileSync(fixtureMarker, "utf8") === marker) {
    rmSync(fixtureDir, { recursive: true, force: false });
    console.log("STORE374 FIXTURE REMOVED: CI-only route source");
  } else {
    throw new Error("REFUSE: fixture ownership marker changed; do not delete");
  }
}
