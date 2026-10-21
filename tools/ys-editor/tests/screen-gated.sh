#!/bin/bash
# screen-gated.sh — 会**真实注入/抬窗/发声**的测试的统一闸门。
#
# 背景（2026-10-21 用户三次反馈「说完成了却还有提示音」）：
#   有些"离线"回归其实会注入真实输入（例如 gui-skills 自测里的 alt_input 按 Escape）
#   或抬真实窗口。它们混在 failure-ledger check 里跑，用户会在**完全不知情**的时候
#   听到系统音、看到画面闪。
#
# 用法：screen-gated.sh <命令...>
#   默认 **SKIP**（退出码 0，打印一行 SKIP，不当成通过）；
#   要跑必须显式 YS_ALLOW_SCREEN_TEST=1（并且此时应已在对话里拿到用户授权）。
set -u
if [ "${YS_ALLOW_SCREEN_TEST:-0}" != "1" ]; then
  echo "SCREEN-GATED SKIP 会动真实屏幕/注入真实输入：要跑请显式 YS_ALLOW_SCREEN_TEST=1（并已向用户申请）"
  exit 0
fi
exec "$@"
