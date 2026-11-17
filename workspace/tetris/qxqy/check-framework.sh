#!/usr/bin/env bash
# qxqy/check-framework.sh —— 框架层判据一条命令（接进 tetris-guard.sh --fast 的 4b 闸门）
#
# 用法：bash qxqy/check-framework.sh [--json] [--full]
#   （无参数）  跑全部**快**判据；逐项打印 [ok]/[FAIL] 名称 (耗时)
#   --json      只输出一行机读 JSON（供 CI/其它脚本消费；不打印人类可读行）
#   --full      追加慢判据「运行时错误扫描」（跑 70 条模拟器用例，分钟级；fast 档不含）
#
# 退出码：全部通过 0；任一项失败 1；参数错误 2。
#
# 为什么要有它：框架级判据原本散在 5 处，跑不跑靠人记得 —— 漏一次就可能把 v6.24 那类
# 事故（真机文字全灭：模板键名错位 + 占位符残留）放进出货。现在收成一条命令：
# 退出码即结论，guard --fast 直接调用它（闸门 4b），"要不要防护"不再是一次人的决策。
#
# 判据与它对应的事故（别删）：
#   1 tpl_contract_test       客户端模板候选表契约；事故=config 里 stext 被写成 settleText，
#                             模拟器靠兜底扫描恰好能跑、真机没字。
#   2 ui_plan_test            UI 计划 lint（字被裁/层叠/数值缺失）；事故=出图才发现文字被裁。
#   3 accept_device_test      设备适配（候选表为空 ⇒ 真机不显示）；事故=PC 可见手机端空白。
#   4 run_all                 全量 headless（tests-lua/*_test.lua + *_audit.lua）。
#   5 构建占位符（静态）      __GUID_*__ 未替换/未登记；事故=v6.24 真机文字全灭的同族防线。
#   6 --full 运行时错误扫描   70 条用例里的 lua-error / invalid object / 配置漂移 / 模板键缺失。
#
# 为什么第 5 项是**静态检查**而不是跑 build：
#   build.mjs 会重建存档（写 tetris.save.json，约 10s），而占位符风险的根因是「源码里有一个
#   不会被替换的名字」——那件事 grep 就能判，不需要产物。判据与 build.mjs:171-175 的闸门
#   （assertNoPlaceholder）同源，只是提前到构建之前，且对 build **不覆盖**的文件也能抓到。
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

JSON=0
FULL=0
for a in "$@"; do
  case "$a" in
    --json) JSON=1 ;;
    --full) FULL=1 ;;
    -h|--help)
      sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "未知参数：$a（支持 --json / --full）" >&2; exit 2 ;;
  esac
done

TMPD=$(mktemp -d "${TMPDIR:-/tmp}/check-framework.XXXXXX") || exit 2
trap 'rm -rf "$TMPD"' EXIT

names=(); oks=(); secs=(); sums=()
START_ALL=$(date +%s%3N)

now_ms() { date +%s%3N; }
ms_to_s() { awk -v a="$1" -v b="$2" 'BEGIN{printf "%.2f", (b-a)/1000}'; }

# 取日志最后一条非空行做摘要（各 lua 测试的末行就是它自己的结论行；去掉两侧的 == 装饰）
last_line() {
  awk 'NF{last=$0} END{print last}' "$1" 2>/dev/null \
    | sed -e 's/^== *//' -e 's/ *==$//'
}

record() { # name ok(0=ok) start_ms summary
  names+=("$1"); oks+=("$2"); secs+=("$(ms_to_s "$3" "$(now_ms)")"); sums+=("${4:-}")
}

# ---- 1~4：lua 判据 ----
run_lua() { # 名称 脚本路径
  local name="$1" script="$2" slug log start
  slug=$(printf '%s' "$script" | tr '/.' '__')
  log="$TMPD/$slug.log"
  start=$(now_ms)
  if lua5.3 "$script" >"$log" 2>&1; then
    record "$name" 0 "$start" "$(last_line "$log")"
  else
    record "$name" 1 "$start" "$(last_line "$log")"
  fi
}

# ---- 5：构建占位符（静态）----
# 规则（照 qxqy/build.mjs 的真源定，不是拍脑袋）：
#   * build.mjs:162-166 的 substGuids 只认 __GUID_CELL__ / __GUID_HIT__ / __GUID_SETTLE__ /
#     __GUID_STEXT__ 四个名字。**别的名字**（如 __GUID_CELLS__）永远不会被替换：字面量进 Lua
#     后 P.inst 只接受 number ⇒ 候选被静默跳过（这就是 v6.24 真机文字全灭的形状）⇒ 必须红。
#   * build.mjs:209/230 只对 **lua/main.lua 与 lua/tetris/*.lua** 做替换。四个合法名字出现在
#     其它 lua 文件里 ⇒ 也永远不替换 ⇒ 同样必须红。
#   * 合法保留处：lua/tetris/config.lua 的候选表（__GUID_CELL__/__GUID_HIT__/__GUID_STEXT__，
#     构建时才填真 guid）——它在 lua/tetris/ 下，被上面第一条规则覆盖，无需单独写死文件名。
#   * 同时抓 build.mjs:171-175 的另外三种形态（String(undefined) / "undefined" / 'undefined'）：
#     它们是同一事故的伴生形状，静态可判且当前源码零命中（无假阳性）。
placeholder_check() {
  local bad=() legal=0 hit file line name
  local scan
  scan=$(grep -rn -o '__GUID_[A-Z_]*__\|String(undefined)\|"undefined"\|'"'"'undefined'"'"'' \
    lua --include='*.lua' 2>/dev/null || true)
  # 空扫要报错：没有 lua 文件说明 glob/cwd 错了，静默通过就是假绿
  if [ -z "$(find lua -name '*.lua' -print -quit 2>/dev/null)" ]; then
    echo "lua/ 下没有 .lua 文件（cwd=$(pwd)）——检查脚本的落点"
    return 1
  fi
  while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    file=${hit%%:*}; hit=${hit#*:}; line=${hit%%:*}; name=${hit#*:}
    case "$name" in
      __GUID_CELL__|__GUID_HIT__|__GUID_SETTLE__|__GUID_STEXT__)
        if [ "$file" = "lua/main.lua" ] || [[ "$file" == lua/tetris/* ]]; then
          legal=$((legal + 1))
        else
          bad+=("$file:$line $name —— 不在 build 的替换范围（只替换 lua/main.lua 与 lua/tetris/*.lua）")
        fi
        ;;
      *)
        bad+=("$file:$line $name —— 未登记名：build.mjs 的 substGuids 只认 CELL/HIT/SETTLE/STEXT")
        ;;
    esac
  done <<<"$scan"
  if [ "${#bad[@]}" -gt 0 ]; then
    printf '%s\n' "${bad[@]}"
    return 1
  fi
  printf '占位符合法 %d 处（均在 build 会替换的位置；未登记名 0、undefined 字面量 0）\n' "$legal"
  return 0
}

run_placeholder() {
  local start log
  log="$TMPD/placeholder.log"
  start=$(now_ms)
  if placeholder_check >"$log" 2>&1; then
    record "构建占位符（静态）" 0 "$start" "$(last_line "$log")"
  else
    local first
    first=$(head -3 "$log" | tr '\n' ' ')
    record "构建占位符（静态）" 1 "$start" "$first"
  fi
}

# ---- 6（--full）：运行时错误扫描 ----
# ⚠ 这个脚本**永远 exit 0**（它只打印不退出）；判据必须是解析它的摘要行「异常行 N」⇒ N=0 才算过。
# 只看退出码 = 假绿（本项目已经踩过"门禁看着绿其实没在判"）。
run_scan_runtime() {
  local log start n
  log="$TMPD/scan-runtime-errors.log"
  start=$(now_ms)
  if ! node qxqy/scan-runtime-errors.mjs >"$log" 2>&1; then
    record "运行时错误扫描（--full）" 1 "$start" "扫描脚本自身执行失败（看 $log 已删；重跑 node qxqy/scan-runtime-errors.mjs）"
    return
  fi
  n=$(grep -o '异常行 [0-9]\+' "$log" | tail -1 | grep -o '[0-9]\+')
  if [ "${n:-x}" = "0" ]; then
    record "运行时错误扫描（--full）" 0 "$start" "$(grep -o '扫描用例 [0-9]\+ 条；异常行 [0-9]\+' "$log" | tail -1)"
  else
    record "运行时错误扫描（--full）" 1 "$start" "异常行 ${n:-?}（首条：$(grep -E '^  ' "$log" | head -1))"
  fi
}

run_lua "tpl 契约（模板候选表）" "tests-lua/tpl_contract_test.lua"
run_lua "UI 计划 lint" "tests-lua/ui_plan_test.lua"
run_lua "设备适配" "tests-lua/accept_device_test.lua"
run_lua "headless 全量" "tests-lua/run_all.lua"
run_framework() { # 框架本体：frameworks/qxqy-ui/tests/run_all.lua
  local log start out
  log="$TMPD/framework.log"
  start=$(now_ms)
  if (cd ../.. && lua5.3 frameworks/qxqy-ui/tests/run_all.lua) >"$log" 2>&1; then
    record "框架本体自测" 0 "$start" "$(grep -E '== qxqy_ui framework' "$log" | tail -1)"
  else
    record "框架本体自测" 1 "$start" "$(last_line "$log")"
  fi
}

# 框架本体自测（frameworks/qxqy-ui 是**复制出去复用**的那一份，必须自带能力证明）。
# 它跑的是框架自己的模块与自己的测试，与上面的项目测试互补：项目证明"接线对"，框架证明"能力在"。
run_framework
run_placeholder
[ "$FULL" = "1" ] && run_scan_runtime

# ---- 汇总 ----
total=${#names[@]}
failed=0
for i in "${!oks[@]}"; do [ "${oks[$i]}" -ne 0 ] && failed=$((failed + 1)); done
elapsed=$(ms_to_s "$START_ALL" "$(now_ms)")

json_escape() { printf '%s' "$1" | tr -d '\n\t' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

if [ "$JSON" = "1" ]; then
  printf '{"pass":%s,"mode":"%s","total":%s,"failed":%s,"elapsed":%s,"items":[' \
    "$([ "$failed" -eq 0 ] && echo true || echo false)" \
    "$([ "$FULL" = "1" ] && echo full || echo fast)" \
    "$total" "$failed" "$elapsed"
  for i in "${!names[@]}"; do
    [ "$i" -gt 0 ] && printf ','
    printf '{"name":"%s","ok":%s,"secs":%s,"summary":"%s"}' \
      "$(json_escape "${names[$i]}")" \
      "$([ "${oks[$i]}" -eq 0 ] && echo true || echo false)" \
      "${secs[$i]}" "$(json_escape "${sums[$i]}")"
  done
  printf ']}\n'
  [ "$failed" -eq 0 ] && exit 0 || exit 1
fi

printf '== check-framework（%s）：框架层判据一键 ==\n' "$([ "$FULL" = "1" ] && echo 'full（含慢档）' || echo 'fast')"
for i in "${!names[@]}"; do
  if [ "${oks[$i]}" -eq 0 ]; then
    printf '[ok]   %s (%ss)  %s\n' "${names[$i]}" "${secs[$i]}" "${sums[$i]}"
  else
    printf '[FAIL] %s (%ss)  %s\n' "${names[$i]}" "${secs[$i]}" "${sums[$i]}"
  fi
done

if [ "$failed" -eq 0 ]; then
  printf '\nFRAMEWORK-PASS %d 项 (%ss)\n' "$total" "$elapsed"
  exit 0
fi
printf '\nFRAMEWORK-FAIL %d/%d 项失败 (%ss)：\n' "$failed" "$total" "$elapsed"
for i in "${!names[@]}"; do
  [ "${oks[$i]}" -ne 0 ] && printf '  - %s :: %s\n' "${names[$i]}" "${sums[$i]}"
done
printf '  明细：单独跑上面 [FAIL] 项对应的 lua 测试；占位符项看它打印的文件:行。\n'
exit 1
