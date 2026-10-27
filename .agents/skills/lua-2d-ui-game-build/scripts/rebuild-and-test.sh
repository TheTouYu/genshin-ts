#!/usr/bin/env bash
# 顺序门（防「假绿」）：lua 语法 → build → 存档内 Lua 副本确已更新 → runner [→ shot]
#
# 为什么必须按这个顺序：
#   runner 读的是存档（*.save.json）里的 **Lua 源码副本**，不是磁盘上的 lua/main.lua。
#   改完 lua 直接跑 runner，会得到「四条本该红的用例全绿」的假绿（见技能 §4 判据 1）。
#
# 用法: bash rebuild-and-test.sh <工程目录> [--with-shot] [--sentinel=<新加的标识符>]
#   工程目录需含 lua/main.lua、qxqy/build.mjs、qxqy/runner.mjs、*.save.json
set -uo pipefail

if [ -z "${1:-}" ]; then
  echo "用法: bash rebuild-and-test.sh <工程目录> [--with-shot] [--sentinel=<新加的标识符>]"
  exit 2
fi
proj=$1
with_shot=0
sentinel=""
for a in "${@:2}"; do
  case "$a" in
    --with-shot) with_shot=1 ;;
    --sentinel=*) sentinel=${a#--sentinel=} ;;
    *) echo "未知参数: $a"; exit 2 ;;
  esac
done

cd "$proj" 2>/dev/null || { echo "FAIL 目录不存在: $proj"; exit 2; }
root=$(pwd)

for f in lua/main.lua qxqy/build.mjs qxqy/runner.mjs; do
  [ -f "$f" ] || { echo "FAIL 缺 $f —— 骨架见技能 §4（单一真源 + 三道命令）"; exit 2; }
done
save=$(ls -1 *.save.json 2>/dev/null | head -1)
[ -n "$save" ] || { echo "FAIL 找不到 *.save.json（build.mjs 的产物）"; exit 2; }

before=$(sha256sum "$save" | cut -c1-16)

echo "== 1/4 lua 语法门（lua5.3 loadfile，秒级）"
lua5.3 -e 'assert(loadfile("lua/main.lua"))'
st=$?
echo "[exit $st] lua 语法门"
[ $st -eq 0 ] || { echo "FAIL 语法门未过，后面的门没有意义"; exit $st; }

echo "== 2/4 build（lua → 存档 + GIA）"
node qxqy/build.mjs
st=$?
echo "[exit $st] build"
[ $st -eq 0 ] || { echo "FAIL build 未过"; exit $st; }

echo "== 3/4 存档内 Lua 副本 == 磁盘 lua（假绿门）"
after=$(sha256sum "$save" | cut -c1-16)
[ "$before" = "$after" ] && echo "INFO 存档 sha 未变（$before）——build 幂等，说明磁盘 lua 与存档本已一致"
# 判据 1：脚本比存档新 ⇒ 存档里是旧副本
if [ lua/main.lua -nt "$save" ]; then
  echo "FAIL lua/main.lua 比 $save 新 —— runner 会读旧副本，先 build"
  exit 1
fi
# 判据 2：行数不一致 ⇒ 存档副本不是这份 lua（build 注入 GUID 不改变行数）
lines_disk=$(wc -l < lua/main.lua | tr -d ' ')
lines_save=$(python3 - "$save" <<'PY'
import json,sys
doc=json.load(open(sys.argv[1],encoding='utf-8'))
srcs=[]
def walk(n):
    if isinstance(n,dict):
        s=n.get('source')
        if isinstance(s,str) and len(s)>32: srcs.append(s)
        for v in n.values(): walk(v)
    elif isinstance(n,list):
        for v in n: walk(v)
walk(doc)
print(max((s.count('\n') for s in srcs), default=-1))
PY
)
if [ "$lines_save" = "-1" ]; then
  echo "WARN 存档里没找到内嵌脚本 source（结构可能不同）——跳过行数判据，只信哨兵"
elif [ "$lines_disk" != "$lines_save" ]; then
  echo "FAIL 行数不一致：磁盘 lua $lines_disk 行 / 存档副本 $lines_save 行 ⇒ 存档里不是当前这份 lua"
  exit 1
fi
# 判据 3：可选哨兵——新加的标识符必须已进存档
if [ -n "${sentinel:-}" ] && ! grep -q -- "$sentinel" "$save"; then
  echo "FAIL 哨兵 '$sentinel' 不在存档里 —— build 没把这份 lua 写进去"
  exit 1
fi
echo "PASS 存档副本与磁盘 lua 同源（各 $lines_disk 行；$before → $after）"

log=$(mktemp)
echo "== 4/4 runner 用例回归"
node qxqy/runner.mjs 2>&1 | tee "$log"
st=${PIPESTATUS[0]}
echo "[exit $st] runner"
tail -n 5 "$log" > "$log.tail"

if [ $st -eq 0 ] && [ $with_shot -eq 1 ]; then
  echo "== 附加 shot 出图（真实渲染，不是示意图）"
  node qxqy/shot.mjs
  st=$?
  echo "[exit $st] shot"
fi

echo
echo "================================"
echo "四元组"
echo "  跑了什么 : lua5.3 loadfile → build.mjs → 存档 sha 校验 → runner.mjs$([ $with_shot -eq 1 ] && echo ' → shot.mjs')"
echo "  工作目录 : $root"
echo "  退出码   : $st"
echo "  关键日志 : $(tail -n 1 "$log.tail" 2>/dev/null)"
echo "================================"
rm -f "$log" "$log.tail"
exit $st
