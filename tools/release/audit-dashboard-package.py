#!/usr/bin/env python3
"""Read-only audit of a native package; never starts or installs the host."""

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import zipfile


def audit(archive: Path, source: Path) -> dict:
    pages = {"index", "apps", "config", "pin", "password", "login", "welcome", "troubleshooting"}
    with zipfile.ZipFile(archive) as package:
        names = package.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate archive entries")
        for name in names:
            path = PurePosixPath(name)
            if path.is_absolute() or ".." in path.parts or "\\" in name or ":" in name:
                raise ValueError(f"Unsafe archive path: {name}")
            lower = name.lower()
            if any(token in lower for token in ("apollo-preview", ".vue", "bootstrap", "i18next", "/locale/", "/locales/")):
                raise ValueError(f"Legacy web asset: {name}")
            if path.name.lower() in {"sunshine.conf", "sunshine_state.json", "credentials.json", "sunshine.log"} or path.suffix.lower() in {".pem", ".key"}:
                raise ValueError(f"Private host state in package: {name}")
        hosts = [name for name in names if PurePosixPath(name).name.lower() == "sunshine.exe"]
        if hosts != ["Apollo/sunshine.exe"]:
            raise ValueError("Expected exactly one packaged Apollo host")
        web = "Apollo/assets/web/"
        manifest = json.loads(package.read(web + "ui-build.json"))
        if manifest.get("router") != "file-based" or manifest.get("releaseReady") is not False:
            raise ValueError("Expected file-based React validation candidate, not an unverified release")
        entries = {"/" if page == "index" else "/" + page for page in pages}
        if set(manifest.get("entryPoints", [])) != entries:
            raise ValueError("Missing host page entry points")
        for page in pages:
            if 'lang="pt-BR"' not in package.read(web + page + ".html").decode("utf-8"):
                raise ValueError(f"Invalid fixed-language HTML: {page}")
        images = list((source / "dashboard/public/images").glob("*"))
        if not images:
            raise ValueError("Source image fixtures are missing")
        for image in images:
            if not image.is_file():
                continue
            packaged = package.read(web + "images/" + image.name)
            original = image.read_bytes()
            # Git's Windows checkout may normalize SVG line endings; binary assets stay exact.
            if image.suffix.lower() == ".svg":
                packaged = packaged.replace(b"\r\n", b"\n")
                original = original.replace(b"\r\n", b"\n")
            if packaged != original:
                raise ValueError(f"Image changed in packaging: {image.name}")
    return {"archive": archive.name, "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(), "entries": len(names), "hostPages": len(pages), "imageAssets": len(images), "status": "candidate-audit-passed", "deviceValidated": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    print(json.dumps(audit(args.archive, args.source), indent=2))
