#!/usr/bin/env python3
"""Extract nameplate (component type 27) config tree from GIL snapshots and diff two adjacent snapshots.

Usage:
  inspect-gil-nameplate.py <before.gil> <after.gil> --identity <id> [--output <json>]

Reads the instance record (root 8 field-1) and definition record (root 4 field-1) with
the given identity, finds component type 27, and prints the config tree summary
(38.501 configs -> 512 content groups -> 502 main entry) plus a before/after diff.

This is a read-only decoder. Field numbers are evidence-bounded, not a formal schema.
Fails (exit 1) when the identity record or the type-27 component is missing.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from gil_wire_lib import f32, root_field1_records, sha256, utf8_or_none, walk


COMPONENT_FIELD = 38


def component_cfg(record: bytes, comp_field: int, comp_type: int):
    """Return the 38 blob of the component entry with type `comp_type` in a record."""
    for f, w, v in walk(record):
        if f != comp_field or w != 'bytes':
            continue
        comp = walk(v)
        tid = next((x[2] for x in comp if x[0] == 1 and x[1] == 'varint'), None)
        if tid != comp_type:
            continue
        for x in comp:
            if x[0] == 38 and x[1] == 'bytes':
                return x[2]
    return None


def text_of(group_main: bytes):
    """文本：502 主条目内的 504.501 UTF-8"""
    for z in walk(group_main):
        if z[0] == 504 and z[1] == 'bytes':
            for t in walk(z[2]):
                if t[0] == 501 and t[1] == 'bytes':
                    return utf8_or_none(t[2])
    return None


def summarize(cfg: bytes):
    """38 config list -> list of config dicts."""
    configs = []
    for f, w, v in walk(cfg):
        if f != 501 or w != 'bytes':
            continue
        cfg_kids = walk(v)
        cfg_d = {}
        groups = []
        for c in cfg_kids:
            if c[0] == 501 and c[1] == 'varint':
                cfg_d['seq'] = c[2]
            elif c[0] == 505 and c[1] == 'fixed32':
                cfg_d['range'] = f32(c[2])
            elif c[0] == 507 and c[1] == 'fixed32':
                cfg_d['f507'] = f32(c[2])
            elif c[0] == 508 and c[1] == 'fixed32':
                cfg_d['f508'] = f32(c[2])
            elif c[0] == 602 and c[1] == 'bytes':
                cfg_d['name'] = utf8_or_none(c[2])
            elif c[0] == 605 and c[1] == 'varint':
                cfg_d['f605'] = c[2]
            elif c[0] == 512 and c[1] == 'bytes':
                g = {}
                for d in walk(c[2]):
                    if d[0] == 602 and d[1] == 'varint':
                        g['seq'] = d[2]
                    elif d[0] == 502 and d[1] == 'bytes':
                        main = {}
                        for z in walk(d[2]):
                            if z[0] == 502 and z[1] == 'varint':
                                main['font'] = z[2]
                            elif z[0] == 503 and z[1] == 'bytes':
                                size = {s[0]: f32(s[2]) for s in walk(z[2]) if s[1] == 'fixed32'}
                                main['size'] = size
                            elif z[0] == 505 and z[1] == 'bytes':
                                off = {s[0]: f32(s[2]) for s in walk(z[2]) if s[1] == 'fixed32'}
                                main['offset'] = off
                        main['text'] = text_of(d[2])
                        g['main'] = main
                    elif d[0] == 503 and d[1] == 'bytes':
                        g['aux503'] = len(d[2])
                    elif d[0] == 504 and d[1] == 'bytes':
                        g['aux504'] = len(d[2])
                    elif d[0] == 505 and d[1] == 'bytes':
                        g['aux505'] = len(d[2])
                    elif d[0] == 506 and d[1] == 'bytes':
                        g['aux506'] = len(d[2])
                    elif d[0] == 507 and d[1] == 'bytes':
                        g['aux507'] = len(d[2])
                groups.append(g)
        cfg_d['groups'] = groups
        configs.append(cfg_d)
    return configs


def load(path: Path, identity: int, comp_type: int):
    raw = path.read_bytes()
    payload = raw[20:-4]
    result = {'file': str(path), 'sha256': sha256(path), 'size': len(raw)}
    for root_field, comp_field in ((8, 7), (4, 8)):
        for r in root_field1_records(payload, root_field):
            if isinstance(r, tuple):
                continue
            fields = walk(r)
            ident = next((v for f, w, v in fields if f == 1 and w == 'varint'), None)
            if ident != identity:
                continue
            cfg = component_cfg(r, comp_field, comp_type)
            if cfg is None:
                raise ValueError(f'{path}: identity {identity} has no component type {comp_type}')
            result['instance' if root_field == 8 else 'definition'] = summarize(cfg)
    if 'instance' not in result or 'definition' not in result:
        raise ValueError(f'{path}: identity {identity} record not found')
    return result


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('before', type=Path)
    ap.add_argument('after', type=Path)
    ap.add_argument('--identity', type=int, required=True)
    ap.add_argument('--component-type', type=int, default=27)
    ap.add_argument('--output', type=Path)
    args = ap.parse_args()

    try:
        b = load(args.before, args.identity, args.component_type)
        a = load(args.after, args.identity, args.component_type)
    except ValueError as e:
        print(f'FAIL {e}', file=sys.stderr)
        return 1

    out = {'before': b, 'after': a,
           'instanceIdentical': b['instance'] == a['instance'],
           'definitionIdentical': b['definition'] == a['definition'],
           'twinIdentical': a['instance'] == a['definition']}
    text = json.dumps(out, ensure_ascii=False, indent=1)
    if args.output:
        args.output.write_text(text)
    print(text)
    return 0


if __name__ == '__main__':
    sys.exit(main())
