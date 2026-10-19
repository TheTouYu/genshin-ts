#!/usr/bin/env bash
# eval.sh — GUI 检测评测台一键入口（CALIBER-v2 口径）。全部产物落 .scratch/gui-detect/eval-out/。
#   ./eval.sh old      阶段 A：旧真值（11 个版本目录去重）+ 两个 gui-collect 多帧组
#   ./eval.sh old-both 同上，加训练链路口径（train：无 NMS，与 d2.evaluate 逐字一致）
#   ./eval.sh d2val    只评训练时的留族验证集（数字与 D2-improve 表直接并列 = 未退化证据）
#   ./eval.sh merged   阶段 B/C：perception 交付 truth-merged 后的一键重跑
#   ./eval.sh all      阶段 B/C + 多帧组
#   ./eval.sh 任何参数都原样透传给 eval_v2.py
set -euo pipefail
cd "$(dirname "$0")/../.."
EV=".scratch/gui-detect/eval_v2.py"
MULTI=(--multi-dir .scratch/gui-collect/menu --multi-dir .scratch/gui-collect/world)
case "${1:-old}" in
  old)      shift || true; exec python3 "$EV" --preset old  --channel prod "${MULTI[@]}" --out .scratch/gui-detect/eval-out/old-prod "$@" ;;
  old-both) shift || true; exec python3 "$EV" --preset old  --channel both "${MULTI[@]}" --out .scratch/gui-detect/eval-out/old-both "$@" ;;
  d2val)    shift || true; exec python3 "$EV" --preset old  --channel both --d2-val --out .scratch/gui-detect/eval-out/d2val "$@" ;;
  merged)   shift || true; exec python3 "$EV" --preset merged --channel prod "${MULTI[@]}" --out .scratch/gui-detect/eval-out/merged-prod "$@" ;;
  all)      shift || true; exec python3 "$EV" --preset all --channel prod "${MULTI[@]}" --out .scratch/gui-detect/eval-out/all-prod "$@" ;;
  *)        exec python3 "$EV" "$@" ;;
esac
