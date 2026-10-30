#!/usr/bin/env python3
"""Extract, never execute, the NSIS installer and compare its payload to the audited ZIP."""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import struct
import subprocess
import sys
import tempfile
import zipfile

from public_payload import validate_public_path


NSIS_CONTROL_NAMES = frozenset({
    "InstallOptions.dll", "StartMenu.dll", "System.dll", "UserInfo.dll", "nsExec.dll",
    "NSIS.InstallOptions.ini", "ioSpecial.ini", "modern-header.bmp", "modern-wizard.bmp",
})
EMBEDDED_PROGRAM_COPIES = {
    "update-installation.ps1": "scripts/update-installation.ps1",
    "installation-data.ps1": "scripts/installation-data.ps1",
    "installation-manifest.json": "installation-manifest.json",
}


def nsis_control_paths(root: Path, extracted: Path, expected_files: set) -> set:
    """Classify 7-Zip's NSIS control namespace, not arbitrary program extras."""
    recognized, copies = set(), set()
    for base in {root, extracted.resolve()}:
        plugins = base / "$PLUGINSDIR"
        if plugins.is_dir():
            for path in plugins.rglob("*"):
                name = path.relative_to(plugins).as_posix()
                if (not path.is_file()
                        or (name not in NSIS_CONTROL_NAMES and name not in EMBEDDED_PROGRAM_COPIES)):
                    raise ValueError(f"Unexpected NSIS control entry: {name}")
                data = path.read_bytes()
                if not data:
                    raise ValueError(f"Empty NSIS control entry: {name}")
                if name in EMBEDDED_PROGRAM_COPIES:
                    public = EMBEDDED_PROGRAM_COPIES[name]
                    if public not in expected_files or data != (root / public).read_bytes():
                        raise ValueError(f"Embedded installer copy differs from program payload: {name}")
                    copies.add(public)
                if path.is_relative_to(root):
                    recognized.add(path.relative_to(root).as_posix())
        uninstaller = base / "Uninstall.exe"
        if uninstaller.exists():
            data = uninstaller.read_bytes()
            offset = struct.unpack_from("<I", data, 60)[0] if len(data) >= 64 else len(data)
            if (len(data) < 64 or data[:2] != b"MZ" or offset < 64 or offset > len(data) - 6
                    or data[offset:offset + 4] != b"PE\0\0"):
                raise ValueError("Invalid NSIS uninstaller control file")
            if uninstaller.is_relative_to(root):
                recognized.add("Uninstall.exe")
    missing = (set(EMBEDDED_PROGRAM_COPIES.values()) & expected_files) - copies
    if missing:
        raise ValueError("Missing embedded installer copies: " + ", ".join(sorted(missing)))
    return recognized


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
    controls = nsis_control_paths(root, extracted, expected_files)
    if controls & expected_files:
        raise ValueError("NSIS controls must not be part of the public ZIP payload")
    extras = set(actual_files) - expected_files - controls
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
