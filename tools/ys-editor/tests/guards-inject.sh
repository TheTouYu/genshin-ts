#!/bin/bash
# guards-inject.sh — 每道 guard 的**注入用例**：证明它真会报红，而不是空转。
#
# 存在理由（2026-10-19）：账本 36/36 都有 gate，但全量 check 报 `unproven=16`
# —— 「gate 全绿」只说明现在没坏，只有「注入一次它该抓的错、它必须报红」才算建好。
#
# 做法：在**临时树**里造违例文件，用 YS_GUARDS_ROOT 指过去跑 tools/ys-guards --only <G>。
#      仓库里的真实文件一个都不改（trap 清临时树）。
#
# 用法: guards-inject.sh <G-SLEEP|G-PKILL|G-IDX|G-BUDGET|G-SNAP|G-STALE|G-BBOX|G-CLIPBOARD|
#                        G-CAPTURE-EMPTY|G-DEVICE|G-LEDGER-DEDUP|G-FOCUS-RETURN|G-WHITELIST>
# 退出码: 0 = 该 guard 抓到了注入物（用例通过） / 1 = 门禁空转 / 2 = 用法或环境
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
GUARDS="$ROOT/tools/ys-guards"
[ -x "$GUARDS" ] || [ -f "$GUARDS" ] || { echo "缺 $GUARDS" >&2; exit 2; }

g="${1:-}"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/tools/ys-editor/tests" "$T/tools/ys-editor/calib"

# 让每道 guard 都先看到「一份正常的树」，只破坏它该抓的那一处
seed() {
  : > "$T/tools/ys-editor/ys-list"
  : > "$T/tools/ys-editor/ys-scroll"
  : > "$T/tools/ys-editor/ys_look.py"
  echo 'STALE_FRAME age 帧龄 frame_age' > "$T/tools/ys-editor/ys_capture.py"
  echo 'EMPTY_CAPTURE getsize len(data)' > "$T/tools/ys-snap"
  echo 'len(data)' >> "$T/tools/ys-editor/ys_capture.py"
}
seed

run() {  # run <expected_rc> <说明>
  out=$(YS_GUARDS_ROOT="$T" YS_GUARDS_CMDLOG="${CMDLOG:-/nonexistent}" "$GUARDS" --only "$g" 2>&1)
  rc=$?
  if [ "$rc" -ne "$1" ]; then
    echo "INJECT-FAIL $g: $2（期望 rc=$1 实得 rc=$rc）"; printf '%s\n' "$out" | head -4; exit 1
  fi
  echo "INJECT-PASS $g: $2 (rc=$rc)"
  exit 0
}

case "$g" in
  G-SLEEP)
    printf '#!/bin/bash\nsleep 3%s\n' 0 > "$T/tools/ys-editor/ys-zzz-inject"   # 拆开写：别让夹具自己触发守卫
    run 1 "注入长 sleep 被杀"
    ;;
  G-PKILL)
    printf '#!/bin/bash\npkill -f "xclip -selection"\n' > "$T/tools/ys-zzz-inject-pkill"
    run 1 "注入无字符类的 pkill -f 被杀"
    ;;
  G-IDX)
    printf '#!/bin/bash\nys-snap --window i%s:%s\n' dx 3 > "$T/tools/ys-zzz-inject-idx"   # 同上
    run 1 "把 idx 当窗口身份被杀"
    ;;
  G-BUDGET)
    : > "$T/tools/ys-editor/ys-list"          # 工具在但没有 budget 字段
    run 1 "工具缺 budget 字段被杀"
    ;;
  G-SNAP)
    printf 'w["name"]\n' > "$T/tools/ys-snap"
    run 1 "直索引 w[\"name\"] 被杀"
    ;;
  G-STALE)
    echo 'STALE_FRAME' > "$T/tools/ys-editor/ys_capture.py"   # 有码无帧龄
    run 1 "STALE_FRAME 不带帧龄被杀"
    ;;
  G-BBOX)
    : > "$T/tools/ys-editor/ys-list"          # 没写 xyxy/xywh 口径
    : > "$T/tools/ys-editor/ys_lookd.py"
    run 1 "bbox 口径未写明被杀"
    ;;
  G-CLIPBOARD)
    printf '#!/bin/bash\nxclip -selection clipboard -i < /tmp/x\n' > "$T/tools/ys-zzz-inject-clip"
    run 1 "xclip 无 DISPLAY 被杀"
    ;;
  G-CAPTURE-EMPTY)
    echo 'ok' > "$T/tools/ys-snap"            # 缺 getsize/EMPTY_CAPTURE
    run 1 "抓帧不校验非空被杀"
    ;;
  G-DEVICE)
    echo '# 无 GPU/CPU 分支' > "$T/tools/ys-editor/ys_look.py"
    run 1 "ncc 的 GPU/CPU 分支丢失被杀"
    ;;
  G-FOCUS-RETURN)
    # 新调用点：取了租约但没有 release/run（ratchet 只放行 baseline 里的存量点）
    printf '#!/bin/bash\ntools/ys-editor/ys-lease acquire --max 10\n' > "$T/tools/ys-editor/ys-zzz-inject-focus"
    run 1 "注入「取租约不归还」被杀"
    ;;
  G-WHITELIST)
    # 新调用点：白名单投影重建对象（baseline 之外的新文件必须红）
    printf 'import json\ndef f(src):\n    res = {k: src[k] for k in ("a", "b")}\n    return json.dumps(res)\n' \
      > "$T/tools/ys-editor/ys-zzz-inject-whitelist.py"
    run 1 "注入「白名单投影」被杀"
    ;;
  G-LEDGER-DEDUP)
    c="$T/cmd.jsonl"
    now=$(( $(date +%s) * 1000 ))
    for _ in 1 2 3; do printf '{"callId":"inject-dup","ts":%s}\n' "$now" >> "$c"; done
    CMDLOG="$c" run 1 "同一条 callId 重复 3 次被杀"
    ;;
  *)
    echo "用法: $0 <G-SLEEP|G-PKILL|G-IDX|G-BUDGET|G-SNAP|G-STALE|G-BBOX|G-CLIPBOARD|G-CAPTURE-EMPTY|G-DEVICE|G-LEDGER-DEDUP>" >&2
    exit 2
    ;;
esac
