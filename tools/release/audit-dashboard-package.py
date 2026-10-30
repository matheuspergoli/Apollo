#!/usr/bin/env python3
"""Read-only audit of a native package; never starts or installs the host."""

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import struct
import zipfile

from public_payload import validate_public_path


def audit(archive: Path, source: Path) -> dict:
    pages = {"index", "apps", "config", "pin", "password", "login", "welcome", "troubleshooting"}
    with zipfile.ZipFile(archive) as package:
        names = package.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate archive entries")
        paths = set()
        for entry in package.infolist():
            name = entry.filename
            if stat.S_ISLNK(entry.external_attr >> 16):
                raise ValueError(f"Symbolic link in package: {name}")
            if name == "Apollo/" and entry.is_dir():
                continue
            if not name.startswith("Apollo/"):
                raise ValueError(f"Unexpected archive root: {name}")
            relative = name.removeprefix("Apollo/")
            key = validate_public_path(relative.removesuffix("/") if entry.is_dir() else relative)
            if key in paths:
                raise ValueError(f"Windows payload path collision: {name}")
            paths.add(key)
            lower = name.lower()
            legacy_tokens = ("apollo-preview", ".vue", "bootstrap", "i18next", "/locale/", "/locales/")
            if any(token in lower for token in legacy_tokens):
                raise ValueError(f"Legacy web asset: {name}")
        hosts = [name for name in names if PurePosixPath(name).name.lower() == "sunshine.exe"]
        if hosts != ["Apollo/sunshine.exe"]:
            raise ValueError("Expected exactly one packaged Apollo host")
        contract = json.loads((source / "packaging/windows/runtime-contract.json").read_text(encoding="utf-8"))
        for name in contract["requiredFiles"]:
            if "Apollo/" + name not in names or not package.read("Apollo/" + name):
                raise ValueError(f"Required runtime file is missing or empty: {name}")
        packaged_contract = json.loads(package.read("Apollo/drivers/sudovda/runtime-contract.json"))
        if packaged_contract != contract:
            raise ValueError("Packaged runtime contract differs from the source contract")
        for name, expected in contract["sha256"].items():
            if hashlib.sha256(package.read("Apollo/" + name)).hexdigest() != expected:
                raise ValueError(f"Vendor payload differs from the approved package: {name}")
        for name in contract["peX64"]:
            data = package.read("Apollo/" + name)
            if len(data) < 64 or data[:2] != b"MZ":
                raise ValueError(f"Required Windows binary is invalid: {name}")
            offset = struct.unpack_from("<I", data, 0x3C)[0]
            if offset > len(data) - 6 or data[offset:offset + 4] != b"PE\0\0":
                raise ValueError(f"Required Windows binary has no PE header: {name}")
            if struct.unpack_from("<H", data, offset + 4)[0] != 0x8664:
                raise ValueError(f"Required Windows binary is not x64: {name}")
        installed = json.loads(package.read("Apollo/installation-manifest.json"))
        version = json.loads((source / "dashboard/package.json").read_text(encoding="utf-8"))["version"]
        if (not isinstance(installed, dict) or installed.get("format") != "apollo-installed-files"
                or installed.get("version") != 1 or installed.get("appVersion") != version):
            raise ValueError("Invalid installed-files manifest")
        records = installed.get("files")
        expected_files = {
            entry.filename.removeprefix("Apollo/") for entry in package.infolist()
            if not entry.is_dir() and entry.filename != "Apollo/installation-manifest.json"
        }
        if not isinstance(records, dict) or set(records) != expected_files:
            raise ValueError("Installed-files manifest does not cover the complete package")
        for name, expected in records.items():
            if hashlib.sha256(package.read("Apollo/" + name)).hexdigest() != expected:
                raise ValueError(f"Installed-files manifest hash mismatch: {name}")
        web = "Apollo/assets/web/"
        manifest = json.loads(package.read(web + "ui-build.json"))
        version = json.loads((source / "dashboard/package.json").read_text(encoding="utf-8"))["version"]
        if manifest.get("router") != "file-based" or manifest.get("version") != version:
            raise ValueError("Expected file-based React dashboard with matching release version")
        if manifest.get("language") != "pt-BR" or manifest.get("mode") != "react-dashboard":
            raise ValueError("Unexpected dashboard mode or language")
        license_text = package.read(web + "LICENSE.txt").decode("utf-8").replace("\r\n", "\n")
        if license_text != (source / "LICENSE").read_text(encoding="utf-8"):
            raise ValueError("Apollo license is missing or changed")
        notices = package.read(web + "NOTICE.txt").decode("utf-8").replace("\r\n", "\n")
        if not notices.startswith((source / "NOTICE").read_text(encoding="utf-8").strip()):
            raise ValueError("Required source notices are missing")
        dependencies = json.loads((source / "dashboard/package.json").read_text(encoding="utf-8"))["dependencies"]
        if any(f"{name}@{version}" not in notices for name, version in dependencies.items()):
            raise ValueError("Dependency notices are incomplete")
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
    return {
        "archive": archive.name,
        "version": version,
        "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
        "entries": len(names),
        "hostPages": len(pages),
        "imageAssets": len(images),
        "status": "package-audit-passed",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    print(json.dumps(audit(args.archive, args.source), indent=2))
