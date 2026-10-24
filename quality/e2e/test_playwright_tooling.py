"""A real Chromium/Playwright runner self-test, NOT a DoğruAdres user acceptance test.

Do not map this synthetic in-memory page to B01–B21 PASS. Product tests need
an isolated GitHub-runner Medusa/UI stack and verified synthetic actors.
"""

import unittest

from playwright.sync_api import sync_playwright


class PlaywrightToolingSelfTest(unittest.TestCase):
    def test_real_chromium_dom_keyboard_and_click(self):
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                page = browser.new_page(locale="tr-TR")
                page.set_content(
                    '<html lang="tr"><body>'
                    '<label for="name">Ad</label><input id="name">'
                    '<button onclick="document.getElementById(\'result\').textContent='
                    '\'Kaydedildi: \'+document.getElementById(\'name\').value">'
                    'Kaydet</button><p id="result" aria-live="polite"></p>'
                    '</body></html>'
                )
                page.get_by_role("textbox", name="Ad").fill("Sentetik")
                page.get_by_role("button", name="Kaydet").click()
                self.assertEqual(page.locator("#result").inner_text(), "Kaydedildi: Sentetik")
            finally:
                browser.close()


if __name__ == "__main__":
    unittest.main()
