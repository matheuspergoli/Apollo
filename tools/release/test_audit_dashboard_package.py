import importlib.util
import json
from pathlib import Path
import hashlib
import shutil
import struct
import tempfile
import unittest
import zipfile

SOURCE = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("package_audit", Path(__file__).with_name("audit-dashboard-package.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PackageAuditTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.source = Path(temporary.name) / "source"
        for name in ["LICENSE", "NOTICE", "dashboard/package.json"]:
            target = self.source / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(SOURCE / name, target)
        shutil.copytree(SOURCE / "dashboard/public/images", self.source / "dashboard/public/images")
        contract = json.loads((SOURCE / "packaging/windows/runtime-contract.json").read_text())
        # Header-only fixtures are never executed. Production vendor hashes stay
        # pinned to the real files in the repository's runtime contract.
        binary = bytearray(80)
        binary[:2] = b"MZ"
        struct.pack_into("<I", binary, 60, 64)
        binary[64:68] = b"PE\0\0"
        struct.pack_into("<H", binary, 68, 0x8664)
        self.runtime = {name: b"unit fixture" for name in contract["requiredFiles"]}
        for name in contract["peX64"]:
            self.runtime[name] = bytes(binary)
        contract["sha256"] = {
            name: hashlib.sha256(self.runtime[name]).hexdigest() for name in contract["sha256"]
        }
        target = self.source / "packaging/windows/runtime-contract.json"
        target.parent.mkdir(parents=True)
        target.write_text(json.dumps(contract))
        self.runtime["drivers/sudovda/runtime-contract.json"] = json.dumps(contract).encode()

    def package(self, extra=None, omit=None):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        path = Path(temporary.name) / "Apollo.zip"
        entries = {"Apollo/" + name: data for name, data in self.runtime.items()}
        pages = ["index", "apps", "config", "pin", "password", "login", "welcome", "troubleshooting"]
        web = "Apollo/assets/web/"
        entries[web + "LICENSE.txt"] = (self.source / "LICENSE").read_bytes()
        dependencies = json.loads((self.source / "dashboard/package.json").read_text(encoding="utf-8"))["dependencies"]
        notices = (self.source / "NOTICE").read_text(encoding="utf-8").strip()
        notices += "\n" + "\n".join(f"{name}@{version}" for name, version in dependencies.items())
        entries[web + "NOTICE.txt"] = notices.encode()
        for page in pages:
            entries[web + page + ".html"] = b'<html lang="pt-BR"></html>'
        entries[web + "ui-build.json"] = json.dumps({
            "router": "file-based",
            "version": json.loads((self.source / "dashboard/package.json").read_text(encoding="utf-8"))["version"],
            "mode": "react-dashboard",
            "language": "pt-BR",
            "entryPoints": ["/" if page == "index" else "/" + page for page in pages],
        }).encode()
        for image in (self.source / "dashboard/public/images").iterdir():
            if image.is_file():
                data = image.read_bytes()
                if image.suffix == ".svg":
                    data = data.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
                entries[web + "images/" + image.name] = data
        entries.update(extra or {})
        if omit:
            entries.pop(omit)
        if "Apollo/installation-manifest.json" not in entries:
            entries["Apollo/installation-manifest.json"] = json.dumps({
                "format": "apollo-installed-files", "version": 1,
                "appVersion": json.loads((self.source / "dashboard/package.json").read_text())["version"],
                "files": {name.removeprefix("Apollo/"): hashlib.sha256(data).hexdigest() for name, data in entries.items()},
            }).encode()
        with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name, data in entries.items():
                archive.writestr(name, data)
        return path

    def test_package_and_windows_svg_line_endings(self):
        self.assertEqual(MODULE.audit(self.package(), self.source)["status"], "package-audit-passed")

    def test_rejects_mismatched_release_version(self):
        with self.assertRaises(ValueError):
            manifest = b'{"router":"file-based","version":"0.0.0"}'
            MODULE.audit(self.package({"Apollo/assets/web/ui-build.json": manifest}), self.source)

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
                MODULE.audit(self.package({name: b"invalid"}), self.source)

    def test_rejects_missing_page(self):
        with self.assertRaises(KeyError):
            MODULE.audit(self.package(omit="Apollo/assets/web/login.html"), self.source)

    def test_rejects_modified_binary_asset(self):
        with self.assertRaises(ValueError):
            MODULE.audit(self.package({"Apollo/assets/web/images/apollo.ico": b"changed"}), self.source)

    def test_rejects_dropped_license_or_notices(self):
        for name in ["LICENSE.txt", "NOTICE.txt"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                MODULE.audit(self.package({"Apollo/assets/web/" + name: b"incomplete"}), self.source)

    def test_rejects_missing_runtime_components_including_driver_binaries(self):
        for name in self.runtime:
            with self.subTest(name=name), self.assertRaises(ValueError):
                MODULE.audit(self.package(omit="Apollo/" + name), self.source)

    def test_rejects_changed_vendor_payload(self):
        name = "Apollo/drivers/sudovda/SudoVDA.dll"
        with self.assertRaisesRegex(ValueError, "Vendor payload differs"):
            changed = self.runtime[name.removeprefix("Apollo/")] + b"changed"
            MODULE.audit(self.package({name: changed}), self.source)

    def test_rejects_text_file_disguised_as_host_executable(self):
        with self.assertRaisesRegex(ValueError, "Windows binary is invalid"):
            MODULE.audit(self.package({"Apollo/sunshine.exe": b"not an executable"}), self.source)

    def test_rejects_wrong_host_architecture(self):
        binary = bytearray(self.runtime["sunshine.exe"])
        struct.pack_into("<H", binary, 68, 0x14C)
        with self.assertRaisesRegex(ValueError, "not x64"):
            MODULE.audit(self.package({"Apollo/sunshine.exe": bytes(binary)}), self.source)

    def test_rejects_incomplete_installed_file_manifest(self):
        manifest = {"format": "apollo-installed-files", "version": 1,
                    "appVersion": json.loads((self.source / "dashboard/package.json").read_text())["version"], "files": {}}
        with self.assertRaisesRegex(ValueError, "does not cover the complete package"):
            MODULE.audit(self.package({"Apollo/installation-manifest.json": json.dumps(manifest).encode()}), self.source)


if __name__ == "__main__":
    unittest.main()
