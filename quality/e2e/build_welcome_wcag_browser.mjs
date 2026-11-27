// Chromium WCAG/RTL/keyboard regression bundle for the ACTUAL DoğruAdres
// WelcomePage sections, Footer, and HtmlLangSetter React components (#242, #375).
// Only next/link and next/navigation are isolated for browser mounting.
// This is a component accessibility regression, not full Next.js SSR or AT acceptance.
import { build } from "esbuild";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.RUNNER_TEMP) {
  throw new Error("A task-isolated GitHub Actions RUNNER_TEMP is required");
}

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const storefront = join(repo, "apps", "storefront");
const output = join(process.env.RUNNER_TEMP, "da-welcome-wcag-browser.js");

const entry = [
  'import React from "react";',
  'import { createRoot } from "react-dom/client";',
  'import { HtmlLangSetter } from "./src/components/atoms/HtmlLangSetter/HtmlLangSetter";',
  'import { WelcomeHero, TargetAudienceSection, IntegratedSolutionsSection, HowItWorksSection, TrustAndFaqSection } from "./src/components/sections/WelcomePage";',
  'import { Footer } from "./src/components/organisms/Footer/Footer";',
  'import { __setMockPath } from "next/navigation";',
  'const mount = document.getElementById("welcome-test-root");',
  'if (!mount) throw new Error("Test mount #welcome-test-root not found");',
  'const root = createRoot(mount);',
  'function App() {',
  '  return React.createElement(React.Fragment, null,',
  '    React.createElement("a", { href: "#main-content", id: "skip-link" }, "İçeriğe atla"),',
  '    React.createElement(HtmlLangSetter, null),',
  '    React.createElement("div", { id: "main-content", tabIndex: -1 },',
  '      React.createElement("main", { "data-testid": "welcome-page-main" },',
  '        React.createElement(WelcomeHero, null),',
  '        React.createElement(TargetAudienceSection, null),',
  '        React.createElement(IntegratedSolutionsSection, null),',
  '        React.createElement(HowItWorksSection, null),',
  '        React.createElement(TrustAndFaqSection, null)',
  '      )',
  '    ),',
  '    React.createElement(Footer, null)',
  '  );',
  '}',
  'window.__daRenderWelcome = (path = "/tr") => {',
  '  __setMockPath(path);',
  '  root.render(React.createElement(App));',
  '};',
  'window.__daRenderWelcome("/tr");',
].join("\n");

const nextNavigationStub = `
let currentPath = "/tr";
const listeners = new Set();
export function __setMockPath(p) {
  currentPath = p;
  for (const fn of listeners) fn();
}
import { useEffect, useState } from "react";
export function usePathname() {
  const [p, setP] = useState(currentPath);
  useEffect(() => {
    const update = () => setP(currentPath);
    listeners.add(update);
    update();
    return () => listeners.delete(update);
  }, []);
  return p;
}
export function useParams() {
  const m = currentPath.match(/^\\/([a-z]{2})(?:\\/|$)/i);
  return { locale: m ? m[1] : "tr" };
}
export function useRouter() { return { push: () => {}, replace: () => {} }; }
export function redirect() {}
`;

const nextLinkStub = `
import React from "react";
export default function Link({ href, children, ...props }) {
  return React.createElement("a", { href, ...props }, children);
}
`;

const isolatedNext = {
  name: "welcome-wcag-next-isolation",
  setup(plugin) {
    plugin.onResolve({ filter: /^next\/navigation$/ }, () => ({
      path: "next-navigation-stub",
      namespace: "welcome-next-stub",
    }));
    plugin.onResolve({ filter: /^next\/link$/ }, () => ({
      path: "next-link-stub",
      namespace: "welcome-next-stub",
    }));
    plugin.onLoad({ filter: /.*/, namespace: "welcome-next-stub" }, (args) => ({
      contents: args.path === "next-navigation-stub" ? nextNavigationStub : nextLinkStub,
      loader: "js",
      resolveDir: storefront,
    }));
  },
};

await build({
  absWorkingDir: storefront,
  stdin: {
    contents: entry,
    resolveDir: storefront,
    sourcefile: "welcome-wcag-browser-entry.tsx",
    loader: "tsx",
  },
  outfile: output,
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "chrome120",
  jsx: "automatic",
  define: {
    "process.env": JSON.stringify({ NODE_ENV: "test" }),
  },
  plugins: [isolatedNext],
  logLevel: "warning",
});

console.log("BROWSER BUNDLE: " + output);
console.log("SCOPE: Real WelcomePage + Footer + HtmlLangSetter in Chromium; mocked next/navigation & next/link.");
