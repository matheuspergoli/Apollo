#!/usr/bin/env python3
"""Extract, never execute, the NSIS installer and compare its payload to the audited ZIP."""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile

from public_payload import validate_public_path


def compare_payload(extracted: Path, archive: Path) -> int:
    if extracted.is_symlink() or any(path.is_symlink() for path in extracted.rglob("*")):
        raise ValueError("Installer extraction must not contain links")
    hosts = list(extracted.rglob("sunshine.exe"))
    if len(hosts) != 1:
        raise ValueError("Expected exactly one extracted host executable")
    root = hosts[0].parent.resolve()
    if not root.is_relative_to(extracted.resolve()):
        raise ValueError("Installer payload escaped extraction directory")
    count = 0
    actual_files = {}
    actual_paths = set()
    for path in root.rglob("*"):
        relative = path.relative_to(root).as_posix()
        key = validate_public_path(relative)
        if key in actual_paths:
            raise ValueError(f"Windows installer path collision: {relative}")
        actual_paths.add(key)
        if path.is_file():
            actual_files[relative] = path
        elif not path.is_dir():
            raise ValueError(f"Non-regular installer payload: {relative}")
    expected_files = set()
    zip_paths = set()
    with zipfile.ZipFile(archive) as package:
        for entry in package.infolist():
            if stat.S_ISLNK(entry.external_attr >> 16):
                raise ValueError("ZIP payload must not contain links")
            if entry.filename == "Apollo/" and entry.is_dir():
                continue
            if not entry.filename.startswith("Apollo/"):
                raise ValueError("Unexpected ZIP payload path")
            relative = entry.filename.removeprefix("Apollo/")
            key = validate_public_path(relative.removesuffix("/") if entry.is_dir() else relative)
            if key in zip_paths:
                raise ValueError(f"Windows ZIP path collision: {entry.filename}")
            zip_paths.add(key)
            if entry.is_dir():
                continue
            expected_files.add(relative)
            target = root.joinpath(*PurePosixPath(relative).parts).resolve()
            if not target.is_relative_to(root) or not target.is_file():
                raise ValueError(f"Missing or unsafe installer payload: {entry.filename}")
            actual, expected = target.read_bytes(), package.read(entry)
            if hashlib.sha256(actual).digest() != hashlib.sha256(expected).digest():
                offset = next(
                    (i for i, pair in enumerate(zip(actual, expected)) if pair[0] != pair[1]),
                    min(len(actual), len(expected)),
                )
                raise ValueError(
                    f"Installer/ZIP payload mismatch: {entry.filename}; "
                    f"first differing byte {offset}; lengths {len(actual)}/{len(expected)}"
                )
            count += 1
    extras = set(actual_files) - expected_files
    if extras:
        raise ValueError("Unexpected installer program files: " + ", ".join(sorted(extras)))
    if count == 0:
        raise ValueError("Empty installer payload")
    return count


def audit(installer: Path, archive: Path) -> dict:
    if (
        sys.platform != "win32"
        or os.environ.get("GITHUB_ACTIONS") != "true"
        or os.environ.get("GITHUB_REPOSITORY") != "matheuspergoli/Apollo"
    ):
        raise RuntimeError("Installer extraction is restricted to the isolated Windows runner of this fork")
    seven_zip = shutil.which("7z") or str(Path(os.environ["ProgramFiles"]) / "7-Zip/7z.exe")
    with tempfile.TemporaryDirectory(prefix="apollo-installer-", dir=os.environ["RUNNER_TEMP"]) as temporary:
        subprocess.run(
            [seven_zip, "x", str(installer.resolve()), f"-o{temporary}", "-y"],
            check=True,
            capture_output=True,
        )
        count = compare_payload(Path(temporary), archive)
    return {
        "installer": installer.name,
        "sha256": hashlib.sha256(installer.read_bytes()).hexdigest(),
        "payloadFiles": count,
        "status": "installer-payload-audit-passed",
        "installationExecuted": False,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("installer", type=Path)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    print(json.dumps(audit(args.installer, args.archive), indent=2))
