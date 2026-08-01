#!/usr/bin/env python3
"""Copy one immutable evidence file into persistent storage and record SHA-256."""

from __future__ import annotations

import hashlib
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
    if len(sys.argv) != 3:
        print(f'usage: {Path(sys.argv[0]).name} <source-file> <destination-directory>', file=sys.stderr)
        return 2

    source = Path(sys.argv[1]).expanduser().resolve()
    destination_dir = Path(sys.argv[2]).expanduser().resolve()
    if not source.is_file():
        print(f'error: source is not a file: {source}', file=sys.stderr)
        return 1

    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = destination_dir / source.name
    checksum_file = destination.with_name(f'{destination.name}.sha256')
    if destination.exists() or checksum_file.exists():
        print(f'error: refusing to overwrite: {destination}', file=sys.stderr)
        return 1

    source_hash = sha256(source)
    shutil.copy2(source, destination)
    destination_hash = sha256(destination)
    if source_hash != destination_hash:
        destination.unlink(missing_ok=True)
        print('error: SHA-256 mismatch after copy', file=sys.stderr)
        return 1

    checksum_file.write_text(f'{destination_hash}  {destination.name}\n')
    print(f'PASS {destination} sha256={destination_hash}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
