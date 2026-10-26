import importlib.util
import tempfile
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location(
    "install_manifest", Path(__file__).with_name("create-install-manifest.py")
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class InstallManifestTests(unittest.TestCase):
    def test_public_file_hashes_and_self_exclusion(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "sunshine.exe").write_bytes(b"fixture, never executed")
            (root / "installation-manifest.json").write_text("previous manifest")
            result = MODULE.create(root, "1.0.1")
            self.assertEqual(set(result["files"]), {"sunshine.exe"})
            self.assertEqual(result["appVersion"], "1.0.1")

    def test_refuses_private_state(self):
        for name in ["sunshine_state.json", "credentials.json", "server.key", "config/unknown.bin", "Config/data.bin"]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / "sunshine.exe").write_bytes(b"fixture")
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("private fixture")
                with self.assertRaises(ValueError):
                    MODULE.create(root, "1.0.1")

    def test_nested_manifest_is_inventoried_as_a_program_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "sunshine.exe").write_bytes(b"fixture, never executed")
            (root / "assets").mkdir()
            (root / "assets/installation-manifest.json").write_text("public fixture")
            result = MODULE.create(root, "1.0.1")
            self.assertEqual(set(result["files"]), {"sunshine.exe", "assets/installation-manifest.json"})

    def test_refuses_even_an_empty_private_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "sunshine.exe").write_bytes(b"fixture, never executed")
            (root / "config").mkdir()
            with self.assertRaises(ValueError):
                MODULE.create(root, "1.0.1")


if __name__ == "__main__":
    unittest.main()
