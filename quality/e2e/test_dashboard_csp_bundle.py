"""#378: Real Vite Admin/Vendor production bundle CSP acceptance in existing Governance CI.

Task-only, no new service/DB/dependency/workflow. The source-controlled bundler is
executed on REAL built Vite dist files in a disposable runner-local copy.
Unsafe CSP modifications are applied only to those isolated copies.
"""
import os
import re
import secrets
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BRANCH = "fix/fikret-378-dashboard-csp-build-guard"
RUN_THIS_PR = (
    os.environ.get("GITHUB_ACTIONS") == "true"
    and os.environ.get("GITHUB_EVENT_NAME") == "pull_request"
    and os.environ.get("GITHUB_HEAD_REF") == BRANCH
    and os.environ.get("GITHUB_REPOSITORY") == "DenizOner/DogruAdres"
    and bool(os.environ.get("RUNNER_TEMP"))
)
POLICY = re.compile(
    r'<meta\s+http-equiv="Content-Security-Policy"\s+'
    r'content="connect-src &#39;self&#39;"\s*/?>', re.I
)


@unittest.skipUnless(RUN_THIS_PR, "Only Fikret #378 isolated PR Governance runner")
class RealDashboardCspBundleTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workspace = tempfile.TemporaryDirectory(
            prefix="da-csp-real-vite-", dir=os.environ["RUNNER_TEMP"]
        )
        cls.base = Path(cls.workspace.name)
        cls.real_dist = {}
        env = dict(os.environ)
        env.update({
            "MERCUR_DISABLE_TELEMETRY": "true",
            "JWT_SECRET": secrets.token_hex(48),
            "COOKIE_SECRET": secrets.token_hex(48),
        })
        # The pre-existing Foundation PG16 runner builds these same Vite
        # workspaces. No network services or database are started by this test.
        try:
            for name, prefix in [("admin", "/dashboard/assets/"), ("vendor", "/seller/assets/")]:
                build = subprocess.run(
                    ["bun", "run", "build"],
                    cwd=ROOT / "apps" / name,
                    env=env, text=True, capture_output=True, timeout=180, check=False,
                )
                if build.returncode != 0:
                    raise AssertionError(
                        f"Real {name} Vite build failed (exit={build.returncode}): "
                        + (build.stderr or build.stdout)[-1800:]
                    )
                dist = ROOT / "apps" / name / "dist"
                index = dist / "index.html"
                if not index.is_file() or not (dist / "assets").is_dir():
                    raise AssertionError(f"Real {name} Vite output missing")
                html = index.read_text(encoding="utf-8")
                if not POLICY.search(html) or prefix not in html:
                    raise AssertionError(f"Real {name} Vite CSP or asset base missing")
                cls.real_dist[name] = dist
                print(f"PASS #378 real Vite {name} built with first-party CSP and {prefix}")
        except BaseException:
            cls.workspace.cleanup()
            raise

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "workspace"):
            cls.workspace.cleanup()

    def run_actual_bundler(self, name=None, corruption=None):
        with tempfile.TemporaryDirectory(prefix="case-", dir=self.base) as directory:
            fixture = Path(directory)
            api = fixture / "packages" / "api"
            script_dir = api / "scripts"
            script_dir.mkdir(parents=True)
            for file in ("bundle-dashboards.mjs", "dashboard-csp.mjs"):
                shutil.copy2(ROOT / "packages" / "api" / "scripts" / file, script_dir / file)
            artifact = api / ".medusa" / "server"
            artifact.mkdir(parents=True)
            (artifact / "package.json").write_text(
                '{"name":"synthetic-csp-package","dependencies":{"@task/test":"workspace:*"}}',
                encoding="utf-8",
            )
            for panel, dist in self.real_dist.items():
                destination = fixture / "apps" / panel / "dist"
                shutil.copytree(dist, destination)
                if panel == name:
                    index = destination / "index.html"
                    html = index.read_text(encoding="utf-8")
                    match = POLICY.search(html)
                    self.assertIsNotNone(match, f"Expected Vite CSP meta in {panel}")
                    tag = match.group(0)
                    if corruption == "missing":
                        broken = html[:match.start()] + html[match.end():]
                    elif corruption == "external-origin":
                        broken = (
                            html[:match.start()]
                            + tag.replace(
                                "connect-src &#39;self&#39;",
                                "connect-src &#39;self&#39; https://external.invalid",
                            )
                            + html[match.end():]
                        )
                    elif corruption == "comment-only":
                        broken = html[:match.start()] + "<!--" + tag + "-->" + html[match.end():]
                    elif corruption == "late-script":
                        broken = (
                            html[:match.start()]
                            + '<script src="https://external.invalid/synthetic.js"></script>'
                            + tag + html[match.end():]
                        )
                    elif corruption == "fake-comment-head":
                        broken = (
                            "<!--<head>" + tag + "-->"
                            + html[:match.start()] + html[match.end():]
                        )
                    elif corruption == "wrong-asset-base":
                        broken = html.replace("/seller/assets/", "/unrelated/assets/")
                        self.assertNotEqual(broken, html)
                    else:
                        self.fail(f"Unknown scenario: {corruption}")
                    index.write_text(broken, encoding="utf-8")
            env = dict(os.environ)
            env.update({
                "NODE_ENV": "production",
                "MERCUR_DISABLE_TELEMETRY": "true",
                "MERCUR_BACKEND_URL": "https://backend.invalid",
                "JWT_SECRET": secrets.token_hex(48),
                "COOKIE_SECRET": secrets.token_hex(48),
            })
            result = subprocess.run(
                ["node", str(script_dir / "bundle-dashboards.mjs")],
                cwd=api, env=env, text=True, capture_output=True,
                check=False, timeout=60,
            )
            if corruption is None:
                self.assertEqual(result.returncode, 0, result.stderr[-1500:])
                self.assertIn("[bundle-dashboards] done — the artifact serves 2 panel(s)", result.stdout)
                for panel in ("admin", "vendor"):
                    copied = artifact / "dashboards" / panel / "dist" / "index.html"
                    self.assertTrue(copied.is_file(), f"Real {panel} dist not bundled")
                    self.assertEqual(
                        copied.read_bytes(),
                        (fixture / "apps" / panel / "dist" / "index.html").read_bytes(),
                    )
                print("PASS #378 production bundler: REAL Admin + Vendor Vite dist accepted and copied, 2/2")
            else:
                self.assertNotEqual(result.returncode, 0, "Unsafe dist was distributable")
                marker = (
                    "the vendor panel was built with the wrong base path"
                    if corruption == "wrong-asset-base"
                    else f"Unprotected {name} panel: first-party-only early connect-src CSP missing"
                )
                self.assertIn(marker, result.stderr, result.stdout[-1300:] + result.stderr[-1300:])
                self.assertFalse(
                    (artifact / "dashboards" / name / "dist").exists(),
                    f"Unsafe {name} Vite dist was copied before rejection",
                )
                print(f"PASS #378 production bundler: REAL {name} Vite dist {corruption} rejected before copy")

    def test_01_guard_unit_exact_checkout(self):
        result = subprocess.run(
            ["node", "--test", "packages/api/scripts/dashboard-csp.unit.test.mjs"],
            cwd=ROOT, text=True, capture_output=True, timeout=45, check=False,
        )
        self.assertEqual(result.returncode, 0, (result.stdout + result.stderr)[-1600:])
        self.assertRegex(result.stdout, r"# pass 5\b")
        print("PASS #378 dashboard-csp.unit.test.mjs: 5/5 Node exact checkout")

    def test_02_real_vite_production_bundle_accepts_both(self):
        self.run_actual_bundler()

    def test_03_real_vite_production_bundle_rejects_unsafe_csp(self):
        cases = [
            ("admin", "missing"),
            ("admin", "external-origin"),
            ("admin", "comment-only"),
            ("admin", "late-script"),
            ("admin", "fake-comment-head"),
            ("vendor", "external-origin"),
            ("vendor", "wrong-asset-base"),
        ]
        for name, corruption in cases:
            with self.subTest(panel=name, corruption=corruption):
                self.run_actual_bundler(name, corruption)
