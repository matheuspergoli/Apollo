"""Path policy for public Apollo program files, independent of their container."""

from pathlib import PurePosixPath


PRIVATE_NAMES = frozenset({"sunshine.conf", "sunshine_state.json", "credentials.json", "sunshine.log"})


def validate_public_path(name: str) -> None:
    """Require a canonical relative POSIX path containing no known host state.

    Callers supply paths relative to the program root, without directory markers.
    Container-specific link checks, inventory and byte verification stay with them.
    """
    parts = name.split("/")
    if any(part in {"", ".", ".."} for part in parts) or any(token in name for token in ("\\", ":", "\0")):
        raise ValueError(f"Unsafe public payload path: {name}")
    lowered = [part.casefold() for part in parts]
    if "config" in lowered or lowered[-1] in PRIVATE_NAMES or PurePosixPath(lowered[-1]).suffix in {".key", ".pem"}:
        raise ValueError(f"Private host state in payload: {name}")
