"""Real Next.js production HTTP/keyboard regression for the #374 CI-only route.

Build-time fixture is generated/removed in the same GitHub-hosted runner.
Tests real App Router, actual SizeFilter and ActiveFilterElement, keyboard and
URL transitions. No Medusa API, real catalog, Person, DB or production access.
"""
import os
import shutil
import signal
import socket
import subprocess
import time
import unittest
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

from playwright.sync_api import sync_playwright


REPO = Path(__file__).resolve().parents[2]
STOREFRONT = REPO / "apps" / "storefront"
PATH = "/tr/auth/verify-email/ci-only-374"


class NextFilterHttpTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if (
            os.environ.get("GITHUB_ACTIONS") != "true"
            or os.environ.get("GITHUB_EVENT_NAME") != "pull_request"
            or os.environ.get("GITHUB_HEAD_REF") not in ("fix/baris-374-chip-keyboard-filters", "fix/baris-374-filter-dialog-keyboard")
            or not os.environ.get("RUNNER_TEMP")
        ):
            raise unittest.SkipTest("Only the disposable #374 PR GitHub runner may serve this test")
        # The actual Next production build must contain the ephemeral fixture
        # even though its source was removed immediately after the build.
        # The monorepo traces a real app entry under apps/storefront.
        # Never recurse into bundled node_modules: they contain unrelated
        # server.js files that are not launchable application entrypoints.
        candidates = [
            STOREFRONT / ".next/standalone/apps/storefront/server.js",
            STOREFRONT / ".next/standalone/server.js",
        ]
        standalone = [candidate for candidate in candidates if candidate.is_file()]
        if len(standalone) != 1:
            raise AssertionError(
                "Expected one generated Storefront standalone app entry: "
                + str([str(p.relative_to(STOREFRONT)) for p in standalone])
            )
        entry = standalone[0]
        src_static = STOREFRONT / ".next" / "static"
        dest_static = entry.parent / ".next" / "static"
        if not src_static.is_dir():
            raise AssertionError("Missing Next.js production static assets")
        shutil.copytree(src_static, dest_static, dirs_exist_ok=True)

        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]

        cls.base_url = f"http://127.0.0.1:{port}"
        env = dict(os.environ)
        env.update(
            {
                "NODE_ENV": "production",
                "HOSTNAME": "127.0.0.1",
                "PORT": str(port),
                "NEXT_TELEMETRY_DISABLED": "1",
            }
        )
        logfile = Path(env["RUNNER_TEMP"]) / "ci-374-next-loopback.log"
        cls.log_handle = logfile.open("w", encoding="utf-8")
        cls.server = subprocess.Popen(
            ["node", str(entry)],
            cwd=str(entry.parent),
            env=env,
            stdout=cls.log_handle,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        cls.server_log = logfile
        try:
            ready = False
            for _ in range(120):
                if cls.server.poll() is not None:
                    break
                try:
                    with urlopen(cls.base_url + PATH + "?size=M%2CL&sortBy=recent", timeout=1.5) as resp:
                        if resp.status == 200 and b"ci374-real-next-route" in resp.read():
                            ready = True
                            break
                except (OSError, URLError, TimeoutError):
                    pass
                time.sleep(0.5)
            if not ready:
                raise AssertionError(
                    "Next production fixture HTTP unavailable; latest runner log: "
                    + logfile.read_text(encoding="utf-8", errors="replace")[-2500:]
                )
            cls.playwright = sync_playwright().start()
            cls.browser = cls.playwright.chromium.launch(headless=True)
        except Exception:
            cls.stop_server()
            raise

    @classmethod
    def stop_server(cls):
        server = getattr(cls, "server", None)
        if server is not None and server.poll() is None:
            try:
                os.killpg(server.pid, signal.SIGTERM)
                server.wait(timeout=10)
            except (OSError, subprocess.TimeoutExpired):
                try:
                    os.killpg(server.pid, signal.SIGKILL)
                    server.wait(timeout=5)
                except (OSError, subprocess.TimeoutExpired):
                    pass
        log_handle = getattr(cls, "log_handle", None)
        if log_handle is not None:
            log_handle.close()

    @classmethod
    def tearDownClass(cls):
        if getattr(cls, "browser", None) is not None:
            cls.browser.close()
        if getattr(cls, "playwright", None) is not None:
            cls.playwright.stop()
        cls.stop_server()

    def setUp(self):
        self.page = self.browser.new_page(locale="tr-TR", reduced_motion="reduce")
        self.errors = []
        self.page.on("pageerror", lambda err: self.errors.append(str(err)))
        self.page.route(
            "**/*",
            lambda route: (
                route.continue_()
                if route.request.url.startswith(self.base_url + "/")
                else route.abort()
            ),
        )

    def tearDown(self):
        try:
            self.assertEqual(self.errors, [], "Real Next.js browser runtime exceptions")
        finally:
            self.page.close()

    def goto(self, path):
        response = self.page.goto(self.base_url + path, wait_until="domcontentloaded")
        self.assertIsNotNone(response, "Expected real HTTP response")
        self.assertEqual(response.status, 200, "Expected real Next.js production HTTP 200")
        self.page.get_by_test_id("ci374-real-next-route").wait_for()

    def test_actual_next_route_removes_multiple_filters_via_keyboard(self):
        self.goto(PATH + "?size=M%2CL&sortBy=recent")
        first = self.page.get_by_role("button", name="Filtreyi kaldır: Size — M")
        first.focus()
        self.page.keyboard.press("Enter")
        self.page.wait_for_url("**?size=L&sortBy=recent")
        self.assertEqual(
            self.page.get_by_role("button", name="Filtreyi kaldır: Size — M").count(), 0
        )
        # Removing a keyboard-focused chip must not dump focus on document.body.
        self.page.wait_for_function(
            "() => document.activeElement?.getAttribute('aria-label') === 'Filtreyi kaldır: Size — L'"
        )
        second = self.page.get_by_role("button", name="Filtreyi kaldır: Size — L")
        second.focus()
        self.page.keyboard.press("Space")
        self.page.wait_for_url("**?sortBy=recent")
        self.assertEqual(self.page.locator("button[aria-label^='Filtreyi kaldır']").count(), 0)
        self.page.wait_for_function("() => document.activeElement?.tagName === 'H1'")
        self.assertEqual(
            self.page.evaluate("document.activeElement.textContent.includes('Isolated keyboard filter fixture')"),
            True,
        )
        self.assertEqual(self.page.evaluate("new URL(location.href).searchParams.has('size')"), False)

    def test_actual_next_size_chip_preserves_unrelated_query(self):
        self.goto(PATH + "?sortBy=recent")
        chip = self.page.get_by_test_id("filter-size-chip-1")
        chip.wait_for()
        chip.focus()
        self.page.keyboard.press("Space")
        self.page.wait_for_url("**?sortBy=recent&size=1")
        self.assertEqual(chip.get_attribute("aria-pressed"), "true")
        self.assertEqual(
            self.page.get_by_role("button", name="Filtreyi kaldır: Size — 1").count(), 1
        )

    def test_actual_next_mobile_dialog_focus_stays_inside_when_filters_disappear(self):
        self.page.set_viewport_size({"width": 390, "height": 844})
        self.goto(PATH + "?size=M&color=Red&sortBy=recent")
        self.page.get_by_role("button", name="Filters", exact=True).click()
        modal = self.page.get_by_test_id("modal")
        modal.wait_for(state="visible")

        # Removing the last chip in one group must move focus to the other
        # group's removal action, never to the catalog heading behind modal.
        size = modal.get_by_role("button", name="Filtreyi kaldır: Size — M")
        size.focus()
        self.page.keyboard.press("Enter")
        self.page.wait_for_url("**?color=Red&sortBy=recent")
        color = modal.get_by_role("button", name="Filtreyi kaldır: Color — Red")
        color.wait_for(state="visible")
        self.assertEqual(
            self.page.evaluate("document.activeElement.getAttribute('aria-label')"),
            "Filtreyi kaldır: Color — Red",
        )
        self.assertTrue(modal.evaluate("(el) => el.contains(document.activeElement)"))

        color.focus()
        self.page.keyboard.press("Space")
        self.page.wait_for_url("**?sortBy=recent")
        self.assertEqual(
            modal.get_by_role("button", name="Filtreyi kaldır: Color — Red").count(),
            0,
        )
        # With no removal actions left, keep focus on a persistent control
        # in the still-open real ProductSearchSidebar modal.
        self.page.wait_for_function(
            "() => { const m=document.querySelector('[data-testid=modal]');"
            " return m && m.querySelector('.heading-md') === document.activeElement; }"
        )
        self.assertTrue(modal.locator(".heading-md").is_visible())
        self.assertTrue(modal.is_visible())

    def test_actual_next_mobile_last_color_focuses_visible_modal_heading(self):
        # With no selected size, its accordion remains collapsed but still
        # contains DOM buttons. Those hidden buttons must not receive focus.
        self.page.set_viewport_size({"width": 390, "height": 844})
        self.goto(PATH + "?color=Red&sortBy=recent")
        self.page.get_by_role("button", name="Filters", exact=True).click()
        modal = self.page.get_by_test_id("modal")
        modal.wait_for(state="visible")
        action = modal.get_by_role("button", name="Filtreyi kaldır: Color — Red")
        action.focus()
        self.page.keyboard.press("Enter")
        self.page.wait_for_url("**?sortBy=recent")
        heading = modal.locator(".heading-md")
        heading.wait_for(state="visible")
        self.page.wait_for_function(
            "() => { const m=document.querySelector('[data-testid=modal]');"
            " return m && document.activeElement === m.querySelector('.heading-md'); }"
        )
        self.assertTrue(modal.is_visible())
        self.assertEqual(
            modal.get_by_role("button", name="Filtreyi kaldır: Color — Red").count(),
            0,
        )
        # The active filter's focus fallback is the modal heading (tabIndex=-1).
        # Shift+Tab from there must stay inside the dialog, never reach Filters
        # or another background control.
        self.page.keyboard.press("Shift+Tab")
        self.assertTrue(modal.evaluate("(el) => el.contains(document.activeElement)"),
                        "Shift+Tab from programmatically focused heading escaped dialog")
        self.assertEqual(self.page.evaluate("document.activeElement.tagName"), "BUTTON")

    def test_actual_next_localized_filter_labels(self):
        # URL prefix is a country code, not a language code.
        for loc, text in [
            ("tr", "Filtreyi kaldır"),
            ("us", "Remove filter"),
            ("gb", "Remove filter"),
            ("ar", "Remove filter"),
            ("sa", "إزالة عامل التصفية"),
            ("ae", "إزالة عامل التصفية"),
        ]:
            with self.subTest(locale=loc):
                self.goto(
                    f"/{loc}/auth/verify-email/ci-only-374?size=M&sortBy=recent"
                )
                control = self.page.get_by_role(
                    "button", name=f"{text}: Size — M"
                )
                control.wait_for(state="visible")
                self.assertEqual(control.count(), 1)


    def test_filter_accordion_keyboard_and_hidden_tab_order(self):
        self.goto(PATH + "?sortBy=recent")
        accordion = self.page.get_by_role("button", name="Size", exact=True).first
        accordion.wait_for(state="visible")
        panel_id = accordion.get_attribute("aria-controls")
        self.assertTrue(panel_id, "Accordion button must control a named panel")
        panel = self.page.locator("[id='" + panel_id + "']")
        self.assertEqual(accordion.get_attribute("aria-expanded"), "true")
        self.assertTrue(panel.get_by_role("button", name="1", exact=True).is_visible())

        accordion.focus()
        self.page.keyboard.press("Space")
        self.assertEqual(accordion.get_attribute("aria-expanded"), "false")
        self.assertTrue(panel.is_hidden(), "Closed accordion must hide controls from tab order")
        self.assertEqual(panel.get_by_role("button", name="1", exact=True).count(), 0)
        accordion.focus()
        self.page.keyboard.press("Tab")
        self.assertFalse(panel.evaluate("(el) => el.contains(document.activeElement)"),
                         "Keyboard focus must not enter collapsed filters")
        accordion.focus()
        self.page.keyboard.press("Enter")
        self.assertEqual(accordion.get_attribute("aria-expanded"), "true")
        self.assertTrue(panel.get_by_role("button", name="1", exact=True).is_visible())

    def test_mobile_dialog_escape_close_button_and_focus_return(self):
        self.page.set_viewport_size({"width": 390, "height": 844})
        self.goto(PATH + "?size=M&sortBy=recent")
        trigger = self.page.get_by_role("button", name="Filters", exact=True)
        trigger.focus()
        self.page.keyboard.press("Enter")
        dialog = self.page.get_by_role("dialog", name="Filters")
        dialog.wait_for(state="visible")
        self.assertEqual(dialog.get_attribute("aria-modal"), "true")
        close = dialog.get_by_role("button", name="Close Filters")
        self.assertTrue(close.evaluate("(el) => el === document.activeElement"))
        self.page.keyboard.press("Shift+Tab")
        self.assertTrue(dialog.evaluate("(el) => el.contains(document.activeElement)"),
                        "Reverse Tab may not leave modal")
        self.page.keyboard.press("Escape")
        dialog.wait_for(state="detached")
        self.assertTrue(trigger.evaluate("(el) => el === document.activeElement"),
                        "Escape restores the original Filters trigger")

        trigger.focus()
        self.page.keyboard.press("Space")
        dialog.wait_for(state="visible")
        dialog.get_by_role("button", name="Close Filters").focus()
        self.page.keyboard.press("Space")
        dialog.wait_for(state="detached")
        self.assertTrue(trigger.evaluate("(el) => el === document.activeElement"),
                        "Native close button restores focus after Space")


if __name__ == "__main__":
    unittest.main()
