#!/usr/bin/env python3
"""Validate an immutable PKC Bundle against an isolated repository snapshot.

The validator never applies the Bundle to the working tree. It copies the current
contents of Git-tracked files, overlays the Bundle actions after hash checks, and
runs the project canonical PKC validation and retrieval evaluation in that staged
snapshot. The project-pinned runtime is reused through a read-only symlink; no
runtime selection, installation, SQLite access, or Git mutation is performed.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def decode_action_value(action: dict[str, object], key: str) -> bytes | None:
    value = action.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f'action {key} must be a base64 string or null')
    return base64.b64decode(value, validate=True)


def tracked_paths(root: Path) -> list[Path]:
    result = subprocess.run(
        ['git', 'ls-files', '-z'],
        cwd=root,
        check=True,
        stdout=subprocess.PIPE,
    )
    return [Path(os.fsdecode(item)) for item in result.stdout.split(b'\0') if item]


def copy_tracked_snapshot(root: Path, destination: Path) -> None:
    for relative in tracked_paths(root):
        source = root / relative
        target = destination / relative
        if not source.exists() and not source.is_symlink():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        if source.is_symlink():
            target.symlink_to(os.readlink(source))
        else:
            shutil.copy2(source, target)

    link_locked_runtime(root, destination)


def link_locked_runtime(root: Path, destination: Path) -> None:
    lock_relative = Path('tools/pkc-lock.json')
    lock_path = root / lock_relative
    if not lock_path.is_file():
        raise RuntimeError('PKC_RUNTIME_MISSING: tools/pkc-lock.json is unavailable')
    lock = json.loads(lock_path.read_text(encoding='utf-8'))
    runtime_raw = lock.get('runtime')
    if not isinstance(runtime_raw, str) or not runtime_raw:
        raise RuntimeError('PKC_RUNTIME_INVALID: lock runtime must be a relative path')
    runtime_relative = Path(runtime_raw)
    if runtime_relative.is_absolute() or '..' in runtime_relative.parts:
        raise RuntimeError('PKC_RUNTIME_INVALID: lock runtime escapes the project')
    runtime = root / runtime_relative
    if not runtime.is_dir():
        raise RuntimeError(f'PKC_RUNTIME_MISSING: {runtime_raw} is unavailable')
    staged_lock = destination / lock_relative
    staged_lock.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(lock_path, staged_lock)
    staged_runtime = destination / runtime_relative
    staged_runtime.parent.mkdir(parents=True, exist_ok=True)
    staged_runtime.symlink_to(runtime.resolve(), target_is_directory=True)


def copy_applied_bundle_outputs(source_root: Path, staged_root: Path) -> None:
    """Restore missing files from the immutable applied-Bundle audit chain only."""
    bundle_dir = source_root / 'data/knowledge/bundles'
    for applied_path in sorted(bundle_dir.glob('*.applied.json')):
        applied = json.loads(applied_path.read_text(encoding='utf-8'))
        bundle_id = applied.get('bundle_id')
        content_hash = applied.get('content_hash')
        if not isinstance(bundle_id, str) or not isinstance(content_hash, str):
            raise ValueError(f'invalid applied Bundle record: {applied_path.name}')
        bundle_path = bundle_dir / f'{bundle_id}.json'
        if not bundle_path.is_file():
            raise ValueError(f'applied Bundle is missing: {bundle_id}')
        bundle = json.loads(bundle_path.read_text(encoding='utf-8'))
        if bundle.get('content_hash') != content_hash:
            raise ValueError(f'applied Bundle content hash mismatch: {bundle_id}')
        actions = bundle.get('actions')
        if not isinstance(actions, list):
            raise ValueError(f'applied Bundle actions are invalid: {bundle_id}')
        for raw_action in actions:
            if not isinstance(raw_action, dict):
                raise ValueError(f'applied Bundle action is invalid: {bundle_id}')
            relative_raw = raw_action.get('path')
            operation = raw_action.get('operation')
            if not isinstance(relative_raw, str) or not relative_raw:
                raise ValueError(f'applied Bundle action path is invalid: {bundle_id}')
            relative = Path(relative_raw)
            if relative.is_absolute() or '..' in relative.parts:
                raise ValueError(f'unsafe applied Bundle path: {relative_raw}')
            target = staged_root / relative
            if target.exists() or operation == 'delete':
                continue
            content = decode_action_value(raw_action, 'content')
            if content is None:
                continue
            source = source_root / relative
            if not source.is_file() or source.read_bytes() != content:
                raise ValueError(
                    f'applied Bundle output differs from current file: {relative_raw}'
                )
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)


def copy_action_baselines(
    source_root: Path,
    staged_root: Path,
    bundle: dict[str, object],
) -> None:
    """Copy only explicit non-empty action baselines absent from the tracked snapshot."""
    actions = bundle.get('actions')
    if not isinstance(actions, list):
        raise ValueError('bundle actions must be a list')
    for raw_action in actions:
        if not isinstance(raw_action, dict):
            raise ValueError('bundle action must be an object')
        relative_raw = raw_action.get('path')
        if not isinstance(relative_raw, str) or not relative_raw:
            raise ValueError('bundle action path must be a non-empty string')
        relative = Path(relative_raw)
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError(f'unsafe bundle action path: {relative_raw}')
        target = staged_root / relative
        if target.exists():
            continue
        before = decode_action_value(raw_action, 'before')
        if not before:
            continue
        source = source_root / relative
        if not source.is_file():
            raise ValueError(f'action baseline is missing: {relative_raw}')
        current = source.read_bytes()
        if current != before:
            raise ValueError(f'action baseline differs from before content: {relative_raw}')
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)


def apply_actions(root: Path, bundle: dict[str, object]) -> list[str]:
    changed: list[str] = []
    actions = bundle.get('actions')
    if not isinstance(actions, list):
        raise ValueError('bundle actions must be a list')
    for raw_action in actions:
        if not isinstance(raw_action, dict):
            raise ValueError('bundle action must be an object')
        relative_raw = raw_action.get('path')
        operation = raw_action.get('operation')
        if not isinstance(relative_raw, str) or not relative_raw:
            raise ValueError('bundle action path must be a non-empty string')
        relative = Path(relative_raw)
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError(f'unsafe bundle action path: {relative_raw}')
        target = root / relative
        current = target.read_bytes() if target.is_file() else None
        expected_hash = raw_action.get('expected_hash')
        if expected_hash is not None and expected_hash != sha256(current or b''):
            raise ValueError(
                f'expected hash mismatch for {relative_raw}: '
                f'expected {expected_hash}, found {sha256(current or b"")}'
            )
        before = decode_action_value(raw_action, 'before')
        if before is not None and (current or b'') != before:
            raise ValueError(f'before content mismatch for {relative_raw}')
        if operation in {'create', 'replace'}:
            content = decode_action_value(raw_action, 'content')
            if content is None:
                raise ValueError(f'{operation} action lacks content: {relative_raw}')
            new_hash = raw_action.get('new_hash')
            if new_hash is not None and new_hash != sha256(content):
                raise ValueError(f'new hash mismatch for {relative_raw}')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        elif operation == 'delete':
            if target.exists():
                target.unlink()
        else:
            raise ValueError(f'unsupported action operation: {operation}')
        changed.append(relative_raw)
    return changed


def run_check(root: Path, command: list[str]) -> dict[str, object]:
    result = subprocess.run(
        command,
        cwd=root,
        text=True,
        encoding='utf-8',
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    return {
        'command': command,
        'returncode': result.returncode,
        'stdout': result.stdout,
        'stderr': result.stderr,
    }


def check_authority_paths(root: Path) -> dict[str, object]:
    registry = json.loads((root / 'data/knowledge/authority-refs.json').read_text())
    missing = sorted(
        ref['path'] for ref in registry['refs'] if not (root / ref['path']).is_file()
    )
    return {
        'command': ['authority-path-check'],
        'returncode': 1 if missing else 0,
        'stdout': json.dumps({'missing': missing}, ensure_ascii=False),
        'stderr': '',
    }


def validate_bundle(bundle_path: Path) -> dict[str, object]:
    bundle = json.loads(bundle_path.read_text(encoding='utf-8'))
    with tempfile.TemporaryDirectory(prefix='gsts-pkc-staged-') as directory:
        staged_root = Path(directory)
        copy_tracked_snapshot(ROOT, staged_root)
        # An explicit, non-empty proposed-action baseline may supersede an older applied
        # Bundle output for the same still-untracked path. Restore it first; the applied
        # audit chain then fills only the remaining missing paths and stays fail-closed.
        copy_action_baselines(ROOT, staged_root, bundle)
        copy_applied_bundle_outputs(ROOT, staged_root)
        changed = apply_actions(staged_root, bundle)
        checks = [
            run_check(
                staged_root,
                [sys.executable, 'tools/pkc.py', 'rebuild', '--format', 'text'],
            ),
            run_check(
                staged_root,
                [sys.executable, 'tools/pkc.py', 'validate', '--format', 'text'],
            ),
            run_check(
                staged_root,
                [sys.executable, 'tools/pkc.py', 'tree', '--format', 'text'],
            ),
            run_check(
                staged_root,
                [sys.executable, 'tools/evaluate_pkc_retrieval.py'],
            ),
            check_authority_paths(staged_root),
        ]
    return {
        'ok': all(check['returncode'] == 0 for check in checks),
        'bundle_id': bundle.get('bundle_id'),
        'content_hash': bundle.get('content_hash'),
        'changed_files': changed,
        'checks': checks,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('bundle', type=Path)
    parser.add_argument('--format', choices=('json', 'text'), default='json')
    args = parser.parse_args()
    try:
        payload = validate_bundle(args.bundle.resolve())
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        payload = {'ok': False, 'error': str(error)}
    if args.format == 'json':
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print('OK: staged-bundle-validation' if payload['ok'] else 'ERROR: staged-bundle-validation')
        for check in payload.get('checks', []):
            print(f"[{check['returncode']}] {' '.join(check['command'])}")
            if check['stdout']:
                print(check['stdout'].rstrip())
            if check['stderr']:
                print(check['stderr'].rstrip(), file=sys.stderr)
    return 0 if payload['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
