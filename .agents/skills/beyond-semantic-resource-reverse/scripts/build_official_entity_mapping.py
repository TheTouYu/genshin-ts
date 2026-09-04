#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_official_entity_mapping.py — 把 type1017 通用目录解析结果合并到官方实体表，
产出“官方实体ID -> 中文名/kindCode/自定义资产ID”机器可读资源。

用法:
  python3 build_official_entity_mapping.py \
    --catalog <type1017_generic.json> \
    --entity-data <BeyondOfficialEntityExcelConfigData.json> \
    --output resources/official_entity_ipc_mapping.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--catalog', type=Path, required=True)
    ap.add_argument('--entity-data', type=Path, required=True)
    ap.add_argument('--textmap', type=Path, default=None)
    ap.add_argument('--output', type=Path, required=True)
    args = ap.parse_args()

    catalog = json.loads(args.catalog.read_text(encoding='utf-8'))
    entities = json.loads(args.entity_data.read_text(encoding='utf-8'))

    entity_by_id: dict[int, dict] = {}
    for row in entities:
        if 'id' in row:
            entity_by_id[int(row['id'])] = row

    textmap: dict[str, str] = {}
    if args.textmap:
        textmap = json.loads(args.textmap.read_text(encoding='utf-8'))
        textmap = {str(k): v for k, v in textmap.items() if isinstance(v, str)}

    def resolve_name(row: dict, fallback: str | None) -> str | None:
        if fallback:
            return fallback
        h = row.get('nameTextMapHash')
        if h is not None and str(h) in textmap:
            return textmap[str(h)]
        return row.get('jsonName')

    # catalog defs: each asset has sourceEntityIds (may be [])
    # aggregate source -> assets
    source_assets: dict[int, list[dict]] = {}
    for defn in catalog.get('definitions', []):
        for src in defn.get('sourceEntityIds', []):
            source_assets.setdefault(int(src), []).append({
                'assetId': defn['assetId'],
                'names': defn.get('names', []),
                'kindCodes': defn.get('kindCodes', []),
            })

    mappings = []
    for src, assets in sorted(source_assets.items()):
        row = entity_by_id.get(src, {})
        catalog_names = [n for a in assets for n in a.get('names', []) if n]
        name = resolve_name(row, catalog_names[0] if catalog_names else None)
        kind_codes: list[int] = []
        custom_ids: list[int] = []
        for a in assets:
            custom_ids.append(a['assetId'])
            for k in a['kindCodes']:
                if k not in kind_codes:
                    kind_codes.append(k)
        mappings.append({
            'officialEntityId': src,
            'jsonName': row.get('jsonName'),
            'entityType': row.get('entityType'),
            'name': name,
            'nameTextMapHash': row.get('nameTextMapHash'),
            'kindCodes': kind_codes,
            'customAssetIds': sorted(set(custom_ids)),
            'source': 'type1017 generic catalog + BeyondOfficialEntityExcelConfigData',
        })

    out = {
        'schemaVersion': 1,
        'title': 'Beyond official entity -> IPC/type1017 summary mapping',
        'status': 'auto-derived from multi-type capture; kindCode/asset kind not yet semantically decoded',
        'sourceCatalog': str(args.catalog),
        'count': len(mappings),
        'mappings': mappings,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'wrote {args.output} ({len(mappings)} mappings)')


if __name__ == '__main__':
    main()
