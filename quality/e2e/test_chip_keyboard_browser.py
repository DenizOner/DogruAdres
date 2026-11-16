"""Actual Chip/ActiveFilterElement React behavior in Chromium on a synthetic mount.

The real useFilters and useUpdateSearchParams hooks run against an isolated
synthetic Next.js router. No real Next.js page, HTTP, authentication, database,
or complete WCAG 2.2 acceptance is asserted.
"""
import os
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright


class ChipKeyboardChromiumTest(unittest.TestCase):
    def setUp(self):
        temp = os.environ.get("RUNNER_TEMP")
        if not temp:
            self.fail("RUNNER_TEMP must be an isolated GitHub runner directory")
        bundle = Path(temp) / "da-chip-keyboard-browser.js"
        if not bundle.is_file():
            self.fail("Actual component Chromium bundle was not built")

        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(headless=True)
        self.page = self.browser.new_page(locale="tr-TR")
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.page.route("**/*", lambda route: route.abort())
        self.page.set_content(
            '<html lang="tr"><body><div id="chip"></div>'
            '<div id="filters"></div></body></html>'
        )
        self.page.add_script_tag(path=str(bundle))
        self.page.wait_for_function(
            "typeof window.__daRenderChip === 'function' && "
            "typeof window.__daRenderFilters === 'function'"
        )

    def tearDown(self):
        try:
            self.assertEqual(self.errors, [], "Browser runtime exceptions")
        finally:
            self.browser.close()
            self.playwright.stop()

    def render_chip(self, **props):
        self.page.evaluate("(props) => window.__daRenderChip(props)", props)
        self.page.locator("#chip button").wait_for()
        return self.page.locator("#chip button")

    def render_filters(self, locale, values):
        self.page.evaluate(
            "([locale, values]) => window.__daRenderFilters(locale, values)",
            [locale, values],
        )
        self.page.wait_for_function(
            "(values) => document.querySelectorAll('#filters button').length === values",
            arg=len(values.split(",")),
        )
        return self.page.locator("#filters button")

    def test_native_keyboard_enter_and_space_selection(self):
        chip = self.render_chip(value="M", selected=False, disabled=False)
        self.assertEqual(chip.get_attribute("type"), "button")
        self.assertEqual(chip.get_attribute("aria-pressed"), "false")
        self.assertIn("focus-visible:outline", chip.get_attribute("class"))
        chip.focus()
        self.assertTrue(chip.evaluate("(el) => document.activeElement === el"))
        self.page.keyboard.press("Enter")
        self.page.keyboard.press("Space")
        self.assertEqual(self.page.evaluate("window.__daChipClicks"), 2)

    def test_selected_and_color_have_accessible_name(self):
        chip = self.render_chip(value="#123456", selected=True, color=True)
        self.assertEqual(chip.get_attribute("aria-pressed"), "true")
        self.assertEqual(chip.get_attribute("aria-label"), "#123456")
        self.assertEqual(chip.locator("span[aria-hidden=true]").count(), 1)
        self.assertEqual(self.page.get_by_role("button", name="#123456").count(), 1)
        self.page.get_by_role("button", name="#123456").focus()
        self.page.keyboard.press("Enter")
        self.assertEqual(self.page.evaluate("window.__daChipClicks"), 1)

    def test_native_disabled_prevents_mouse_and_keyboard_activation(self):
        chip = self.render_chip(value="L", disabled=True)
        self.assertTrue(chip.is_disabled())
        self.assertEqual(chip.get_attribute("data-disabled"), "true")
        chip.evaluate("(el) => el.click()")
        self.page.keyboard.press("Enter")
        self.page.keyboard.press("Space")
        self.assertEqual(self.page.evaluate("window.__daChipClicks"), 0)

    def test_filter_removal_is_one_named_keyboard_action_per_filter(self):
        buttons = self.render_filters("tr", "M,L")
        self.assertEqual(buttons.count(), 2)
        self.assertEqual(self.page.locator("#filters button button").count(), 0)
        first = self.page.get_by_role("button", name="Filtreyi kaldır: Size — M")
        second = self.page.get_by_role("button", name="Filtreyi kaldır: Size — L")
        self.assertEqual(first.count(), 1)
        self.assertEqual(second.count(), 1)
        first.focus()
        self.page.keyboard.press("Enter")
        self.assertEqual(
            self.page.evaluate("window.__daRoutes"),
            [{"target": "/tr/catalog?size=L&sortBy=recent", "options": {"scroll": False}}],
        )
        # Simulate the parent re-render after actual Next router navigation.
        self.render_filters("tr", "L")
        second = self.page.get_by_role("button", name="Filtreyi kaldır: Size — L")
        second.focus()
        self.page.keyboard.press("Space")
        self.assertEqual(
            self.page.evaluate("window.__daRoutes"),
            [{"target": "/tr/catalog?sortBy=recent", "options": {"scroll": False}}],
        )

    def test_real_filter_hooks_preserve_unrelated_query_and_encode_values(self):
        self.render_filters("tr", "M&XL,L")
        control = self.page.get_by_role("button", name="Filtreyi kaldır: Size — M&XL")
        self.assertEqual(control.count(), 1)
        control.focus()
        self.page.keyboard.press("Enter")
        routes = self.page.evaluate("window.__daRoutes")
        self.assertEqual(len(routes), 1)
        self.assertEqual(routes[0]["target"], "/tr/catalog?size=L&sortBy=recent")
        self.assertEqual(routes[0]["options"], {"scroll": False})
        self.assertEqual(self.page.evaluate("window.__daSearchQuery"), "size=L&sortBy=recent")

    def test_filter_names_are_localized_without_nested_controls(self):
        for locale, name in [
            ("en", "Remove filter: Size — M"),
            ("ar", "إزالة عامل التصفية: Size — M"),
            ("tr", "Filtreyi kaldır: Size — M"),
        ]:
            with self.subTest(locale=locale):
                self.render_filters(locale, "M")
                control = self.page.get_by_role("button", name=name)
                self.assertEqual(control.count(), 1)
                self.assertEqual(self.page.locator("#filters button button").count(), 0)
                control.focus()
                self.page.keyboard.press("Space")
                self.assertEqual(
                    self.page.evaluate("window.__daRoutes"),
                    [{"target": "/tr/catalog?sortBy=recent", "options": {"scroll": False}}],
                )


if __name__ == "__main__":
    unittest.main()
