import importlib.util
import json
from pathlib import Path
import re
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("installer_audit", Path(__file__).with_name("audit-windows-installer.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ReleaseMetadataTests(unittest.TestCase):
    def test_versions_match(self):
        version = json.loads((ROOT / "dashboard/package.json").read_text())["version"]
        self.assertRegex(version, r"^\d+\.\d+\.\d+$")
        native = re.search(r"project\(Apollo VERSION ([\d.]+)", (ROOT / "CMakeLists.txt").read_text()).group(1)
        lock = json.loads((ROOT / "dashboard/package-lock.json").read_text())
        self.assertEqual(native, version)
        self.assertEqual(lock["version"], version)
        self.assertEqual(lock["packages"][""]["version"], version)

    def test_installer_payload_must_match_zip(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            extracted = root / "extracted"
            extracted.mkdir()
            host = extracted / "sunshine.exe"
            host.write_bytes(b"unit fixture, not executable")
            archive = root / "Apollo.zip"
            with zipfile.ZipFile(archive, "w") as package:
                package.writestr("Apollo/sunshine.exe", host.read_bytes())
            self.assertEqual(MODULE.compare_payload(extracted, archive), 1)
            host.write_bytes(b"different")
            with self.assertRaises(ValueError):
                MODULE.compare_payload(extracted, archive)

    def test_installer_must_include_web_assets(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "sunshine.exe").write_bytes(b"fixture")
            archive = root / "Apollo.zip"
            with zipfile.ZipFile(archive, "w") as package:
                package.writestr("Apollo/sunshine.exe", b"fixture")
                package.writestr("Apollo/assets/web/index.html", b"missing")
            with self.assertRaises(ValueError):
                MODULE.compare_payload(root, archive)


if __name__ == "__main__":
    unittest.main()
