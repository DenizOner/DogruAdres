// Chromium smoke test of the ACTUAL Admin SMTP React page source.
// Only the @medusajs/ui presentation shell and HTTP session/settings are mocked.
// This is not a real authenticated Admin server, SMTP send, or DB acceptance.
import { build } from "esbuild";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.RUNNER_TEMP) {
  throw new Error("A task-isolated GitHub Actions RUNNER_TEMP is required");
}
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const admin = join(repo, "apps", "admin");
const source = join(admin, "src/routes/settings/smtp/page.tsx");
const output = join(process.env.RUNNER_TEMP, "da-admin-smtp-keyboard-browser.js");

const entry = [
  'import React from "react";',
  'import { createRoot } from "react-dom/client";',
  'import PlatformSmtpSettingsPage from "./src/routes/settings/smtp/page";',
  'const root = createRoot(document.getElementById("smtp-test-root"));',
  'root.render(React.createElement(PlatformSmtpSettingsPage));'
].join("\n");

const uiShell = `
import React from "react";
const simple = (tag) => ({ children, className }) => React.createElement(tag, { className }, children);
export const Container = simple("section");
export const Text = simple("span");
export const Badge = simple("span");
export const Alert = simple("div");
export const Heading = ({ children, level = "h2", className }) =>
  React.createElement(level, { className }, children);
export const Input = React.forwardRef((props, ref) => React.createElement("input", { ...props, ref }));
export const Label = ({ children, htmlFor, className }) =>
  React.createElement("label", { htmlFor, className }, children);
export const Button = ({ children, type = "button", disabled, onClick, className }) =>
  React.createElement("button", { type, disabled, onClick, className }, children);
export const Switch = ({ id, checked, onCheckedChange }) =>
  React.createElement("button", {
    type: "button", id, role: "switch", "aria-checked": checked,
    onClick: () => onCheckedChange(!checked),
  }, checked ? "Açık" : "Kapalı");
export const Toaster = () => null;
export const toast = { success: () => {}, error: () => {} };
`;

const isolatedPresentation = {
  name: "smtp-admin-real-source-synthetic-ui",
  setup(plugin) {
    plugin.onResolve({ filter: /^@medusajs\\/ui$/ }, () => ({
      path: "isolated-admin-ui", namespace: "smtp-test-ui"
    }));
    plugin.onLoad({ filter: /.*/, namespace: "smtp-test-ui" }, () => ({
      contents: uiShell, loader: "tsx", resolveDir: admin
    }));
  }
};

await build({
  absWorkingDir: admin,
  stdin: {
    contents: entry,
    resolveDir: admin,
    sourcefile: "admin-smtp-keyboard-browser-entry.tsx",
    loader: "tsx"
  },
  outfile: output,
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "chrome120",
  jsx: "automatic",
  plugins: [isolatedPresentation],
  logLevel: "warning"
});

console.log("SOURCE: " + source);
console.log("BROWSER BUNDLE: " + output);
console.log("SCOPE: Real Admin SMTP page + React input handlers in Chromium; mocked UI shell/session. No real login/API/PG16/SMTP.");
