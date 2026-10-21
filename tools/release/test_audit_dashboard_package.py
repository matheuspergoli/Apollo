import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

SOURCE = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("package_audit", Path(__file__).with_name("audit-dashboard-package.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PackageAuditTests(unittest.TestCase):
    def package(self, extra=None, omit=None):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        path = Path(temporary.name) / "Apollo.zip"
        entries = {"Apollo/sunshine.exe": b"test fixture, not executable"}
        pages = ["index", "apps", "config", "pin", "password", "login", "welcome", "troubleshooting"]
        web = "Apollo/assets/web/"
        for page in pages:
            entries[web + page + ".html"] = b'<html lang="pt-BR"></html>'
        entries[web + "ui-build.json"] = json.dumps({"router": "file-based", "releaseReady": False, "entryPoints": ["/" if page == "index" else "/" + page for page in pages]}).encode()
        for image in (SOURCE / "dashboard/public/images").iterdir():
            if image.is_file():
                data = image.read_bytes()
                if image.suffix == ".svg":
                    data = data.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
                entries[web + "images/" + image.name] = data
        entries.update(extra or {})
        if omit:
            entries.pop(omit)
        with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name, data in entries.items():
                archive.writestr(name, data)
        return path

    def test_candidate_and_windows_svg_line_endings(self):
        self.assertEqual(MODULE.audit(self.package(), SOURCE)["status"], "candidate-audit-passed")

    def test_rejects_private_legacy_and_unsafe_entries(self):
        for name in ["Apollo/config/credentials.json", "Apollo/key.pem", "Apollo/assets/web/locale/en.json", "../escape", "C:/escape"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                MODULE.audit(self.package({name: b"invalid"}), SOURCE)

    def test_rejects_missing_page(self):
        with self.assertRaises(KeyError):
            MODULE.audit(self.package(omit="Apollo/assets/web/login.html"), SOURCE)

    def test_rejects_modified_binary_asset(self):
        with self.assertRaises(ValueError):
            MODULE.audit(self.package({"Apollo/assets/web/images/apollo.ico": b"changed"}), SOURCE)


if __name__ == "__main__":
    unittest.main()
