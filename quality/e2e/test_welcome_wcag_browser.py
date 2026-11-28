"""Chromium WCAG 2.2 AA, keyboard, RTL, and 320px reflow tests for the actual
DoğruAdres WelcomePage, Footer, and HtmlLangSetter React components (#242, #375).

Only next/navigation and next/link are stubbed in the browser bundle. This is a
component accessibility regression, not full Next.js SSR, live AT, or E2E acceptance.
"""
import os
import subprocess
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright


class WelcomeWcagChromiumTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        runner_temp = os.environ.get("RUNNER_TEMP")
        if not runner_temp:
            raise AssertionError("Isolated GitHub Actions RUNNER_TEMP is required")
        cls.bundle = Path(runner_temp) / "da-welcome-wcag-browser.js"
        repo = Path(__file__).resolve().parents[2]
        builder = repo / "quality/e2e/build_welcome_wcag_browser.mjs"
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
                "Building actual WelcomePage WCAG bundle failed: "
                + (result.stderr or result.stdout)[-1300:]
            )
        if not cls.bundle.is_file():
            raise AssertionError("WelcomePage WCAG bundle missing after build")

    def setUp(self):
        self.pw = sync_playwright().start()
        self.browser = None
        self.page = None
        self.errors = []
        try:
            self.browser = self.pw.chromium.launch(headless=True)
            self.page = self.browser.new_page(
                locale="tr-TR", viewport={"width": 1280, "height": 800}
            )
            self.page.on("pageerror", lambda err: self.errors.append(str(err)))
            self.page.route("**/*", lambda route: route.abort())
            self.page.set_content(
                '<!doctype html><html lang="tr" dir="ltr">'
                '<head><meta name="viewport" content="width=device-width, initial-scale=1">'
                '<style>*{box-sizing:border-box}body{margin:0}</style>'
                '</head>'
                '<body><div id="welcome-test-root"></div></body></html>'
            )
            self.page.add_script_tag(path=str(self.bundle))
            self.page.locator('[data-testid="welcome-hero"]').wait_for(timeout=5000)
        except Exception as error:
            if self.page is not None:
                self.page.close()
            if self.browser is not None:
                self.browser.close()
            self.pw.stop()
            raise AssertionError(
                "WelcomePage WCAG bundle failed to render: "
                + str(error)
                + "; page errors: "
                + repr(self.errors)
            ) from error

    def tearDown(self):
        try:
            self.assertEqual(self.errors, [], "React/Chromium runtime page errors")
        finally:
            self.browser.close()
            self.pw.stop()

    def test_semantic_landmarks_and_single_h1(self):
        self.assertEqual(self.page.locator("h1").count(), 1)
        self.assertEqual(self.page.locator("main").count(), 1)
        self.assertEqual(self.page.locator("footer").count(), 1)
        self.assertEqual(self.page.locator("main section").count(), 5)
        self.assertGreaterEqual(self.page.locator("h2").count(), 5)

    def test_skip_link_keyboard_focus_moves_to_main_content(self):
        skip = self.page.locator('a[href="#main-content"]')
        skip.focus()
        self.assertTrue(skip.evaluate("el => document.activeElement === el"))
        self.page.keyboard.press("Enter")
        active_id = self.page.evaluate("document.activeElement?.id")
        self.assertEqual(active_id, "main-content")

    def test_faq_details_summary_keyboard_toggle(self):
        first_details = self.page.locator('[data-testid="faq-item-1"]')
        first_summary = first_details.locator("summary")
        self.assertIsNone(first_details.get_attribute("open"))
        first_summary.focus()
        self.assertTrue(first_summary.evaluate("el => document.activeElement === el"))
        self.page.keyboard.press("Enter")
        self.assertIsNotNone(first_details.get_attribute("open"))
        self.page.keyboard.press("Space")
        self.assertIsNone(first_details.get_attribute("open"))

    def test_mobile_320px_reflow_no_horizontal_overflow(self):
        self.page.set_viewport_size({"width": 320, "height": 568})
        scroll_width = self.page.evaluate("document.documentElement.scrollWidth")
        client_width = self.page.evaluate("document.documentElement.clientWidth")
        self.assertLessEqual(scroll_width, client_width)

    def test_html_lang_setter_tr_en_ar_rtl(self):
        for path, expected_lang, expected_dir in [
            ("/tr", "tr-TR", "ltr"),
            ("/en", "en", "ltr"),
            ("/ar", "ar", "rtl"),
        ]:
            self.page.evaluate("(p) => window.__daRenderWelcome(p)", path)
            self.page.wait_for_function(
                "([lang, dir]) => document.documentElement.lang === lang && document.documentElement.dir === dir",
                arg=[expected_lang, expected_dir],
            )
            self.assertEqual(
                self.page.evaluate("document.documentElement.lang"), expected_lang
            )
            self.assertEqual(
                self.page.evaluate("document.documentElement.dir"), expected_dir
            )

    def test_closed_b4b_and_content_invariants(self):
        text = self.page.evaluate("document.body.innerText")
        self.assertNotIn("Snag your style", text)
        self.assertNotIn("Fleek", text)
        self.assertNotIn("yakında", text)
        self.assertNotIn("fail-closed", text)
        self.assertEqual(self.page.locator('a[href="/register"]').count(), 0)
        self.assertGreaterEqual(self.page.locator('a[href="/personal"]').count(), 4)
