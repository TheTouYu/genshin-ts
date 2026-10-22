#!/usr/bin/env bash
# ys-view 自测：正常出包 / 帧缺失 / 回执非法。全程离线，不碰屏幕。
# 用法：bash tools/ys-editor/tests/ys-view.selftest.sh
set -u
cd "$(dirname "$0")/../../.." || exit 8
VIEW="tools/ys-editor/ys-view"
LOOK=${1:-/tmp/f06_full.json}
FRAME=${2:-.scratch/gui-corpus/f06.png}
FAIL=0
TMP=$(mktemp -d /tmp/ysview.XXXXXX)

chk() { if [ "$3" = "$2" ]; then echo "PASS $1 (rc=$3)"; else echo "FAIL $1 期望 rc=$2 实得 rc=$3"; FAIL=$((FAIL+1)); fi; }

# 1. 正常出包
"$VIEW" --look "$LOOK" --frame "$FRAME" --out "$TMP/ok" >/dev/null 2>&1; chk "正常出包" 0 $?
for f in whole.png annotated.png index.json; do
  if [ -s "$TMP/ok/$f" ]; then echo "PASS 产物存在 $f"; else echo "FAIL 缺产物 $f"; FAIL=$((FAIL+1)); fi
done
n=$(ls "$TMP/ok/tiles" 2>/dev/null | wc -l)
if [ "$n" -ge 4 ]; then echo "PASS 切片数=$n"; else echo "FAIL 切片数=$n (<4)"; FAIL=$((FAIL+1)); fi
python3 - "$TMP/ok/index.json" <<'PY' || FAIL=$((FAIL+1))
import json,sys
d=json.load(open(sys.argv[1]))
assert d["ok"] and d["tiles"] and d["size"][0] > 0, d
print("PASS index 字段齐全 size=%s tiles=%s" % (d["size"], len(d["tiles"])))
PY

# 2. 帧缺失 → rc=8
"$VIEW" --look "$LOOK" --frame /nonexistent/x.png --out "$TMP/nf" >/dev/null 2>&1; chk "帧缺失 rc=8" 8 $?

# 3. 回执非法 → rc=8
echo 'not json' > "$TMP/bad.json"
"$VIEW" --look "$TMP/bad.json" --frame "$FRAME" --out "$TMP/bad" >/dev/null 2>&1; chk "回执非法 rc=8" 8 $?

echo "----"
[ "$FAIL" -eq 0 ] && { echo "RESULT: PASS"; rm -rf "$TMP"; exit 0; } || { echo "RESULT: FAIL ($FAIL)"; echo "临时目录保留：$TMP"; exit 1; }
