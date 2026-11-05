"""Exercise the production workflow's guards before it can create a release tag."""

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/promote-release.yml"


def production_guards():
    return [
        "\n".join(line[10:] for line in body.splitlines())
        for body in re.findall(r"          python - <<'PY'\n(.*?)\n          PY", WORKFLOW.read_text(), re.S)
    ]


class ReleasePromotionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.env = {**os.environ, "GH_REPO": "matheuspergoli/Apollo", "VERSION": "1.0.5",
                    "RUN_ID": "123", "SOURCE_COMMIT": "a" * 40}
        self.accepted = self.root / "accepted"
        (self.accepted / "cpack_artifacts").mkdir(parents=True)
        self.digests = {}
        for name, key in [("Apollo.exe", "INSTALLER_SHA256"), ("Apollo.zip", "PORTABLE_SHA256")]:
            content = f"generic accepted {name}".encode()
            (self.accepted / "cpack_artifacts" / name).write_bytes(content)
            self.digests[name] = self.env[key] = hashlib.sha256(content).hexdigest()
        (self.accepted / "SOURCE_COMMIT.txt").write_text(self.env["SOURCE_COMMIT"] + "\n")
        (self.accepted / "SHA256SUMS.txt").write_text("".join(
            f"{digest}  cpack_artifacts/{name}\n" for name, digest in self.digests.items()))
        self.guards = production_guards()
        self.assertEqual(len(self.guards), 2)

    def execute(self, index):
        return subprocess.run([sys.executable, "-c", self.guards[index]], cwd=self.root,
                              env=self.env, capture_output=True, text=True)

    def test_valid_payload_is_promoted_without_changing_binary_bytes(self):
        result = self.execute(1)
        self.assertEqual(result.returncode, 0, result.stderr)
        for name, digest in self.digests.items():
            self.assertEqual(hashlib.sha256((self.root / "public" / name).read_bytes()).hexdigest(), digest)
        self.assertEqual((self.root / "public/SOURCE_COMMIT.txt").read_text().strip(), self.env["SOURCE_COMMIT"])
        self.assertEqual((self.root / "public/SHA256SUMS.txt").read_text(), "".join(
            f"{digest}  {name}\n" for name, digest in self.digests.items()))

    def test_changed_source_is_rejected_before_public_assets_exist(self):
        (self.accepted / "SOURCE_COMMIT.txt").write_text("b" * 40)
        self.assertNotEqual(self.execute(1).returncode, 0)
        self.assertFalse((self.root / "public").exists())

    def test_changed_binary_is_rejected_before_public_assets_exist(self):
        (self.accepted / "cpack_artifacts/Apollo.exe").write_bytes(b"changed")
        self.assertNotEqual(self.execute(1).returncode, 0)
        self.assertFalse((self.root / "public").exists())

    def test_ambiguous_binary_is_rejected(self):
        (self.accepted / "Apollo.exe").write_bytes(b"duplicate")
        self.assertNotEqual(self.execute(1).returncode, 0)
        self.assertFalse((self.root / "public").exists())

    def test_changed_build_checksum_is_rejected(self):
        (self.accepted / "SHA256SUMS.txt").write_text("0" * 64 + "  cpack_artifacts/Apollo.exe\n")
        self.assertNotEqual(self.execute(1).returncode, 0)
        self.assertFalse((self.root / "public").exists())

    def test_source_run_requires_successful_owned_windows_build(self):
        notes = self.root / "docs/releases/v1.0.5.md"
        notes.parent.mkdir(parents=True)
        notes.write_text("Generic release notes")
        valid = {"head_sha": self.env["SOURCE_COMMIT"], "status": "completed", "conclusion": "success",
                 "path": ".github/workflows/apollo-windows.yml", "event": "workflow_dispatch",
                 "head_repository": {"full_name": self.env["GH_REPO"]}}
        # Replace only the external metadata transport; execute the actual guards.
        prefix = "import subprocess\nsubprocess.check_output = lambda *a, **k: "
        for replacement in [{}, {"head_sha": "b" * 40}, {"conclusion": "failure"},
                            {"status": "in_progress"}, {"path": ".github/workflows/dashboard.yml"},
                            {"event": "pull_request"}, {"head_repository": {"full_name": "other/repo"}}]:
            with self.subTest(replacement=replacement):
                metadata = json.dumps({**valid, **replacement})
                result = subprocess.run([sys.executable, "-c", prefix + repr(metadata) + "\n" + self.guards[0]],
                                        cwd=self.root, env=self.env, capture_output=True, text=True)
                self.assertEqual(result.returncode == 0, not replacement, result.stderr)


if __name__ == "__main__":
    unittest.main()
