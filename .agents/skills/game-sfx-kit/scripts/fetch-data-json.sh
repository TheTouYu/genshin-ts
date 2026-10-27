#!/usr/bin/env bash
# 重新抓官方音效全量数据（1997 条）：id / nameI18nKey / duration / category / order / path / giVersion
# 用法：bash scripts/fetch-data-json.sh [输出路径]   缺省 assets/data.json
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="${1:-$here/assets/data.json}"
tmp="$(mktemp)"
curl -sS --fail --max-time 60 -o "$tmp" https://oss.070077.xyz/audio/data.json
python3 - "$tmp" "$out" <<'PY'
import json, sys, collections
tmp, out = sys.argv[1], sys.argv[2]
d = json.load(open(tmp))
items = d['data'] if isinstance(d, dict) else d
assert len(items) > 1000, f'data.json 条数异常: {len(items)}'
json.dump(d, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
c = collections.Counter(x['category'] for x in items)
print(f'[fetch-data-json] {out} 条数={len(items)} 类目分布={dict(sorted(c.items()))}')
PY
rm -f "$tmp"
echo '[fetch-data-json] 下一步：node scripts/build-catalog.mjs --data '"$out"' --all --out /tmp/catalog-full.json'
