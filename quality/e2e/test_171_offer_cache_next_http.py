"""#171: Real Next.js production HTTP / synthetic Offer backend cache regression.

This test is *only* enabled for Gökhan's own PR on the already existing free,
disposable Governance Actions runner. It creates no persistent DB, volume,
workflow, worktree, account, production API request or checkout/payment.
It exercises the real storefront listOffers wrapper through a CI-only Next
route. It additionally checks the genuine public Seller page via synthetic native
Mercur SDK responses; it is not Person/Org/Store PG16 or production acceptance.
"""
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[2]
STOREFRONT = REPO / "apps" / "storefront"
API = REPO / "packages" / "api"
BRANCH = "fix/gokhan-171-seller-offers-no-store"
ROUTE = "/tr/auth/verify-email/ci-only-171-offers"
SELLER_ROUTE = "/tr/sellers/ci171"
FIXTURE_DIR = STOREFRONT / "src/app/[locale]/auth/verify-email/ci-only-171-offers"
MARKER = "ci171-exclusive-disposable-next-offer-fixture"
PAGE = """import { listOffers } from '@/lib/data/offers'

export default async function Page() {
  const { offers } = await listOffers({
    sellerId: 'sel_ci171',
    regionId: 'reg_ci171',
    limit: 1,
  })
  const item = offers[0] as unknown as {
    calculated_price?: { calculated_amount?: number }
    inventory_quantity?: number
  } | undefined
  const price = String(item?.calculated_price?.calculated_amount ?? 'unavailable')
  const stock = String(item?.inventory_quantity ?? 'unavailable')
  return <main data-testid="ci171-real-next-offer"
               data-ci171-price={price}
               data-ci171-stock={stock}>
    Synthetic Offer Next.js request: {price}
  </main>
}
"""


class OfferState:
    def __init__(self):
        self.lock = threading.Lock()
        self.price = 111
        self.stock = 5
        self.status = 200
        self.requests = []

    def reset(self):
        with self.lock:
            self.price = 111
            self.stock = 5
            self.status = 200
            self.requests = []


class OfferBackendHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        # No cookies, backend URLs, Authorization headers or response bodies in logs.
        return

    def do_GET(self):
        path = urlsplit(self.path).path
        state = self.server.offer_state
        if path == "/store/offers":
            auth = self.headers.get("authorization", "")
            with state.lock:
                state.requests.append(auth)
                status = state.status
                price = state.price
                stock = state.stock
            if status != 200:
                self.respond(status, {"message": "Synthetic transient unavailable"})
                return
            if auth == "Bearer ci171_actor_a":
                price = 531
            elif auth == "Bearer ci171_actor_b":
                price = 632
            elif auth:
                self.respond(403, {"message": "Synthetic denied"})
                return
            self.respond(200, {
                "offers": [{
                    "id": "offer_ci171",
                    "seller_id": "sel_ci171",
                    "product_id": "prod_ci171",
                    "variant_id": "variant_ci171",
                    "product": {
                        "id": "prod_ci171",
                        "handle": "ci171-product",
                        "title": "Synthetic CI171 product",
                        "thumbnail": None,
                    },
                    "calculated_price": {
                        "calculated_amount": price,
                        "currency_code": "try",
                    },
                    "inventory_quantity": stock,
                }],
                "count": 1,
            })
            return
        if path == "/store/sellers":
            self.respond(200, {"sellers": [{
                "id": "sel_ci171",
                "name": "Synthetic CI171 seller",
                "handle": "ci171",
                "description": "Public synthetic seller only",
                "created_at": "2026-10-01T00:00:00Z",
                "logo": None,
                "is_premium": False,
            }], "count": 1})
            return
        if path == "/store/regions":
            self.respond(200, {"regions": [{
                "id": "reg_ci171",
                "name": "Synthetic TR",
                "currency_code": "try",
                "countries": [{"iso_2": "tr"}],
            }]})
            return
        if path == "/store/customers/me":
            self.respond(401, {"message": "Synthetic unauthenticated"})
            return
        self.respond(404, {"message": "Synthetic unavailable"})

    def respond(self, status, data):
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("cache-control", "no-store")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


class OfferNextHttp(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not (
            os.environ.get("GITHUB_ACTIONS") == "true"
            and os.environ.get("GITHUB_EVENT_NAME") == "pull_request"
            and os.environ.get("GITHUB_HEAD_REF") == BRANCH
            and os.environ.get("RUNNER_TEMP")
        ):
            raise unittest.SkipTest("Only the existing disposable #171 PR runner may execute this test")
        if FIXTURE_DIR.exists():
            raise AssertionError("REFUSED: CI-only Next fixture directory already exists")

        cls.offer_state = OfferState()
        cls.backend = None
        cls.backend_thread = None
        cls.server = None
        cls.log_handle = None
        cls.base = None
        cls.browser = None
        cls.playwright = None
        cls.fixture_created = False
        try:
            cls.backend = ThreadingHTTPServer(("127.0.0.1", 0), OfferBackendHandler)
            cls.backend.daemon_threads = True
            cls.backend.offer_state = cls.offer_state
            cls.backend_thread = threading.Thread(target=cls.backend.serve_forever, daemon=True)
            cls.backend_thread.start()
            backend_port = cls.backend.server_address[1]

            cls.env = dict(os.environ)
            cls.env.update({
                "CI": "1",
                "NEXT_TELEMETRY_DISABLED": "1",
                "MEDUSA_BACKEND_URL": f"http://127.0.0.1:{backend_port}",
                "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY": "pk_ci171_synthetic",
                "NEXT_PUBLIC_DEFAULT_REGION": "tr",
                "NEXT_PUBLIC_SITE_NAME": "Synthetic CI171",
                "NEXT_PUBLIC_BASE_URL": "http://127.0.0.1",
            })

            FIXTURE_DIR.mkdir(parents=True, exist_ok=False)
            cls.fixture_created = True
            (FIXTURE_DIR / ".ci171-owned").write_text(MARKER, encoding="utf-8")
            (FIXTURE_DIR / "page.tsx").write_text(PAGE, encoding="utf-8")
            try:
                cls.run_build("native Mercur codegen", ["bun", "run", "codegen"], API, 200)
                cls.run_build("Next Storefront production build", ["bun", "run", "build"], STOREFRONT, 420)
            finally:
                cls.cleanup_fixture()

            candidates = [
                STOREFRONT / ".next/standalone/apps/storefront/server.js",
                STOREFRONT / ".next/standalone/server.js",
            ]
            entries = [entry for entry in candidates if entry.is_file()]
            if len(entries) != 1:
                raise AssertionError("Expected one genuine built Next standalone entry")
            entry = entries[0]
            static_src = STOREFRONT / ".next/static"
            if not static_src.is_dir():
                raise AssertionError("Missing compiled Next static assets")
            shutil.copytree(static_src, entry.parent / ".next/static", dirs_exist_ok=True)

            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
                listener.bind(("127.0.0.1", 0))
                port = listener.getsockname()[1]
            cls.base = f"http://127.0.0.1:{port}"
            cls.env.update({"NODE_ENV": "production", "HOSTNAME": "127.0.0.1", "PORT": str(port)})
            log_path = Path(cls.env["RUNNER_TEMP"]) / "ci171-next-private.log"
            cls.log_handle = log_path.open("w", encoding="utf-8")
            cls.server = subprocess.Popen(
                ["node", str(entry)],
                cwd=str(entry.parent),
                env=cls.env,
                stdout=cls.log_handle,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            ready = False
            for _ in range(100):
                if cls.server.poll() is not None:
                    break
                try:
                    code, html = cls.get_html(ROUTE)
                    if code == 200 and 'data-testid="ci171-real-next-offer"' in html:
                        ready = True
                        break
                except (OSError, URLError, TimeoutError):
                    pass
                time.sleep(0.35)
            if not ready:
                raise AssertionError("Real Next HTTP route did not start successfully")
        except Exception:
            cls.cleanup_runtime()
            raise

    @classmethod
    def run_build(cls, title, args, cwd, seconds):
        result = subprocess.run(
            args, cwd=cwd, env=cls.env, text=True,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            timeout=seconds, check=False,
        )
        if result.returncode != 0:
            # Avoid copying potentially sensitive process output to public CI.
            raise AssertionError(f"CI171 {title} failed with exit {result.returncode}")

    @classmethod
    def cleanup_fixture(cls):
        if not cls.fixture_created:
            return
        marker = FIXTURE_DIR / ".ci171-owned"
        if not marker.is_file() or marker.read_text(encoding="utf-8") != MARKER:
            raise AssertionError("REFUSED: CI171 fixture ownership changed; no cleanup")
        if set(child.name for child in FIXTURE_DIR.iterdir()) != {".ci171-owned", "page.tsx"}:
            raise AssertionError("REFUSED: unexpected CI171 fixture contents; no cleanup")
        shutil.rmtree(FIXTURE_DIR)
        cls.fixture_created = False

    @classmethod
    def cleanup_runtime(cls):
        child = getattr(cls, "server", None)
        if child is not None and child.poll() is None:
            try:
                os.killpg(child.pid, signal.SIGTERM)
                child.wait(timeout=8)
            except (OSError, subprocess.TimeoutExpired):
                os.killpg(child.pid, signal.SIGKILL)
                child.wait(timeout=5)
        handle = getattr(cls, "log_handle", None)
        if handle is not None:
            handle.close()
        backend = getattr(cls, "backend", None)
        if backend is not None:
            backend.shutdown()
            backend.server_close()
        thread = getattr(cls, "backend_thread", None)
        if thread is not None:
            thread.join(timeout=5)
        if getattr(cls, "fixture_created", False):
            cls.cleanup_fixture()

    @classmethod
    def tearDownClass(cls):
        cls.cleanup_runtime()

    @classmethod
    def get_html(cls, path, cookie=None):
        headers = {}  # Do not force cache bypass; test the normal Next fetch path
        if cookie:
            headers["cookie"] = cookie
        request = Request(cls.base + path, headers=headers)
        try:
            with urlopen(request, timeout=18) as response:
                return response.status, response.read().decode("utf-8")
        except HTTPError as exc:
            return exc.code, exc.read().decode("utf-8")

    def setUp(self):
        self.offer_state.reset()

    def assert_price(self, html, price, stock="5"):
        self.assertIn('data-ci171-price="' + str(price) + '"', html)
        self.assertIn('data-ci171-stock="' + str(stock) + '"', html)

    def test_existing_api_jest_unit_contract(self):
        run = subprocess.run(
            [
                "bun", "run", "jest", "--runInBand", "--runTestsByPath",
                "src/api/__tests__/storefront-offer-cache.unit.spec.ts",
            ],
            cwd=API,
            env={**self.env, "TEST_TYPE": "unit"},
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=130,
            check=False,
        )
        if run.returncode != 0:
            # The probe uses only synthetic data; never dump raw secrets or logs.
            raise AssertionError("CI171 targeted Storefront SDK mock Jest failed")
        print("CI171 PASS targeted five-case Jest SDK cache/header contract")

    def test_missed_webhook_never_keeps_stale_offer_price(self):
        code, first = self.get_html(ROUTE)
        self.assertEqual(code, 200)
        self.assert_price(first, 111)
        with self.offer_state.lock:
            self.offer_state.price = 222
        code, second = self.get_html(ROUTE)
        self.assertEqual(code, 200)
        self.assert_price(second, 222)
        with self.offer_state.lock:
            self.assertGreaterEqual(len(self.offer_state.requests), 2)
            self.assertTrue(all(not value for value in self.offer_state.requests))
        print("CI171 PASS real Next HTTP fresh anonymous Offer after missed webhook")

    def test_two_authenticated_actors_do_not_share_offer_price(self):
        code, first = self.get_html(ROUTE, "_medusa_jwt=ci171_actor_a")
        self.assertEqual(code, 200)
        self.assert_price(first, 531)
        self.assertNotIn("ci171_actor_a", first)
        code, second = self.get_html(ROUTE, "_medusa_jwt=ci171_actor_b")
        self.assertEqual(code, 200)
        self.assert_price(second, 632)
        self.assertNotIn("ci171_actor_b", second)
        code, public = self.get_html(ROUTE)
        self.assertEqual(code, 200)
        self.assert_price(public, 111)
        with self.offer_state.lock:
            self.assertIn("Bearer ci171_actor_a", self.offer_state.requests)
            self.assertIn("Bearer ci171_actor_b", self.offer_state.requests)
            self.assertIn("", self.offer_state.requests)
        print("CI171 PASS real Next HTTP bearer A/B/anonymous separate Offer results")

    def test_upstream_503_never_returns_previously_cached_price(self):
        code, first = self.get_html(ROUTE)
        self.assertEqual(code, 200)
        self.assert_price(first, 111)
        with self.offer_state.lock:
            self.offer_state.status = 503
        code, second = self.get_html(ROUTE)
        self.assertEqual(code, 200)
        self.assert_price(second, "unavailable", "unavailable")
        print("CI171 PASS genuine Next HTTP 503 does not re-serve old Offer")

    def test_real_seller_page_returns_updated_price_without_event(self):
        # Test the real SellerPage > SellerTabs > SellerOffersListing > OfferCard
        # chain, not only the CI-only wrapper. Native Mercur data is synthetic.
        code, first = self.get_html(SELLER_ROUTE)
        self.assertEqual(code, 200)
        self.assertIn('data-testid="seller-offers-listing"', first)
        self.assertIn('data-offer-id="offer_ci171"', first)
        before = re.findall(
            r'<p[^>]*data-testid="offer-card-current-price"[^>]*>(.*?)</p>',
            first,
        )
        self.assertTrue(before, "Actual SellerPage did not render a priced OfferCard")
        with self.offer_state.lock:
            self.offer_state.price = 222
            self.offer_state.stock = 9
        code, changed = self.get_html(SELLER_ROUTE)
        self.assertEqual(code, 200)
        self.assertIn('data-offer-id="offer_ci171"', changed)
        after = re.findall(
            r'<p[^>]*data-testid="offer-card-current-price"[^>]*>(.*?)</p>',
            changed,
        )
        self.assertTrue(after, "Actual SellerPage lost OfferCard after update")
        self.assertNotEqual(before[0], after[0], "Real SellerPage reused stale price")
        with self.offer_state.lock:
            self.assertGreaterEqual(len(self.offer_state.requests), 2)
        print("CI171 PASS actual SellerPage/OfferCard refreshed price without webhook")

    def test_real_seller_page_denied_actor_has_no_offer_from_other_actors(self):
        code, first = self.get_html(SELLER_ROUTE, "_medusa_jwt=ci171_actor_a")
        self.assertEqual(code, 200)
        self.assertIn('data-offer-id="offer_ci171"', first)
        code, denied = self.get_html(SELLER_ROUTE, "_medusa_jwt=ci171_denied")
        self.assertEqual(code, 200)
        self.assertNotIn('data-offer-id="offer_ci171"', denied)
        self.assertNotIn("ci171_actor_a", denied)
        code, anonymous = self.get_html(SELLER_ROUTE)
        self.assertEqual(code, 200)
        self.assertIn('data-offer-id="offer_ci171"', anonymous)
        with self.offer_state.lock:
            self.assertIn("Bearer ci171_actor_a", self.offer_state.requests)
            self.assertIn("Bearer ci171_denied", self.offer_state.requests)
            self.assertIn("", self.offer_state.requests)
        print("CI171 PASS actual SellerPage denied 403 Offer is not cross-session cached")

    def test_real_chromium_renders_current_next_offer(self):
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                page = browser.new_page(locale="tr-TR")
                page.route(
                    "**/*",
                    lambda route: (
                        route.continue_()
                        if route.request.url.startswith(self.base + "/")
                        else route.abort()
                    ),
                )
                response = page.goto(self.base + ROUTE, wait_until="domcontentloaded")
                self.assertIsNotNone(response)
                self.assertEqual(response.status, 200)
                offer = page.get_by_test_id("ci171-real-next-offer")
                offer.wait_for()
                self.assertEqual(offer.get_attribute("data-ci171-price"), "111")
                with self.offer_state.lock:
                    self.offer_state.price = 333
                response = page.reload(wait_until="domcontentloaded")
                self.assertEqual(response.status, 200)
                offer = page.get_by_test_id("ci171-real-next-offer")
                self.assertEqual(offer.get_attribute("data-ci171-price"), "333")
                print("CI171 PASS genuine Chrome/Next SSR Offer freshness after reload")
            finally:
                browser.close()


if __name__ == "__main__":
    unittest.main()
