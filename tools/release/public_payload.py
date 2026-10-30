"""Path policy for public Apollo program files, independent of their container."""

from pathlib import PurePosixPath


PRIVATE_NAMES = frozenset({"sunshine.conf", "sunshine_state.json", "credentials.json", "sunshine.log"})
WINDOWS_DEVICES = frozenset(
    {"con", "prn", "aux", "nul", "conin$", "conout$"}
    | {prefix + digit for prefix in ("com", "lpt") for digit in "123456789¹²³"}
)


def validate_public_path(name: str) -> str:
    """Require a portable Windows payload path and return its collision key.

    Callers supply paths relative to the program root, without directory markers.
    Container-specific link checks, inventory and byte verification stay with them.
    """
    parts = name.split("/")
    if any(part in {"", ".", ".."} for part in parts) or any(token in name for token in ("\\", ":", "\0")):
        raise ValueError(f"Unsafe public payload path: {name}")
    if any(part.endswith((".", " ")) or any(ord(char) < 32 or char in '<>"|?*' for char in part)
           or part.split(".", 1)[0].rstrip(" ").casefold() in WINDOWS_DEVICES for part in parts):
        raise ValueError(f"Unsafe Windows payload path: {name}")
    lowered = [part.casefold() for part in parts]
    if "config" in lowered or lowered[-1] in PRIVATE_NAMES or PurePosixPath(lowered[-1]).suffix in {".key", ".pem"}:
        raise ValueError(f"Private host state in payload: {name}")
    return "/".join(lowered)
