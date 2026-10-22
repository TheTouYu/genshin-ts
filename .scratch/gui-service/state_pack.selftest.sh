#!/usr/bin/env bash
# state_pack 自测：正例 / 负例 / 非法包 / 期望不符，四类各一条。
# 用法：bash .scratch/gui-service/state_pack.selftest.sh
# 退出码：0 全部通过；非 0 有失败项（逐条打印 PASS/FAIL）。
set -u
cd "$(dirname "$0")/../.." || exit 8
SP=".scratch/gui-service/state_pack.py"
PACK=".scratch/gui-service/packs/gn-start-v1.json"
POS="${1:-/tmp/look1.json}"          # 登录门帧的 look 回执
NEG="${2:-/tmp/look_f06.json}"       # 派蒙菜单帧的 look 回执
FAIL=0

chk() { # chk <名字> <期望 rc> <实际 rc> [补充说明]
  if [ "$3" = "$2" ]; then echo "PASS $1 (rc=$3) ${4:-}"; else echo "FAIL $1 期望 rc=$2 实得 rc=$3 ${4:-}"; FAIL=$((FAIL+1)); fi
}

# 1. 结构校验
python3 "$SP" validate --pack "$PACK" >/dev/null 2>&1; chk "validate 合法包" 0 $?

# 2. 正例：登录门 → START
out=$(python3 "$SP" eval --pack "$PACK" --look "$POS" --expect-state START 2>&1); rc=$?
got=$(printf '%s' "$out" | python3 -c "import json,sys;print(json.load(sys.stdin)['state'])" 2>/dev/null)
chk "正例 登录门→START" 0 $rc "(state=$got)"

# 3. 负例：派蒙菜单 → 不匹配任何状态
out=$(python3 "$SP" eval --pack "$PACK" --look "$NEG" 2>&1); rc=$?
got=$(printf '%s' "$out" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['state'])" 2>/dev/null)
if [ "$got" = "None" ] && [ "$rc" = "0" ]; then echo "PASS 负例 派蒙菜单→None (rc=0)"; else echo "FAIL 负例 期望 None/0 实得 state=$got rc=$rc"; FAIL=$((FAIL+1)); fi

# 4. 期望不符 → rc=9
python3 "$SP" eval --pack "$PACK" --look "$NEG" --expect-state START >/dev/null 2>&1
chk "期望不符 返回 9" 9 $?

# 5. 非法包 → rc=2（coord_space 写错）
bad=$(mktemp /tmp/badpack.XXXXXX.json)
python3 - "$PACK" "$bad" <<'PY'
import json,sys
p=json.load(open(sys.argv[1])); p["coord_space"]="logical-ish"
json.dump(p,open(sys.argv[2],"w"),ensure_ascii=False)
PY
python3 "$SP" validate --pack "$bad" >/dev/null 2>&1; chk "非法包被拒" 2 $?
rm -f "$bad"

# 6. 集成：worldsvc look --pack（判据走包，13 态结论退居 state_vocab）
if [ -f .scratch/gui-service/worldsvc.py ]; then
  probe=$(mktemp /tmp/probe.XXXXXX.json)
  cat > "$probe" <<'J'
{"schema":"gui.statepack/v1","pack":"probe-v1","coord_space":"physical",
 "states":[{"id":"PROBE","precedence":10,"rule":"all","predicates":[
   {"type":"text_present","texts":["好友"],"match":"contains"}]}]}
J
  out=$(timeout 60 python3 .scratch/gui-service/worldsvc.py look \
        --frame "${FRAME_NEG:-.scratch/gui-corpus/f06.png}" --pack "$probe" --summary 2>/dev/null)
  got=$(printf '%s' "$out" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['state']['name'])" 2>/dev/null)
  voc=$(printf '%s' "$out" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('state_vocab'))" 2>/dev/null)
  if [ "$got" = "PROBE" ] && [ "$voc" = "GAME_PAIMON" ]; then
    echo "PASS 集成 look --pack（state=PROBE / state_vocab=GAME_PAIMON）"
  else
    echo "FAIL 集成 look --pack 期望 PROBE/GAME_PAIMON 实得 $got/$voc"; FAIL=$((FAIL+1))
  fi

  # 7. 集成：不命中的包必须回 UNKNOWN + novel=true（不猜最像的）
  out=$(timeout 60 python3 .scratch/gui-service/worldsvc.py look \
        --frame "${FRAME_NEG:-.scratch/gui-corpus/f06.png}" --pack "$PACK" --summary 2>/dev/null)
  got=$(printf '%s' "$out" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['state']['name'],d['state'].get('novel'))" 2>/dev/null)
  if [ "$got" = "UNKNOWN True" ]; then echo "PASS 未命中回 UNKNOWN+novel"; else echo "FAIL 未命中 期望 'UNKNOWN True' 实得 '$got'"; FAIL=$((FAIL+1)); fi
  rm -f "$probe"
fi

echo "----"
if [ "$FAIL" -eq 0 ]; then echo "RESULT: PASS"; exit 0; else echo "RESULT: FAIL ($FAIL)"; exit 1; fi
