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
        entries[web + "LICENSE.txt"] = (SOURCE / "LICENSE").read_bytes()
        dependencies = json.loads((SOURCE / "dashboard/package.json").read_text(encoding="utf-8"))["dependencies"]
        notices = (SOURCE / "NOTICE").read_text(encoding="utf-8").strip()
        notices += "\n" + "\n".join(f"{name}@{version}" for name, version in dependencies.items())
        entries[web + "NOTICE.txt"] = notices.encode()
        for page in pages:
            entries[web + page + ".html"] = b'<html lang="pt-BR"></html>'
        entries[web + "ui-build.json"] = json.dumps({
            "router": "file-based",
            "version": json.loads((SOURCE / "dashboard/package.json").read_text(encoding="utf-8"))["version"],
            "mode": "react-dashboard",
            "language": "pt-BR",
            "entryPoints": ["/" if page == "index" else "/" + page for page in pages],
        }).encode()
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

    def test_package_and_windows_svg_line_endings(self):
        self.assertEqual(MODULE.audit(self.package(), SOURCE)["status"], "package-audit-passed")

    def test_rejects_mismatched_release_version(self):
        with self.assertRaises(ValueError):
            manifest = b'{"router":"file-based","version":"0.0.0"}'
            MODULE.audit(self.package({"Apollo/assets/web/ui-build.json": manifest}), SOURCE)

    def test_rejects_private_legacy_and_unsafe_entries(self):
        unsafe = [
            "Apollo/config/credentials.json",
            "Apollo/key.pem",
            "Apollo/assets/web/locale/en.json",
            "../escape",
            "C:/escape",
        ]
        for name in unsafe:
            with self.subTest(name=name), self.assertRaises(ValueError):
                MODULE.audit(self.package({name: b"invalid"}), SOURCE)

    def test_rejects_missing_page(self):
        with self.assertRaises(KeyError):
            MODULE.audit(self.package(omit="Apollo/assets/web/login.html"), SOURCE)

    def test_rejects_modified_binary_asset(self):
        with self.assertRaises(ValueError):
            MODULE.audit(self.package({"Apollo/assets/web/images/apollo.ico": b"changed"}), SOURCE)

    def test_rejects_dropped_license_or_notices(self):
        for name in ["LICENSE.txt", "NOTICE.txt"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                MODULE.audit(self.package({"Apollo/assets/web/" + name: b"incomplete"}), SOURCE)


if __name__ == "__main__":
    unittest.main()
