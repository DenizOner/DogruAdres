#!/usr/bin/env python3
"""#372: real Next + Chrome against a disposable loopback-only fake Customer API.
NOT actual Medusa, Person/MFA, production data, DB, full AT, or checkout acceptance.
"""
from __future__ import annotations
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "apps" / "storefront"
HEAD_BRANCH = "fix/ismail-372-legacy-login-no-redirect-20261118"
assert os.getenv("GITHUB_ACTIONS") == "true"
assert os.getenv("GITHUB_REPOSITORY") == "DenizOner/DogruAdres"
assert os.getenv("GITHUB_EVENT_NAME") == "pull_request"
assert os.getenv("GITHUB_HEAD_REF") == HEAD_BRANCH
assert os.getenv("DA_ISMAIL_372_TASK_ONLY") == "1"
NEXT = APP / "node_modules" / "next" / "dist" / "bin" / "next"
assert NEXT.is_file(), "Locked Next.js dependency missing"
assert shutil.which("google-chrome"), "Real Chrome unavailable: fail closed"

def free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

class MockMedusa(BaseHTTPRequestHandler):
    auth_count = 0
    cart_transfers = 0
    permit_valid_login = False
    def log_message(self, fmt, *args):
        # Never log request body, Authorization, cookies or passwords.
        return
    def reply(self, status, obj):
        encoded = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)
    def dispatch(self):
        p = urlparse(self.path).path
        if self.headers.get("Host") != f"127.0.0.1:{self.server.server_port}":
            return self.reply(403, {"message": "Access denied"})
        if self.command == "GET" and p == "/store/regions":
            return self.reply(200, {"regions": [{
                "id": "reg_372_synthetic", "name": "Synthetic region",
                "currency_code": "try", "countries": [
                    {"iso_2": "tr", "display_name": "Türkiye"}]
            }]})
        if self.command == "POST" and p == "/auth/customer/emailpass":
            size = int(self.headers.get("Content-Length", "0"))
            assert 0 < size < 4096, "unexpected credential size"
            data = json.loads(self.rfile.read(size))
            assert data.get("email") == "synthetic372@example.invalid"
            assert data.get("password") in ("invalid-synthetic", "valid-synthetic")
            MockMedusa.auth_count += 1
            if data["password"] == "invalid-synthetic" or not MockMedusa.permit_valid_login:
                return self.reply(401, {"message": "Invalid login"})
            hdr = base64.urlsafe_b64encode(b'{"alg":"none"}').decode().rstrip("=")
            payload = base64.urlsafe_b64encode(json.dumps(
                {"exp": int(time.time()) + 900}).encode()).decode().rstrip("=")
            return self.reply(200, {"token": f"{hdr}.{payload}.synthetic"})
        if self.command == "GET" and p == "/store/customers/me":
            if not self.headers.get("authorization", "").startswith("Bearer "):
                return self.reply(401, {"message": "Access denied"})
            return self.reply(200, {"customer": {
                "id": "cus_372_synthetic", "first_name": "Synthetic",
                "last_name": "Only", "email": "synthetic372@example.invalid",
                "orders": []
            }})
        if self.command == "POST" and p.startswith("/store/carts/") and p.endswith("/customer"):
            MockMedusa.cart_transfers += 1
            return self.reply(403, {"message": "Cart operations disabled"})
        return self.reply(403, {"message": "Synthetic fixture denies this route"})
    def do_GET(self): self.dispatch()
    def do_POST(self): self.dispatch()

def wait_for_login(base, process):
    for _ in range(110):
        assert process.poll() is None, "Next server exited before ready"
        try:
            with urlopen(Request(base + "/tr/login"), timeout=5) as res:
                if res.status == 200:
                    return
        except Exception:
            pass
        time.sleep(0.6)
    raise AssertionError("Real Next HTTP login page not ready")

def assert_anonymous_redirect(base):
    from urllib.request import build_opener, HTTPRedirectHandler
    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    try:
        build_opener(NoRedirect).open(base + "/tr/user", timeout=15)
        raise AssertionError("Unauthenticated /tr/user was not denied")
    except HTTPError as e:
        assert e.code == 307, f"Expected 307, got {e.code}"
        assert "/tr/login" in e.headers.get("Location", "")
    print("PASS #372 real Next HTTP anonymous /tr/user -> 307 login")

def browser_assertions(base, port):
    with sync_playwright() as pw:
        chrome = pw.chromium.launch(
            executable_path=shutil.which("google-chrome"), headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage",
                  "--disable-background-networking"])
        try:
            context = chrome.new_context(viewport={"width": 320, "height": 640})
            def only_loopback(route):
                u = urlparse(route.request.url)
                if u.hostname == "localhost" and u.port == port:
                    route.continue_()
                else:
                    route.abort()
            context.route("**/*", only_loopback)
            page = context.new_page()
            visited = []
            http_observations = []
            browser_errors = []
            def classify_page_error(error):
                message = str(error)
                for label in ("Hydration failed", "Invalid hook call",
                              "Cannot read properties", "useContext",
                              "Minified React error", "NEXT_REDIRECT",
                              "TypeError", "ReferenceError", "React"):
                    if label.lower() in message.lower():
                        return label
                return "unknown-sha256:" + hashlib.sha256(
                    message.encode()).hexdigest()[:12]
            page.on("pageerror", lambda error: browser_errors.append(
                classify_page_error(error)))
            def observe_response(res):
                u = urlparse(res.url)
                if u.hostname == "localhost" and len(http_observations) < 25:
                    http_observations.append((res.request.method, u.path, res.status))
            page.on("response", observe_response)
            page.on("framenavigated", lambda f: visited.append(f.url)
                    if f == page.main_frame else None)
            response = page.goto(base + "/tr/login",
                                 wait_until="domcontentloaded", timeout=60000)
            assert response and response.status == 200
            page.get_by_test_id("login-form").wait_for(state="visible", timeout=30000)
            # SSR-visible fields alone do not prove React attached submit handlers.
            try:
                page.wait_for_function("""() => {
                    const form = document.querySelector('[data-testid="login-form"]');
                    return !!form && Object.keys(form).some(
                        k => k.startsWith('__reactProps$'));
                }""", timeout=30000)
            except PlaywrightTimeoutError:
                print("FAIL-DIAG #372 hydration-not-ready",
                      "browser_error_categories=", browser_errors[:5],
                      "auth_posts=", MockMedusa.auth_count,
                      "form_visible=", page.get_by_test_id("login-form").is_visible(),
                      "app_path=", urlparse(page.url).path, flush=True)
                raise
            page.get_by_test_id("login-email-input").fill("synthetic372@example.invalid")
            page.get_by_test_id("login-password-input").fill("invalid-synthetic")
            page.get_by_test_id("login-submit-button").click()
            try:
                page.get_by_text("Invalid login", exact=False).first.wait_for(
                    state="visible", timeout=18000)
            except PlaywrightTimeoutError:
                # Fail-only enum/count diagnostics; no DOM, credentials, cookies or URLs with query strings.
                print("FAIL-DIAG #372: auth_posts=", MockMedusa.auth_count,
                      "cart_transfers=", MockMedusa.cart_transfers,
                      "path=", urlparse(page.url).path,
                      "form_visible=", page.get_by_test_id("login-form").is_visible(),
                      "toast_nodes=", page.locator("[data-sonner-toast]").count(),
                      "role_alert_count=", page.get_by_role("alert").count(),
                      "browser_error_count=", len(browser_errors),
                      "loopback_http_method_path_status=", http_observations[-16:], flush=True)
                raise
            page.wait_for_timeout(800)
            assert urlparse(page.url).path == "/tr/login", "Failed login navigated"
            assert not any("/user" in urlparse(url).path for url in visited), \
                "Incorrect password attempted navigation to /user"
            assert MockMedusa.auth_count == 1, "Expected exactly one failed auth POST"
            assert MockMedusa.cart_transfers == 0, "Unexpected Cart transfer"
            assert page.get_by_test_id("login-form").is_visible()
            assert page.evaluate(
                "document.documentElement.scrollWidth <= window.innerWidth + 2"), \
                "320px viewport horizontally overflows"
            print("PASS #372 real Next/Chrome: invalid login, error, zero /user, zero Cart")
            # Separate synthetic Customer positive; no real Medusa or Person access.
            MockMedusa.permit_valid_login = True
            page.get_by_test_id("login-password-input").fill("valid-synthetic")
            page.get_by_test_id("login-submit-button").click()
            try:
                page.get_by_text("Welcome Synthetic", exact=False).first.wait_for(
                    state="visible", timeout=30000)
            except PlaywrightTimeoutError:
                # Fail-only status/cookie-presence metadata; never print token values.
                browser_cookie_names = [c.get("name", "") for c in context.cookies()]
                print("FAIL-DIAG #372 synthetic-positive",
                      "auth_posts=", MockMedusa.auth_count,
                      "cart_transfers=", MockMedusa.cart_transfers,
                      "path=", urlparse(page.url).path,
                      "jwt_cookie_present=", "_medusa_jwt" in browser_cookie_names,
                      "browser_error_categories=", browser_errors[:5],
                      "loopback_http_method_path_status=", http_observations[-16:],
                      flush=True)
                raise
            assert MockMedusa.auth_count == 2, "Expected one additional auth POST"
            assert MockMedusa.cart_transfers == 0, "No preexisting Cart cookie"
            assert "/user" in urlparse(page.url).path, "Success did not reach /user"
            print("PASS #372 real Next/Chrome: synthetic Customer success renders /user")
            context.close()
        finally:
            chrome.close()

def main():
    fixture = ThreadingHTTPServer(("127.0.0.1", 0), MockMedusa)
    fixture.daemon_threads = True
    threading.Thread(target=fixture.serve_forever, daemon=True).start()
    port = free_port()
    # Next's Server Action redirects use localhost. Keep all browser requests
    # and cookies on that exact origin; the fake backend remains 127.0.0.1 only.
    base = f"http://localhost:{port}"
    # Explicit allowlist prevents passing any CI secrets or protected DB settings.
    env = {k: os.environ[k] for k in ("PATH", "HOME", "TMPDIR", "TZ", "LANG")
           if k in os.environ}
    env.update({
        "NODE_ENV": "development", "NEXT_TELEMETRY_DISABLED": "1",
        "NEXT_PUBLIC_DEFAULT_REGION": "tr", "NEXT_PUBLIC_BASE_URL": base,
        "NEXT_PUBLIC_SITE_NAME": "Synthetic 372",
        "MEDUSA_BACKEND_URL": f"http://127.0.0.1:{fixture.server_port}",
        "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY": "pk_synthetic_372_no_authority",
    })
    proc = subprocess.Popen(
        ["node", str(NEXT), "dev", "-H", "127.0.0.1", "-p", str(port)],
        cwd=APP, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_for_login(base, proc)
        assert_anonymous_redirect(base)
        browser_assertions(base, port)
    finally:
        proc.terminate()
        try: proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
        fixture.shutdown()
        fixture.server_close()

if __name__ == "__main__":
    main()
