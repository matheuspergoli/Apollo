import json
from pathlib import Path
import re
import unittest
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[2]


class RepositoryPolicyTests(unittest.TestCase):
    def test_runtime_contract_cannot_omit_virtual_display_inputs(self):
        contract = json.loads((ROOT / "packaging/windows/runtime-contract.json").read_text())
        for name in ["SudoVDA.dll", "nefconc.exe", "SudoVDA.inf", "sudovda.cat", "sudovda.cer"]:
            key = "drivers/sudovda/" + name
            self.assertIn(key, contract["requiredFiles"])
            self.assertRegex(contract["sha256"][key], r"^[a-f0-9]{64}$")
        self.assertIn("tools/sudovda-status.exe", contract["requiredFiles"])

    def test_upgrade_must_not_run_the_previous_uninstaller(self):
        source = (ROOT / "cmake/packaging/windows_nsis.cmake").read_text()
        self.assertIn("set(CPACK_NSIS_ENABLE_UNINSTALL_BEFORE_INSTALL OFF)", source)
        self.assertIn("set(CPACK_MONOLITHIC_INSTALL ON)", source)
        self.assertNotIn('RMDir /r', source)

    def test_installer_errors_have_silent_defaults(self):
        source = (ROOT / "cmake/packaging/windows_nsis.cmake").read_text()
        messages = [line for line in source.splitlines() if line.strip().startswith("MessageBox ")]
        self.assertTrue(messages)
        for line in messages:
            self.assertIn("/SD IDOK", line)

    def test_external_actions_are_pinned_to_commits(self):
        for path in (ROOT / ".github/workflows").glob("*.yml"):
            workflow = path.read_text(encoding="utf-8")
            for action, revision in re.findall(r"uses:\s*([\w.-]+/[\w.-]+)@([^\s]+)", workflow):
                with self.subTest(workflow=path.name, action=action):
                    self.assertRegex(revision, r"^[a-f0-9]{40}$")

    def test_javascript_commands_use_pnpm(self):
        for path in [ROOT / "package.json", ROOT / "dashboard/package.json"]:
            package = json.loads(path.read_text(encoding="utf-8"))
            self.assertRegex(package["packageManager"], r"^pnpm@\d+\.\d+\.\d+$")
            for name, command in package["scripts"].items():
                with self.subTest(package=package["name"], script=name):
                    self.assertNotRegex(command, r"\b(?:npm|npx)\s")
        self.assertTrue((ROOT / "pnpm-lock.yaml").is_file())
        for directory in [ROOT, ROOT / "dashboard"]:
            for name in ["package-lock.json", "yarn.lock"]:
                self.assertFalse((directory / name).exists(), str(directory / name))

    def test_browser_image_is_pinned_and_matches_playwright(self):
        package = json.loads((ROOT / "dashboard/package.json").read_text(encoding="utf-8"))
        workflow = (ROOT / ".github/workflows/dashboard.yml").read_text(encoding="utf-8")
        image = re.search(r"image:\s+mcr\.microsoft\.com/playwright:v([\d.]+)-noble@sha256:([a-f0-9]{64})", workflow)
        self.assertIsNotNone(image, "Browser CI must use a digest-pinned official Playwright image")
        self.assertEqual(image.group(1), package["devDependencies"]["@playwright/test"])

    def test_maintained_documentation_links_resolve(self):
        files = [
            "README.md",
            "dashboard/README.md",
            "docs/development.md",
            "docs/contributing.md",
            "docs/getting_started.md",
            "docs/building.md",
            "docs/legal.md",
            "docs/clock-corrections.md",
            "docs/releases/v1.0.0.md",
            "docs/releases/v1.0.1.md",
            "docs/releases/v1.0.2.md",
            ".github/CONTRIBUTING.md",
        ]
        for filename in files:
            source = ROOT / filename
            text = source.read_text(encoding="utf-8")
            for link in re.findall(r"\[[^\]]*\]\(([^)]+)\)", text):
                if re.match(r"^[a-z][a-z\d+.-]*:", link, re.I) or link.startswith("#"):
                    continue
                path = unquote(link.split("#", 1)[0])
                with self.subTest(source=filename, link=link):
                    self.assertTrue(
                        (source.parent / path).exists(),
                        f"Broken local documentation link: {filename} -> {link}",
                    )


if __name__ == "__main__":
    unittest.main()
