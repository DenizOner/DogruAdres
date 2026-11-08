"""Real Chromium regression for JSON-LD script-boundary escaping.

Tests the actual storefront serializer and audits all six source callsites.
The browser fixture exercises HTML parsing, not a full Next.js/Medusa request.
"""
import json
import os
import re
import subprocess
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[2]
PAGES = [
    ROOT / "apps/storefront/src/app/[locale]/(main)/page.tsx",
    ROOT / "apps/storefront/src/app/[locale]/(main)/categories/page.tsx",
    ROOT / "apps/storefront/src/app/[locale]/(main)/categories/[category]/page.tsx",
]
# Deliberately non-networked sentinel: a positive control proves the browser
# really executes a breakout, rather than a CSP hiding a false positive.
BREAKOUT = '</script><script>window.__daSyntheticTriggered=1</script><script type="application/ld+json">'


def encode_using_real_helper(value):
    env = dict(os.environ, DA_SYNTHETIC_JSON=json.dumps(value, ensure_ascii=False))
    code = (
        'import {serializeJsonLd} from '
        '"./apps/storefront/src/lib/helpers/serialize-json-ld.ts";'
        'const data=JSON.parse(process.env.DA_SYNTHETIC_JSON);'
        'process.stdout.write(serializeJsonLd(data));'
    )
    result = subprocess.run(
        ["bun", "-e", code],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=True,
        timeout=20,
    )
    return result.stdout


class JsonLdScriptSecurityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def render_script(self, text):
        page = self.browser.new_page()
        page.route("**/*", lambda route: route.abort())
        page.set_content(
            '<!doctype html><html><body>'
            '<script>window.__daSyntheticTriggered=0;</script>'
            '<script id="ld" type="application/ld+json">' + text + '</script>'
            '</body></html>'
        )
        return page

    def test_real_page_sources_all_use_escaped_serializer(self):
        for path in PAGES:
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                self.assertEqual(text.count('type="application/ld+json"'), 2)
                self.assertEqual(
                    len(re.findall(r"__html:\s*serializeJsonLd\(", text)), 2
                )
                self.assertNotIn("__html: JSON.stringify(", text)

    def test_legitimate_json_ld_roundtrip(self):
        item = {
            "@context": "https://schema.org",
            "@type": "ItemList",
            "itemListElement": [
                {"name": 'Çanta <b> & "Yeni"', "url": "https://example.invalid/p?a=1&b=2"},
                {"name": "Kış ☃️ \u2028 \u2029"},
            ],
        }
        encoded = encode_using_real_helper(item)
        self.assertNotIn("<", encoded)
        self.assertEqual(json.loads(encoded), item)
        page = self.render_script(encoded)
        try:
            self.assertEqual(page.evaluate("window.__daSyntheticTriggered"), 0)
            self.assertEqual(json.loads(page.locator("#ld").text_content()), item)
        finally:
            page.close()

    def test_breakout_positive_control_and_secure_output(self):
        item = {"@context": "https://schema.org", "name": BREAKOUT}
        unsafe = json.dumps(item, ensure_ascii=False)
        control_page = self.render_script(unsafe)
        try:
            self.assertEqual(control_page.evaluate("window.__daSyntheticTriggered"), 1)
        finally:
            control_page.close()

        safe = encode_using_real_helper(item)
        page = self.render_script(safe)
        try:
            self.assertEqual(page.evaluate("window.__daSyntheticTriggered"), 0)
            self.assertEqual(json.loads(page.locator("#ld").text_content()), item)
            self.assertEqual(page.locator("script").count(), 2)
        finally:
            page.close()

    def test_category_and_product_embedded_breakouts_are_inert(self):
        for field in ["name", "url"]:
            with self.subTest(field=field):
                item = {"@type": "ListItem", "position": 1, field: BREAKOUT}
                encoded = encode_using_real_helper(item)
                page = self.render_script(encoded)
                try:
                    self.assertEqual(page.evaluate("window.__daSyntheticTriggered"), 0)
                    self.assertEqual(json.loads(page.locator("#ld").text_content()), item)
                finally:
                    page.close()


if __name__ == "__main__":
    unittest.main()
