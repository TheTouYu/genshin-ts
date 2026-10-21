#!/bin/bash
# no-xbell.sh — 禁止裸用 ImageMagick `import`（2026-10-21 用户三次反馈"还有提示音"的根因）。
#
# 根因：`import -window <id>` 每次抓帧都会敲一次 **X11 铃**，KWin 把铃放成 "bell" 音效；
#       ys-lookd 每次 world/state 都在抓帧 ⇒ 用户听到"操作提示音"，而画面根本没变化。
# 判据：源码里不得出现不带 `-silent` 的 import 调用（`import -window` / `"import","-window"`）。
set -u
cd "$(dirname "$0")/../../.." || exit 1
hits=$(grep -rn --include="*.py" --include="ys-*" --exclude="*.bak-*" -E '(^[[:space:]]*import -window|subprocess\.run\(\["import",[[:space:]]*"-window")' \
        tools/ .scratch/gui-service/ 2>/dev/null | grep -v -- "-silent" \
        | grep -vE ':[0-9]+:[[:space:]]*#' | grep -v '·' || true)
if [ -n "$hits" ]; then
  printf '%s\n' "$hits" | head -5
  echo "NO-XBELL FAIL 裸 import 会敲 X11 铃（用户会听到提示音）；请加 -silent"
  exit 1
fi
echo "NO-XBELL-RESULT hits=0 verdict=PASS"
