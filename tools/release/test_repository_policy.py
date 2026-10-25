import json
from pathlib import Path
import re
import unittest
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[2]


class RepositoryPolicyTests(unittest.TestCase):
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
