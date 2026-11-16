// Browser exercise of actual Chip and ActiveFilterElement components.
// Next.js URL hook and app context are deliberately synthetic. Not full E2E.
import { build } from "esbuild";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.RUNNER_TEMP) {
  throw new Error("Isolated GitHub runner temporary directory required");
}
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const storefront = join(repo, "apps", "storefront");
const actualChip = join(storefront, "src/components/atoms/Chip/Chip.tsx");
const output = join(process.env.RUNNER_TEMP, "da-chip-keyboard-browser.js");

const entry = [
  'import React from "react";',
  'import { createRoot } from "react-dom/client";',
  'import { Chip } from "./src/components/atoms/Chip/Chip";',
  'import { ActiveFilterElement } from "./src/components/cells/ActiveFilterElement/ActiveFilterElement";',
  'const chipRoot = createRoot(document.getElementById("chip"));',
  'const filterRoot = createRoot(document.getElementById("filters"));',
  'window.__daChipClicks = 0;',
  'window.__daFilterEvents = [];',
  'window.__daLocale = "tr";',
  'window.__daRenderChip = (props) => chipRoot.render(React.createElement(Chip, {',
  '  ...props, onSelect: () => { window.__daChipClicks += 1; }',
  '}));',
  'window.__daRenderFilters = (locale, values) => {',
  '  window.__daLocale = locale;',
  '  window.__daFilterEvents = [];',
  '  filterRoot.render(React.createElement(ActiveFilterElement, {filter: ["size", values]}));',
  '};'
].join("\n");

const dependencies = {
  name: "chip-real-components-synthetic-routing",
  setup(plugin) {
    plugin.onResolve({ filter: /^@\/components\/atoms$/ }, () => ({ path: actualChip }));
    plugin.onResolve({ filter: /^@\/hooks\/useFilters$/ }, () => ({
      path: "synthetic-filters", namespace: "synthetic-ui"
    }));
    plugin.onResolve({ filter: /^next\/navigation$/ }, () => ({
      path: "synthetic-next", namespace: "synthetic-ui"
    }));
    plugin.onResolve({ filter: /^@\/icons$/ }, () => ({
      path: "synthetic-icon", namespace: "synthetic-ui"
    }));
    plugin.onLoad({ filter: /.*/, namespace: "synthetic-ui" }, (args) => {
      const contents = args.path === "synthetic-next"
        ? 'export const useParams = () => ({locale: window.__daLocale});'
        : args.path === "synthetic-filters"
          ? 'export default function useFilters(key) {return {updateFilters: value => window.__daFilterEvents.push({key, value})};}'
          : 'import React from "react"; export const CloseIcon = (props) => React.createElement("svg", {"aria-hidden":"true", ...props});';
      return { contents, loader: "js", resolveDir: storefront };
    });
  }
};

await build({
  absWorkingDir: storefront,
  stdin: {
    contents: entry,
    resolveDir: storefront,
    sourcefile: "chip-keyboard-browser-entry.tsx",
    loader: "tsx"
  },
  outfile: output,
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "chrome120",
  jsx: "automatic",
  plugins: [dependencies],
  logLevel: "warning"
});

console.log("CHIP SOURCE: apps/storefront/src/components/atoms/Chip/Chip.tsx");
console.log("ACTIVE FILTER SOURCE: apps/storefront/src/components/cells/ActiveFilterElement/ActiveFilterElement.tsx");
console.log("CHIP BROWSER BUNDLE: " + output);
console.log("SCOPE: Real React components in Chromium, synthetic routing; NOT Next.js/HTTP/DB/authorization acceptance");