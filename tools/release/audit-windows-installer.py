#!/usr/bin/env python3
"""Extract, never execute, the NSIS installer and compare its payload to the audited ZIP."""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tempfile
import zipfile


def compare_payload(extracted: Path, archive: Path) -> int:
    hosts = list(extracted.rglob("sunshine.exe"))
    if len(hosts) != 1:
        raise ValueError("Expected exactly one extracted host executable")
    root = hosts[0].parent.resolve()
    if not root.is_relative_to(extracted.resolve()):
        raise ValueError("Installer payload escaped extraction directory")
    count = 0
    with zipfile.ZipFile(archive) as package:
        for entry in package.infolist():
            if entry.is_dir():
                continue
            path = PurePosixPath(entry.filename)
            if path.parts[0] != "Apollo" or ".." in path.parts or "\\" in entry.filename or ":" in entry.filename:
                raise ValueError("Unexpected ZIP payload path")
            target = root.joinpath(*path.parts[1:]).resolve()
            if not target.is_relative_to(root) or not target.is_file():
                raise ValueError(f"Missing or unsafe installer payload: {entry.filename}")
            if hashlib.sha256(target.read_bytes()).digest() != hashlib.sha256(package.read(entry)).digest():
                raise ValueError(f"Installer/ZIP payload mismatch: {entry.filename}")
            count += 1
    if count == 0:
        raise ValueError("Empty installer payload")
    return count


def audit(installer: Path, archive: Path) -> dict:
    if sys.platform != "win32" or os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("GITHUB_REPOSITORY") != "matheuspergoli/Apollo":
        raise RuntimeError("Installer extraction is restricted to the isolated Windows runner of this fork")
    seven_zip = shutil.which("7z") or str(Path(os.environ["ProgramFiles"]) / "7-Zip/7z.exe")
    with tempfile.TemporaryDirectory(prefix="apollo-installer-", dir=os.environ["RUNNER_TEMP"]) as temporary:
        subprocess.run([seven_zip, "x", str(installer.resolve()), f"-o{temporary}", "-y"], check=True, capture_output=True)
        count = compare_payload(Path(temporary), archive)
    return {"installer": installer.name, "sha256": hashlib.sha256(installer.read_bytes()).hexdigest(), "payloadFiles": count, "status": "installer-payload-audit-passed", "installationExecuted": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("installer", type=Path)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    print(json.dumps(audit(args.installer, args.archive), indent=2))
