#!/usr/bin/env python3
"""Capture an immutable before/after experiment pair."""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    if len(sys.argv) != 4:
        print(f'usage: {Path(sys.argv[0]).name} <current-map> <before-snapshot> <experiment-dir>', file=sys.stderr)
        return 2

    current, before, experiment = (Path(arg).expanduser().resolve() for arg in sys.argv[1:])
    if not current.is_file() or not before.is_file():
        print('error: current map and before snapshot must be files', file=sys.stderr)
        return 1

    before_hash = sha256(before)
    after_hash = sha256(current)
    if before_hash == after_hash:
        print('error: current map hash did not change', file=sys.stderr)
        return 1

    raw = experiment / 'raw'
    outputs = [raw / 'before.gil', raw / 'after.gil']
    if any(path.exists() or path.with_name(f'{path.name}.sha256').exists() for path in outputs):
        print(f'error: refusing to overwrite experiment: {experiment}', file=sys.stderr)
        return 1

    raw.mkdir(parents=True, exist_ok=True)
    for source, destination, checksum in zip(
        (before, current), outputs, (before_hash, after_hash), strict=True
    ):
        shutil.copy2(source, destination)
        if sha256(destination) != checksum:
            destination.unlink(missing_ok=True)
            print(f'error: SHA-256 mismatch after copy: {destination}', file=sys.stderr)
            return 1
        destination.with_name(f'{destination.name}.sha256').write_text(
            f'{checksum}  {destination.name}\n'
        )

    print(json.dumps({
        'before': {'path': str(outputs[0]), 'sha256': before_hash, 'size': outputs[0].stat().st_size},
        'after': {'path': str(outputs[1]), 'sha256': after_hash, 'size': outputs[1].stat().st_size},
    }))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
