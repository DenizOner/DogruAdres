// Browser-only security check for the actual SellerHeading.tsx component.
// The child SellerInfo/Chat widgets are isolated. This is NOT a full Next.js page test.
import { build } from "esbuild";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const storefront = join(repo, "apps", "storefront");
const helper = join(storefront, "src/lib/helpers/sanitize-rich-text.ts");
const helperRequire = createRequire(helper);
const packageJson = helperRequire("sanitize-html/package.json");
const physical = helperRequire.resolve("sanitize-html");
if (packageJson.version !== "2.18.1") {
  throw new Error("Expected sanitize-html@2.18.1, resolved " + packageJson.version);
}
if (!process.env.RUNNER_TEMP) {
  throw new Error("Isolated GitHub runner temporary directory required");
}
const output = join(process.env.RUNNER_TEMP, "da-seller-heading-browser.js");

const entry = [
  'import React from "react";',
  'import { createRoot } from "react-dom/client";',
  'import { SellerHeading } from "./src/components/organisms/SellerHeading/SellerHeading";',
  'const mount = document.getElementById("app");',
  'if (!mount) throw Error("Synthetic mount not found");',
  'const root = createRoot(mount);',
  'window.__daRenderSeller = (description) => root.render(React.createElement(SellerHeading, {',
  '  header: true, user: null,',
  '  seller: { id: "sel_synthetic", handle: "synthetic", name: "Sentetik mağaza",',
  '    description, logo: null, email: "synthetic@example.invalid" }',
  '}));'
].join("\n");

const fixture = {
  name: "seller-heading-child-isolation",
  setup(plugin) {
    plugin.onResolve({ filter: /^@\/components\/molecules$/ }, () =>
      ({ path: "seller-info", namespace: "synthetic-child" }));
    plugin.onResolve({ filter: /^\.\.\/Chat\/Chat$/ }, () =>
      ({ path: "chat", namespace: "synthetic-child" }));
    plugin.onResolve({ filter: /^@medusajs\/ui$/ }, () =>
      ({ path: "unused-ui", namespace: "synthetic-child" }));
    plugin.onResolve({ filter: /^@\/lib\/helpers\/sanitize-rich-text$/ }, () =>
      ({ path: helper }));
    plugin.onLoad({ filter: /.*/, namespace: "synthetic-child" }, args => ({
      loader: "js",
      resolveDir: storefront,
      contents: args.path === "seller-info"
        ? 'import React from "react"; export const SellerInfo = ({seller}) => React.createElement("h2", null, seller.name);'
        : args.path === "chat"
          ? "export const Chat = () => null;"
          : "export const Button = () => null;"
    }));
  }
};

await build({
  absWorkingDir: storefront,
  stdin: { contents: entry, resolveDir: storefront, sourcefile: "seller-heading-browser-entry.tsx", loader: "tsx" },
  outfile: output,
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "chrome120",
  jsx: "automatic",
  plugins: [fixture],
  logLevel: "warning"
});

console.log("SOURCE: apps/storefront/src/components/organisms/SellerHeading/SellerHeading.tsx");
console.log("SANITIZER: " + physical + " (v" + packageJson.version + ")");
console.log("BROWSER BUNDLE: " + output);
console.log("SCOPE: Real SellerHeading component with synthetic SellerInfo/Chat; not full Next.js/HTTP acceptance");
