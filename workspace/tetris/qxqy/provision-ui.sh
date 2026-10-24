#!/usr/bin/env bash
# 把 tetris 的 UI 控件直接写进地图 GIL —— 不经过编辑器导入。
# 路线（2026-10-24 实测定案）：
#   文本控件 → assets:ui clone <hud> --id N --name X   （clone 通道保结构；create 通道对空容器 donor 会留悬空引用）
#   光标热区 → assets:ui create --type client-cursor-area --on container:<容器节点ID>
# 每条产出都用 tools/gil-guard.py 验（信封/字段序/501 根集/children 闭合），任一不过即停。
# 用法：GSTS_LOCALLOW_DIR=... ./qxqy/provision-ui.sh [--parent 1073741856] [--map 1073741834] [--uid 110170759]
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
REPO=$(cd "$ROOT/../.." && pwd)
: "${GSTS_LOCALLOW_DIR:?需要 GSTS_LOCALLOW_DIR（指到 .../AppData/LocalLow/miHoYo/原神）}"
PARENT=1073741856; MAP=1073741834; UID_=110170759; DONOR_TEXT=1073741858
while [ $# -gt 0 ]; do
  case "$1" in
    --parent) PARENT=$2; shift 2;;
    --map) MAP=$2; shift 2;;
    --uid) UID_=$2; shift 2;;
    *) echo "未知参数 $1"; exit 2;;
  esac
done
GIL="$GSTS_LOCALLOW_DIR/BeyondLocal/$UID_/Beyond_Local_Save_Level/$MAP/$MAP.gil"
[ -f "$GIL" ] || { echo "找不到 GIL: $GIL"; exit 2; }
WORK=$(mktemp -d /tmp/tetris-provision-XXXXXX)
cp "$GIL" "$WORK/cur.gil"
gsts() { npx tsx "$REPO/src/cli/gsts.ts" "$@" >/dev/null 2>"$WORK/err.txt" || { echo "  失败：$*"; cat "$WORK/err.txt"; exit 3; }; }
guard() { python3 "$REPO/tools/gil-guard.py" "$1" >/dev/null 2>&1 || { echo "  结构验收失败：$1"; python3 "$REPO/tools/gil-guard.py" "$1" | tail -4; exit 4; }; }
n=1073741900
mkText() { # name
  n=$((n+1))
  gsts assets:ui clone "$DONOR_TEXT" --id "$n" --name "$1" --on "container:$PARENT" --gil "$WORK/cur.gil" --output "$WORK/step.gil"
  mv "$WORK/step.gil" "$WORK/cur.gil"; guard "$WORK/cur.gil"; echo "  + $1 text id=$n"
}
mkHit() { # name
  n=$((n+1))
  gsts assets:ui create --type client-cursor-area --on "container:$PARENT" --id "$n" --name "$1" --gil "$WORK/cur.gil" --output "$WORK/step.gil"
  mv "$WORK/step.gil" "$WORK/cur.gil"; guard "$WORK/cur.gil"; echo "  + $1 hit  id=$n"
}
for t in title best hint keyA keyB keyC topBanner botBanner btnA btnB btnC btnD btnE btnF; do mkText "$t"; done
for t in btnAhit btnBhit btnChit btnDhit btnEhit btnFhit; do mkHit "$t"; done
cp "$WORK/cur.gil" "$WORK/final.gil"
echo "候选 GIL: $WORK/final.gil"
echo "基线 SHA: $(sha256sum "$GIL" | awk '{print $1}')"
echo "候选 SHA: $(sha256sum "$WORK/final.gil" | awk '{print $1}')"
echo "大小: $(stat -c%s "$GIL") → $(stat -c%s "$WORK/final.gil")"
