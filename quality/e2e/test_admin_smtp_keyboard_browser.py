"""Chromium keyboard tests for the actual Admin SMTP React page source.

The Medusa UI presentation shell and GET/session fetches are synthetic. Existing
B22 CI separately tests real authenticated Admin/HTTP/PostgreSQL behavior.
This is a component keyboard regression, not full SMTP, WCAG or E2E acceptance.
"""
import os
import re
import subprocess
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright


class AdminSmtpKeyboardChromiumTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        runner_temp = os.environ.get("RUNNER_TEMP")
        if not runner_temp:
            raise AssertionError("Isolated GitHub Actions RUNNER_TEMP is required")
        cls.bundle = Path(runner_temp) / "da-admin-smtp-keyboard-browser.js"
        repo = Path(__file__).resolve().parents[2]
        builder = repo / "quality/e2e/build_admin_smtp_keyboard_browser.mjs"
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
            # This test never uses user credentials, fixture addresses or secrets.
            raise AssertionError(
                "Building actual Admin SMTP React page failed: "
                + (result.stderr or result.stdout)[-1300:]
            )
        if not cls.bundle.is_file():
            raise AssertionError("Admin SMTP component bundle missing after build")

    def setUp(self):
        self.pw = sync_playwright().start()
        self.browser = self.pw.chromium.launch(headless=True)
        self.page = self.browser.new_page(locale="tr-TR")
        self.errors = []
        self.expected_posts = 0
        self.page.on("pageerror", lambda err: self.errors.append(str(err)))
        # Nothing from synthetic settings or the React mount may reach a network.
        self.page.route("**/*", lambda route: route.abort())
        self.page.set_content(
            '<!doctype html><html lang="tr"><body>'
            '<div id="smtp-test-root"></div></body></html>'
        )
        self.page.evaluate("""() => {
          window.__daSmtpPosts = 0;
          window.__daSmtpGets = 0;
          window.fetch = async (url, options = {}) => {
            const path = String(url).split("?")[0];
            const method = (options.method || "GET").toUpperCase();
            if (path === "/personal/session" && method === "GET") {
              return { ok: true, status: 200, json: async () =>
                ({ csrf_token: "synthetic-csrf-token" }) };
            }
            if (path === "/personal/platform/smtp" && method === "GET") {
              window.__daSmtpGets++;
              return { ok: true, status: 200, json: async () => ({
                can_manage: true,
                settings: {
                  enabled: false, host: "smtp.example.invalid",
                  port: 465, security: "ssl", username: null,
                  from_email: "sender@example.invalid", from_name: null,
                  has_password: false, version: 0
                }
              }) };
            }
            if (path === "/personal/platform/smtp" && method === "POST") {
              window.__daSmtpPosts++;
              throw Error("Unsolicited SMTP write in a keyboard-only test");
            }
            throw Error("Unexpected synthetic HTTP request");
          };
        }""")
        self.page.add_script_tag(path=str(self.bundle))
        self.page.locator("#smtp-port").wait_for()
        self.page.get_by_role("radio").first.wait_for()
        self.assertEqual(self.page.evaluate("window.__daSmtpGets"), 1)

    def tearDown(self):
        try:
            self.assertEqual(self.errors, [], "React/Chromium page errors")
            self.assertEqual(
                self.page.evaluate("window.__daSmtpPosts"), self.expected_posts,
                "Keyboard-only UI interaction must not send SMTP settings",
            )
        finally:
            self.browser.close()
            self.pw.stop()

    @property
    def ssl(self):
        return self.page.get_by_role("radio", name=re.compile(r"^SSL"))

    @property
    def tls(self):
        return self.page.get_by_role("radio", name=re.compile(r"STARTTLS"))

    def test_group_has_accessible_name_and_native_radio_roles(self):
        group = self.page.get_by_role("group", name="Güvenlik Protokolü *")
        self.assertEqual(group.count(), 1)
        radios = group.get_by_role("radio")
        self.assertEqual(radios.count(), 2)
        self.assertEqual(self.ssl.get_attribute("name"), "security-mode")
        self.assertEqual(self.tls.get_attribute("name"), "security-mode")
        self.assertTrue(self.ssl.is_checked())
        self.assertFalse(self.tls.is_checked())

    def test_keyboard_tab_arrow_right_left_updates_standard_ports(self):
        self.page.locator("#smtp-port").focus()
        self.page.keyboard.press("Tab")
        self.assertEqual(
            self.page.evaluate("document.activeElement.getAttribute('name')"),
            "security-mode",
        )
        self.assertTrue(self.ssl.is_checked())
        self.page.keyboard.press("ArrowRight")
        self.assertTrue(self.tls.is_checked())
        self.assertFalse(self.ssl.is_checked())
        self.assertEqual(self.page.locator("#smtp-port").input_value(), "587")
        self.page.keyboard.press("ArrowLeft")
        self.assertTrue(self.ssl.is_checked())
        self.assertFalse(self.tls.is_checked())
        self.assertEqual(self.page.locator("#smtp-port").input_value(), "465")

    def test_radio_group_has_one_tab_stop_and_preserves_logical_focus_order(self):
        # From port, native radio group gets one Tab stop; the next Tab
        # moves to SMTP username rather than trapping focus in the group.
        port = self.page.locator("#smtp-port")
        port.focus()
        self.page.keyboard.press("Tab")
        self.assertTrue(self.ssl.evaluate("(el) => document.activeElement === el"))
        self.page.keyboard.press("Tab")
        self.assertEqual(
            self.page.evaluate("document.activeElement.id"), "smtp-user"
        )
        self.page.keyboard.press("Shift+Tab")
        self.assertTrue(self.ssl.evaluate("(el) => document.activeElement === el"))
        self.assertEqual(port.input_value(), "465")

    def test_space_selects_unchecked_radio_with_default_port(self):
        self.tls.focus()
        self.page.keyboard.press("Space")
        self.assertTrue(self.tls.is_checked())
        self.assertEqual(self.page.locator("#smtp-port").input_value(), "587")
        self.ssl.focus()
        self.page.keyboard.press("Space")
        self.assertTrue(self.ssl.is_checked())
        self.assertEqual(self.page.locator("#smtp-port").input_value(), "465")

    def test_custom_operator_port_survives_mode_changes(self):
        port = self.page.locator("#smtp-port")
        port.fill("2525")
        self.assertEqual(port.input_value(), "2525")
        self.ssl.focus()
        self.page.keyboard.press("ArrowRight")
        self.assertTrue(self.tls.is_checked())
        self.assertEqual(port.input_value(), "2525")
        self.page.keyboard.press("ArrowLeft")
        self.assertTrue(self.ssl.is_checked())
        self.assertEqual(port.input_value(), "2525")

    def test_mouse_label_uses_same_radio_change_path(self):
        self.page.get_by_text("STARTTLS (Port 587)", exact=True).click()
        self.assertTrue(self.tls.is_checked())
        self.assertEqual(self.page.locator("#smtp-port").input_value(), "587")
        self.page.get_by_text("SSL / TLS (Port 465)", exact=True).click()
        self.assertTrue(self.ssl.is_checked())
        self.assertEqual(self.page.locator("#smtp-port").input_value(), "465")


    def test_missing_or_malformed_recipient_never_dispatches_test_email(self):
        recipient = self.page.locator("#test-recipient")
        button = self.page.get_by_role(
            "button", name="Bağlantıyı ve E-posta Gönderimini Test Et"
        )
        # This button is not a submit button. The page must explicitly
        # activate native constraint validation before posting a test email.
        button.click()
        self.assertFalse(recipient.evaluate("(el) => el.required"))
        self.assertTrue(recipient.is_focused())
        self.assertEqual(self.page.evaluate("window.__daSmtpPosts"), 0)
        recipient.fill("not-an-email")
        button.click()
        self.assertTrue(
            recipient.evaluate("(el) => el.validity.typeMismatch")
        )
        self.assertEqual(self.page.evaluate("window.__daSmtpPosts"), 0)

    def test_settings_save_is_allowed_without_test_recipient(self):
        recipient = self.page.locator("#test-recipient")
        self.assertEqual(recipient.input_value(), "")
        self.assertFalse(recipient.evaluate("(el) => el.required"))
        # The Test action has an independent required-recipient gate.
        # The enclosing settings form must not inherit that requirement.
        self.expected_posts = 1
        self.page.get_by_role("button", name="Ayarları kaydet").click()
        self.page.wait_for_function("window.__daSmtpPosts === 1")

    def test_valid_recipient_reaches_existing_smtp_test_post(self):
        recipient = self.page.locator("#test-recipient")
        recipient.fill("recipient@example.invalid")
        self.assertTrue(recipient.evaluate("(el) => el.checkValidity()"))
        # This route is intercepted by a synthetic fetch handler. An actual
        # SMTP message and external network request are never created.
        self.expected_posts = 1
        self.page.get_by_role(
            "button", name="Bağlantıyı ve E-posta Gönderimini Test Et"
        ).click()
        self.page.wait_for_function("window.__daSmtpPosts === 1")
        self.assertFalse(
            recipient.evaluate("(el) => el.validity.typeMismatch")
        )


if __name__ == "__main__":
    unittest.main()
