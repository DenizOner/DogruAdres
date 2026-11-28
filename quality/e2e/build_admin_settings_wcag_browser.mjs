// Chromium WCAG/keyboard regression bundle for the ACTUAL Admin MFA and
// Admin Notification Preferences React pages (#242, #373).
// Only the @medusajs/ui presentation shell and HTTP fetches are mocked.
// Not full authenticated Admin server, DB, or AT acceptance.
import { build } from "esbuild";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.RUNNER_TEMP) {
  throw new Error("A task-isolated GitHub Actions RUNNER_TEMP is required");
}

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const admin = join(repo, "apps", "admin");
const output = join(process.env.RUNNER_TEMP, "da-admin-settings-wcag-browser.js");

const entry = [
  'import React from "react";',
  'import { createRoot } from "react-dom/client";',
  'import i18next from "i18next";',
  'import { initReactI18next } from "react-i18next";',
  'import tr from "./src/i18n/tr.json";',
  'i18next.use(initReactI18next).init({',
  '  lng: "tr",',
  '  fallbackLng: "tr",',
  '  resources: { tr: { translation: tr } },',
  '  interpolation: { escapeValue: false },',
  '  initImmediate: false,',
  '});',
  'import PlatformMfaSettingsPage from "./src/routes/settings/mfa/page";',
  'import NotificationPreferencesSettingsPage from "./src/routes/settings/notifications/page";',
  'const mount = document.getElementById("admin-wcag-root");',
  'if (!mount) throw new Error("Mount #admin-wcag-root not found");',
  'const root = createRoot(mount);',
  'window.__daRenderAdminMfa = () => root.render(React.createElement(PlatformMfaSettingsPage));',
  'window.__daRenderAdminNotifications = () => root.render(React.createElement(NotificationPreferencesSettingsPage));',
].join("\n");

const uiShell = `
import React from "react";
const simple = (tag) => ({ children, className, role, "aria-live": ariaLive }) =>
  React.createElement(tag, { className, role, "aria-live": ariaLive }, children);
export const Container = simple("section");
export const Text = simple("span");
export const Badge = simple("span");
export const Heading = ({ children, level = "h2", className }) =>
  React.createElement(level, { className }, children);
export const Button = ({ children, type = "button", disabled, onClick, className }) =>
  React.createElement("button", { type, disabled, onClick, className }, children);
`;

const isolatedPresentation = {
  name: "admin-settings-wcag-synthetic-ui",
  setup(plugin) {
    plugin.onResolve({ filter: /^@medusajs\/ui$/ }, () => ({
      path: "isolated-admin-ui",
      namespace: "admin-wcag-ui",
    }));
    plugin.onLoad({ filter: /.*/, namespace: "admin-wcag-ui" }, () => ({
      contents: uiShell,
      loader: "tsx",
      resolveDir: admin,
    }));
  },
};

await build({
  absWorkingDir: admin,
  stdin: {
    contents: entry,
    resolveDir: admin,
    sourcefile: "admin-settings-wcag-browser-entry.tsx",
    loader: "tsx",
  },
  outfile: output,
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "chrome120",
  jsx: "automatic",
  plugins: [isolatedPresentation],
  logLevel: "warning",
});

console.log("BROWSER BUNDLE: " + output);
console.log("SCOPE: Real Admin MFA + Notifications pages in Chromium; mocked UI shell/session.");
