#!/bin/bash
# ledger-inject.sh — 失败账本的**注入用例**（证明门禁不是空转）
#
# 每条账目的 `inject` 字段指向本脚本的一个模式；脚本退出码 0 = 「故障被正确抓住」。
# 设计要点（2026-10-17 用户定：防线必须有注入用例，缺用例的账目降回 open）：
#   · 注入物一律临时创建，`trap` 保证还原 —— 失败/中断都不许污染仓库。
#   · 判据是「门禁必须报红」，不是「命令没崩」；抓不住 = 用例失败。
#
# 用法: ledger-inject.sh <mode>      mode ∈ noswallow | regress-neg
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; YS="$(dirname "$HERE")"; ROOT="$(dirname "$(dirname "$YS")")"
cd "$ROOT" || exit 3

mode="${1:-}"
case "$mode" in
  # ① 注入「点击吞退出码」→ noswallow 门禁必须检测到
  noswallow)
    tmp="tools/ys-editor/ys-zzz-inject-swallow"
    trap 'rm -f "$tmp"' EXIT
    printf '#!/bin/bash\n# 注入物：故意把点击诊断吞掉（模拟 2026-10-17 事故）\n./ys-pointer-click 1 1 2>/dev/null >/dev/null\n' > "$tmp"
    chmod +x "$tmp"
    if bash -c '! grep -rl "ys-pointer-click.*2>/dev/null" tools/ys-editor/ys-* 2>/dev/null | grep -q .'; then
      echo "INJECT-FAIL noswallow: 注入物存在但门禁没报红（门禁空转）"; exit 1
    fi
    echo "INJECT-PASS noswallow: 注入的吞码文件被 noswallow 抓到了"; exit 0
    ;;
  # ② 注入「错标样本」→ gate1（判定回归）必须报红
  regress-neg)
    man="tools/ys-editor/calib/regress/manifest.tsv"
    bak="$(mktemp)"; cp "$man" "$bak"
    trap 'cp "$bak" "$man"; rm -f "$bak"' EXIT
    printf 'regress-neg-inject.png\tPLAYTEST\tINJECT: 错标样本（应被 gate1 判红）\n' >> "$man"
    cp tools/ys-editor/calib/regress/menu.png tools/ys-editor/calib/regress/regress-neg-inject.png 2>/dev/null
    trap 'cp "$bak" "$man"; rm -f "$bak" tools/ys-editor/calib/regress/regress-neg-inject.png' EXIT
    tools/ys-editor/ys-state --regress --channel full >/dev/null 2>&1
    rc=$?
    if [ "$rc" -eq 0 ]; then
      echo "INJECT-FAIL regress-neg: 错标样本（menu.png 期望 PLAYTEST）没让回归报红（门禁空转）"; exit 1
    fi
    echo "INJECT-PASS regress-neg: 错标样本让回归报红 rc=$rc"; exit 0
    ;;
  # ③ 注入「路径漏一级」→ ys-slot-check --lint 必须报 ABS-STALE（我 2026-10-17 犯的错本身）
  path-typo)
    out=$(tools/ys-editor/ys-slot-check --lint '/home/genshin-ts/.scratch/x/bin/python -V' 2>&1); rc=$?
    if [ "$rc" -eq 0 ]; then echo "INJECT-FAIL path-typo: 漏 /h 的路径没被 lint 拦下（门禁空转）"; exit 1; fi
    echo "INJECT-PASS path-typo: rc=$rc $(printf '%s' "$out" | head -1 | cut -c1-70)"; exit 0
    ;;
  *) echo "用法: $0 noswallow|regress-neg|path-typo" >&2; exit 2 ;;
esac
