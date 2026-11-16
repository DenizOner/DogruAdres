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
            or os.environ.get("GITHUB_HEAD_REF") != "fix/baris-374-chip-keyboard-filters"
            or not os.environ.get("RUNNER_TEMP")
        ):
            raise unittest.SkipTest("Only the disposable #374 PR GitHub runner may serve this test")
        # The actual Next production build must contain the ephemeral fixture
        # even though its source was removed immediately after the build.
        standalone = list((STOREFRONT / ".next" / "standalone").glob("**/server.js"))
        if len(standalone) != 1:
            raise AssertionError(
                "Expected exactly one built Next standalone server, not a dev or mock server: "
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
        second = self.page.get_by_role("button", name="Filtreyi kaldır: Size — L")
        second.focus()
        self.page.keyboard.press("Space")
        self.page.wait_for_url("**?sortBy=recent")
        self.assertEqual(self.page.locator("button[aria-label^='Filtreyi kaldır']").count(), 0)
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

    def test_actual_next_localized_filter_labels(self):
        for loc, text in [
            ("tr", "Filtreyi kaldır"),
            ("en", "Remove filter"),
            ("ar", "إزالة عامل التصفية"),
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


if __name__ == "__main__":
    unittest.main()
