#!/usr/bin/env python3
"""Canonical Genshin-TS entry for the project-pinned Portable Knowledge Core.

The non-editable candidate distribution is provisioned under the ignored
`.local/pkc-runtime` directory. Agents invoke only `python tools/pkc.py ...`;
they do not select a package version, set PYTHONPATH, or locate a source tree.
"""
from __future__ import annotations

import importlib.metadata
import os
import subprocess
import sys
from pathlib import Path

EXPECTED_VERSION = "0.2.0rc1"
_FORWARD_MARKER = "_GENSHIN_TS_PKC_FORWARDED"


def _runtime_python(root: Path) -> Path:
    windows = root / ".local" / "pkc-runtime" / "Scripts" / "python.exe"
    posix = root / ".local" / "pkc-runtime" / "bin" / "python"
    return windows if os.name == "nt" else posix


def _inside_pinned_runtime(root: Path) -> bool:
    # A venv's Python launcher is commonly a symlink to the system interpreter.
    # Resolving sys.executable would therefore erase the venv identity and cause
    # this entry point to forward to itself indefinitely. sys.prefix identifies
    # the active venv even when its launcher is a symlink.
    return Path(sys.prefix).resolve() == (root / ".local" / "pkc-runtime").resolve()


def _forward(runtime_python: Path, argv: list[str]) -> int:
    if not runtime_python.is_file():
        print(
            "PKC_RUNTIME_MISSING: the project-pinned portable-knowledge runtime is not "
            "provisioned at .local/pkc-runtime. Ask the project maintainer to restore "
            "the declared candidate runtime; direct SQLite and source-tree fallbacks "
            "are unsupported.",
            file=sys.stderr,
        )
        return 2
    environment = dict(os.environ)
    environment[_FORWARD_MARKER] = "1"
    result = subprocess.run(
        [str(runtime_python), str(Path(__file__).resolve()), *argv],
        check=False,
        env=environment,
    )
    return result.returncode


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    root = Path(__file__).resolve().parents[1]
    was_forwarded = os.environ.pop(_FORWARD_MARKER, None) == "1"
    if not _inside_pinned_runtime(root):
        if was_forwarded:
            print(
                "PKC_RUNTIME_INVALID: the pinned Python did not activate its runtime; "
                "refusing recursive forwarding",
                file=sys.stderr,
            )
            return 2
        return _forward(_runtime_python(root), args)
    try:
        installed = importlib.metadata.version("portable-knowledge")
        if installed != EXPECTED_VERSION:
            print(
                f"PKC_RUNTIME_VERSION_MISMATCH: expected {EXPECTED_VERSION}, found {installed}",
                file=sys.stderr,
            )
            return 2
        if args == ["--runtime-version"]:
            print(installed)
            return 0
        from portable_knowledge.cli import main as pkc_main
    except (ImportError, importlib.metadata.PackageNotFoundError) as exc:
        print(f"PKC_RUNTIME_INVALID: {exc}", file=sys.stderr)
        return 2
    return pkc_main(["--root", str(root), *args])


if __name__ == "__main__":
    raise SystemExit(main())
