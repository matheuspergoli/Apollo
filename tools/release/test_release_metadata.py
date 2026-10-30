import importlib.util
import json
from pathlib import Path
import re
import subprocess
import struct
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("installer_audit", Path(__file__).with_name("audit-windows-installer.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ReleaseMetadataTests(unittest.TestCase):
    def test_checkout_guard_ignores_only_crlf(self):
        with tempfile.TemporaryDirectory() as temporary:
            left, right = Path(temporary) / "source", Path(temporary) / "checkout"
            left.write_bytes(b"int value = 1;\n")
            right.write_bytes(b"int value = 1;\r\n")
            command = ["git", "diff", "--no-index", "--ignore-cr-at-eol", "--exit-code", str(left), str(right)]
            self.assertEqual(subprocess.run(command, capture_output=True).returncode, 0)
            right.write_bytes(b"int value = 2;\r\n")
            self.assertEqual(subprocess.run(command, capture_output=True).returncode, 1)

    def test_versions_match(self):
        version = json.loads((ROOT / "dashboard/package.json").read_text())["version"]
        self.assertRegex(version, r"^\d+\.\d+\.\d+$")
        native = re.search(r"project\(Apollo VERSION ([\d.]+)", (ROOT / "CMakeLists.txt").read_text()).group(1)
        root_package = json.loads((ROOT / "package.json").read_text())
        dashboard = json.loads((ROOT / "dashboard/package.json").read_text())
        self.assertEqual(native, version)
        self.assertEqual(root_package["version"], version)
        self.assertEqual(root_package["packageManager"], dashboard["packageManager"])
        self.assertRegex(root_package["packageManager"], r"^pnpm@\d+\.\d+\.\d+$")
        self.assertTrue((ROOT / "pnpm-lock.yaml").is_file())
        self.assertFalse((ROOT / "dashboard/package-lock.json").exists())

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

    def test_installer_rejects_extra_program_files_but_not_plugin_metadata(self):
        with tempfile.TemporaryDirectory() as temporary:
            extracted = Path(temporary)
            root = extracted / "program"
            root.mkdir()
            (root / "sunshine.exe").write_bytes(b"fixture")
            plugins = extracted / "$PLUGINSDIR"
            plugins.mkdir()
            (plugins / "System.dll").write_bytes(b"extractor metadata fixture")
            archive = extracted / "Apollo.zip"
            with zipfile.ZipFile(archive, "w") as package:
                package.writestr("Apollo/sunshine.exe", b"fixture")
            self.assertEqual(MODULE.compare_payload(extracted, archive), 1)
            (root / "extra.ps1").write_text("fixture, never executed")
            with self.assertRaisesRegex(ValueError, "Unexpected installer program files"):
                MODULE.compare_payload(extracted, archive)

    def test_nsis_control_namespace_and_embedded_copies_are_verified(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "extracted"
            root.mkdir()
            files = {"sunshine.exe": b"fixture", "scripts/update-installation.ps1": b"update fixture",
                     "scripts/installation-data.ps1": b"data fixture", "installation-manifest.json": b"manifest"}
            archive = root.parent / "Apollo.zip"
            with zipfile.ZipFile(archive, "w") as package:
                for name, data in files.items():
                    target = root / name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
                    package.writestr("Apollo/" + name, data)
            plugins = root / "$PLUGINSDIR"
            plugins.mkdir()
            for name in ["update-installation.ps1", "installation-data.ps1", "installation-manifest.json"]:
                public = name if name == "installation-manifest.json" else "scripts/" + name
                (plugins / name).write_bytes(files[public])
            (plugins / "System.dll").write_bytes(b"NSIS plugin fixture")
            (plugins / "ioSpecial.ini").write_bytes(b"NSIS control fixture")
            self.assertEqual(MODULE.compare_payload(root, archive), len(files))
            (plugins / "installation-data.ps1").unlink()
            with self.assertRaisesRegex(ValueError, "Missing embedded installer copies"):
                MODULE.compare_payload(root, archive)
            (plugins / "installation-data.ps1").write_bytes(files["scripts/installation-data.ps1"])
            (plugins / "update-installation.ps1").write_bytes(b"tampered")
            with self.assertRaisesRegex(ValueError, "Embedded installer copy differs"):
                MODULE.compare_payload(root, archive)
            (plugins / "update-installation.ps1").write_bytes(files["scripts/update-installation.ps1"])
            (plugins / "extra.ps1").write_bytes(b"unknown control file")
            with self.assertRaisesRegex(ValueError, "Unexpected NSIS control"):
                MODULE.compare_payload(root, archive)

    def test_uninstaller_exception_requires_pe_structure(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "program"
            root.mkdir()
            (root / "sunshine.exe").write_bytes(b"fixture")
            archive = root.parent / "Apollo.zip"
            with zipfile.ZipFile(archive, "w") as package:
                package.writestr("Apollo/sunshine.exe", b"fixture")
            uninstaller = root / "Uninstall.exe"
            uninstaller.write_bytes(b"not a generated PE")
            with self.assertRaisesRegex(ValueError, "Invalid NSIS uninstaller"):
                MODULE.compare_payload(root, archive)
            data = bytearray(80)
            data[:2] = b"MZ"
            struct.pack_into("<I", data, 60, 64)
            data[64:68] = b"PE\0\0"
            uninstaller.write_bytes(data)
            self.assertEqual(MODULE.compare_payload(root, archive), 1)

    def test_nsis_control_namespace_cannot_be_declared_as_public_zip_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "program"
            root.mkdir()
            (root / "sunshine.exe").write_bytes(b"fixture")
            plugins = root / "$PLUGINSDIR"
            plugins.mkdir()
            (plugins / "System.dll").write_bytes(b"control fixture")
            archive = root.parent / "Apollo.zip"
            with zipfile.ZipFile(archive, "w") as package:
                package.writestr("Apollo/sunshine.exe", b"fixture")
                package.writestr("Apollo/$PLUGINSDIR/System.dll", b"control fixture")
            with self.assertRaisesRegex(ValueError, "NSIS controls must not be part"):
                MODULE.compare_payload(root, archive)


if __name__ == "__main__":
    unittest.main()
