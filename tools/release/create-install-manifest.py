#!/usr/bin/env python3
"""Describe exact public program files staged by CMake, without executing them."""
import argparse
import hashlib
import json
from pathlib import Path


def create(root: Path, version: str) -> dict:
    files = {}
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError("Installation payload must not contain links")
        if not path.is_file() or path.name == "installation-manifest.json":
            continue
        relative = path.relative_to(root).as_posix()
        private_names = {"sunshine.conf", "sunshine_state.json", "credentials.json", "sunshine.log"}
        if ("config" in relative.lower().split("/") or path.suffix.lower() in {".key", ".pem"}
                or path.name.lower() in private_names):
            raise ValueError("Private data cannot enter an installation manifest")
        files[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
    if "sunshine.exe" not in files:
        raise ValueError("Staged host executable is missing")
    return {"format": "apollo-installed-files", "version": 1, "appVersion": version, "files": files}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = Path(__file__).resolve().parents[2]
    version = json.loads((source / "package.json").read_text())["version"]
    args.output.write_text(json.dumps(create(args.root, version), indent=2) + "\n", encoding="utf-8")
