"""Chromium WCAG 2.2 AA & keyboard regression tests for the actual Admin MFA
and Admin Notification Preferences React pages (#242, #373).

The @medusajs/ui shell and HTTP fetches are mocked. Not full Admin/DB/AT acceptance.
"""
import os
import subprocess
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright


class AdminSettingsWcagChromiumTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        runner_temp = os.environ.get("RUNNER_TEMP")
        if not runner_temp:
            raise AssertionError("Isolated GitHub Actions RUNNER_TEMP is required")
        cls.bundle = Path(runner_temp) / "da-admin-settings-wcag-browser.js"
        repo = Path(__file__).resolve().parents[2]
        builder = repo / "quality/e2e/build_admin_settings_wcag_browser.mjs"
        result = subprocess.run(
            ["node", str(builder)],
            cwd=repo,
            env=os.environ.copy(),
            text=True,
            capture_output=True,
            timeout=90,
            check=False,
        )
        if result.returncode != 0:
            raise AssertionError(
                "Building Admin settings WCAG bundle failed: "
                + (result.stderr or result.stdout)[-1300:]
            )
        if not cls.bundle.is_file():
            raise AssertionError("Admin settings WCAG bundle missing after build")

    def setUp(self):
        self.pw = sync_playwright().start()
        self.browser = None
        self.page = None
        self.errors = []
        try:
            self.browser = self.pw.chromium.launch(headless=True)
            self.page = self.browser.new_page(locale="tr-TR")
            self.page.on("pageerror", lambda err: self.errors.append(str(err)))
            self.page.route("**/*", lambda route: route.abort())
            self.page.set_content(
                '<!doctype html><html lang="tr"><body>'
                '<div id="admin-wcag-root"></div></body></html>'
            )
            self.page.evaluate("""() => {
              window.__daMfaStatus = 200;
              window.__daMfaPosts = 0;
              window.__daNotifPosts = 0;
              window.fetch = async (url, options = {}) => {
                const path = String(url).split("?")[0];
                const method = (options.method || "GET").toUpperCase();
                if (path === "/personal/session" && method === "GET") {
                  if (window.__daMfaStatus === 401) {
                    return { ok: false, status: 401, json: async () => ({}) };
                  }
                  return { ok: true, status: 200, json: async () => ({ csrf_token: "synthetic-csrf" }) };
                }
                if (path === "/platform/mfa" && method === "GET") {
                  return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                      can_manage_platform: true,
                      platform: { platform_mode: "required", version: 1 },
                      runtime_enforcement: "enforced",
                    }),
                  };
                }
                if (path === "/platform/mfa" && method === "POST") {
                  window.__daMfaPosts++;
                  return {
                    ok: true,
                    status: 200,
                    json: async () => ({ platform: { platform_mode: "optional", version: 2 } }),
                  };
                }
                if (path === "/personal/notification-preferences" && method === "GET") {
                  return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                      version: 1,
                      mobile_channel: { supported: false, permission_granted: false, reason: "unsupported" },
                      categories: [
                        { id: "security_account", critical: true },
                        { id: "marketing_promotions", critical: false },
                      ],
                      preferences: {
                        security_account: { platform: true, email: "immediate", mobile: false },
                        marketing_promotions: { platform: false, email: "off", mobile: false },
                      },
                    }),
                  };
                }
                if (path === "/personal/notification-preferences" && method === "POST") {
                  window.__daNotifPosts++;
                  return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                      version: 2,
                      mobile_channel: { supported: false, permission_granted: false, reason: "unsupported" },
                      categories: [
                        { id: "security_account", critical: true },
                        { id: "marketing_promotions", critical: false },
                      ],
                      preferences: {
                        security_account: { platform: true, email: "immediate", mobile: false },
                        marketing_promotions: { platform: true, email: "off", mobile: false },
                      },
                    }),
                  };
                }
                throw new Error("Unexpected synthetic fetch: " + method + " " + path);
              };
            }""")
            self.page.add_script_tag(path=str(self.bundle))
        except Exception as error:
            if self.page is not None:
                self.page.close()
            if self.browser is not None:
                self.browser.close()
            self.pw.stop()
            raise AssertionError(
                "Admin settings WCAG bundle failed: "
                + str(error)
                + "; page errors: "
                + repr(self.errors)
            ) from error

    def tearDown(self):
        try:
            self.assertEqual(self.errors, [], "React/Chromium page errors")
        finally:
            self.browser.close()
            self.pw.stop()

    def test_mfa_keyboard_radio_and_live_region(self):
        self.page.evaluate("window.__daRenderAdminMfa()")
        self.page.locator("fieldset legend").wait_for(timeout=5000)
        self.assertEqual(self.page.locator("h1").count(), 1)
        self.assertEqual(self.page.locator('[role="status"]').count(), 1)
        radios = self.page.get_by_role("radio")
        self.assertEqual(radios.count(), 3)
        for i in range(3):
            desc_id = radios.nth(i).get_attribute("aria-describedby")
            self.assertTrue(desc_id and self.page.locator(f"#{desc_id}").count() == 1)

        save_btn = self.page.locator('button[type="submit"]')
        self.assertTrue(save_btn.is_disabled())
        radios.nth(0).focus()
        self.page.keyboard.press("ArrowDown")
        self.assertTrue(radios.nth(1).is_checked())
        self.assertFalse(save_btn.is_disabled())
        self.assertEqual(self.page.evaluate("window.__daMfaPosts"), 0)

    def test_mfa_unauthorized_renders_accessible_alert(self):
        self.page.evaluate("window.__daMfaStatus = 401; window.__daRenderAdminMfa()")
        alert = self.page.locator('[role="alert"]')
        alert.wait_for(timeout=5000)
        self.assertEqual(alert.locator('a[href="/personal"]').count(), 1)
        self.assertEqual(self.page.locator("fieldset").count(), 0)

    def test_notifications_keyboard_table_and_critical_guards(self):
        self.page.evaluate("window.__daRenderAdminNotifications()")
        self.page.locator("table tbody tr").first.wait_for(timeout=5000)
        self.assertEqual(self.page.locator("h1").count(), 1)

        # Every interactive control has a non-empty aria-label
        inputs = self.page.locator("table input, table select")
        for i in range(inputs.count()):
            label = inputs.nth(i).get_attribute("aria-label")
            self.assertTrue(label and len(label.strip()) > 0)

        # Critical category controls remain disabled; non-critical checkbox toggles via Space
        rows = self.page.locator("table tbody tr")
        self.assertTrue(rows.nth(0).locator('input[type="checkbox"]').first.is_disabled())
        self.assertTrue(rows.nth(0).locator("select").is_disabled())

        marketing_cb = rows.nth(1).locator('input[type="checkbox"]').first
        self.assertFalse(marketing_cb.is_disabled())
        self.assertFalse(marketing_cb.is_checked())
        marketing_cb.focus()
        self.page.keyboard.press("Space")
        self.assertTrue(marketing_cb.is_checked())

        # <details><summary> toggles via Enter
        details = self.page.locator("details")
        self.assertIsNotNone(details.get_attribute("open"))
        details.locator("summary").focus()
        self.page.keyboard.press("Enter")
        self.assertIsNone(details.get_attribute("open"))
