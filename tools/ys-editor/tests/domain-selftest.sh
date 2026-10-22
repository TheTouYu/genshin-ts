#!/bin/bash
# 自测/门禁用：绕过屏幕占用契约（生产调用路径不许设；真实占用必须先在对话里申请）
export YS_SLOT_TEST=1
# domain-selftest.sh — 「执行域自检 + 破坏性操作闸门」的离线回归（2026-10-17 三例）
#
# 回归对象是三例**在真实桌面上付出过代价**的错误，不是假想：
#   #4 槽内用绝对路径调 venv python ⇒ `timeout: 无法运行命令` rc=127，白跑两轮。
#      （2026-10-17 21:0x 实测修正：真因不是"槽内文件系统不同"，而是那条绝对路径**本身就已经错了**——
#       `/home/genshin-ts` 在槽内外都 ENOENT，真实仓库根是 `/home/h/genshin-ts`。）
#   #5 槽外设剪贴板（无 DISPLAY）静默失败 ⇒ 粘进输入框的是**自己的聊天文本**。
#   #6 `pkill -f "xclip -selection clipboard"` 匹配到发起它的 bash 自身 ⇒ 自杀。
#
# 本自测**全程离线**：不点击、不抢焦点、不抓真屏、不进 ys-gui-slot。
# 槽内域用环境变量模拟（YS_SLOT_ACTIVE=1 + DISPLAY + XAUTHORITY），
# 真槽内另有一次人工实测（见 domain.json 的 measured 字段）。
#
# 退出码：0=全绿；1=有失败项。末尾机读行：DOMAIN-RESULT checks=<n> pass=<n> fail=<n> verdict=PASS|FAIL
set -u

HERE="$(cd "$(dirname "$0")/.." && pwd)"          # tools/ys-editor
ROOT="$(cd "$HERE/../.." && pwd)"                  # 仓库根
CHK="$HERE/ys-slot-check"
KILL="$HERE/ys-safe-kill"
RM="$HERE/ys-safe-rm"
BUDGET_MS=300

declare -i TOTAL=0 PASS=0 FAIL=0

ok()  { PASS+=1; echo "  ✓ $*"; }
bad() { FAIL+=1; echo "  ✗ $*"; }
t()   { TOTAL+=1; echo "· $*"; }

OUT=""; RC=0
run() { OUT="$("$@" 2>&1)"; RC=$?; }
has() { case "$OUT" in *"$1"*) return 0;; *) return 1;; esac; }
want_rc() {   # want_rc <期望> <说明>
  if [ "$RC" = "$1" ]; then ok "$2（rc=$RC）"; else bad "$2：期望 rc=$1 实得 rc=$RC"; fi
}
want_has() {  # want_has <子串> <说明>
  if has "$1"; then ok "$2"; else bad "$2：输出里没有 '$1'"; fi
}

TMP="$(mktemp -d)"
DECOY_PID=""
cleanup() {
  [ -n "$DECOY_PID" ] && kill "$DECOY_PID" 2>/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "== 0. 工具就位 =="
for f in "$CHK" "$KILL" "$RM" "$HERE/domain.json"; do
  t "存在且可执行：${f#$ROOT/}"
  if [ -e "$f" ] && { [ -x "$f" ] || [ "${f##*.}" = json ]; }; then ok "在位"; else bad "缺失/不可执行"; fi
done

echo
echo "== 1. domain.json 自审（契约本身不能自相矛盾）=="
t "--audit"
run "$CHK" --audit
want_rc 0 "--audit 全绿"
want_has "DOMAIN-AUDIT" "--audit 打出机读行"
want_has "verdict=PASS" "--audit verdict=PASS"

echo
echo "== 2. 槽外域：能力读数与动作闸门 =="
t "--outside 断言"
run env -u DISPLAY -u XAUTHORITY "$CHK" --outside
want_rc 0 "槽外断言通过"
want_has "domain=outside" "机读行域=outside"
want_has "verdict=PASS" "槽外自检 PASS"

t "槽外无 X 时 --need clipboard 必须拦下（#5 的机器形态）"
run env -u DISPLAY -u XAUTHORITY "$CHK" --need clipboard
want_rc 1 "--need clipboard 被拦"
want_has "不可用" "给出「不可用」判定"
want_has "ys-gui-slot" "建议里指明要进槽"
want_has "verdict=FAIL" "机读行 verdict=FAIL"

echo
echo "== 3. 槽内域（环境模拟）：断言与矛盾检测 =="
XAUTH="${XAUTHORITY:-$(ls /run/user/"$(id -u)"/xauth_* 2>/dev/null | head -1)}"
t "--in-slot 断言（YS_SLOT_ACTIVE=1 DISPLAY=:1）"
run env YS_SLOT_ACTIVE=1 DISPLAY=:1 XAUTHORITY="$XAUTH" "$CHK" --in-slot
want_rc 0 "槽内断言通过"
want_has "domain=in_slot" "机读行域=in_slot"
want_has "槽内 YS_SLOT_ACTIVE=1" "inject 能力识别为「槽内直通」"

t "域矛盾：在槽内环境里断言 --outside 必须失败"
run env YS_SLOT_ACTIVE=1 DISPLAY=:1 XAUTHORITY="$XAUTH" "$CHK" --outside
want_rc 2 "矛盾断言退出码 2"
want_has "期望域=outside" "报告期望域与实际域的差异"

echo
echo "== 4. 三例违例：动作前必须被拦并给替代命令 =="
t "#4 绝对路径（/home/genshin-ts 是错的根）"
run "$CHK" --lint '/home/genshin-ts/.scratch/gui-grounding/venv-rapidocr/bin/python ./tools/ys-editor/ys_look.py a.png'
want_rc 3 "lint 拦下 rc=3"
want_has "ABS-STALE" "规则名 ABS-STALE"
want_has "./.scratch/gui-grounding/venv-rapidocr/bin/python" "替代命令给相对路径"

t "#5 槽外设剪贴板"
run env -u DISPLAY -u XAUTHORITY "$CHK" --lint "printf '云阶' | xclip -selection clipboard -i"
want_rc 3 "lint 拦下 rc=3"
want_has "CLIP-NO-DISPLAY" "规则名 CLIP-NO-DISPLAY"
want_has "ys-env.sh" "替代命令给 . ys-env.sh"

t "#6 pkill -f 自匹配"
run "$CHK" --lint 'pkill -f "xclip -selection clipboard"'
want_rc 3 "lint 拦下 rc=3"
want_has "SELFKILL" "规则名 SELFKILL"
want_has "ys-safe-kill" "替代命令给 ys-safe-kill"
if has "CLIP-NO-DISPLAY"; then bad "#6 ⨯ #5 混淆：pkill 的模式串被当成 xclip 调用（假阳性）"; else ok "无误报：模式串里的 xclip 不算调用"; fi

t "干净命令不报（假阳性闸门）"
run "$CHK" --lint './tools/ys-editor/ys-state --fast'
want_rc 0 "干净命令 rc=0"
want_has "verdict=PASS" "LINT-RESULT verdict=PASS"

t "读剪贴板（-o）不算设剪贴板"
run env -u DISPLAY -u XAUTHORITY "$CHK" --lint 'xclip -selection clipboard -o >/dev/null'
want_rc 0 "只读用法不报"

echo
echo "== 5. 预算：自检 ≤${BUDGET_MS}ms =="
t "计时（env -u DISPLAY，取 ms 整数）"
start="$(date +%s%N)"
env -u DISPLAY -u XAUTHORITY "$CHK" --outside >/dev/null 2>&1
elapsed_ms=$(( ($(date +%s%N) - start) / 1000000 ))
if [ "$elapsed_ms" -le "$BUDGET_MS" ]; then ok "实测 ${elapsed_ms}ms ≤ ${BUDGET_MS}ms"; else bad "实测 ${elapsed_ms}ms 超预算"; fi

echo
echo "== 6. ys-safe-kill：先解析、排除自身、--yes 才动 =="
cp /bin/sleep "$TMP/ys-decoy-kill"
"$TMP/ys-decoy-kill" 30 &
DECOY_PID=$!
sleep 0.2

t "干跑：列出目标但不杀"
run "$KILL" ys-decoy-kill
want_rc 2 "干跑 rc=2（未执行）"
want_has "SAFE-KILL-DRYRUN" "机读行 DRYRUN"
want_has "pid=$DECOY_PID" "名单里点名了 decoy pid"
if kill -0 "$DECOY_PID" 2>/dev/null; then ok "干跑后 decoy 仍存活"; else bad "干跑竟然把 decoy 杀了"; fi

t "自匹配：#6 的形态必须被拒绝（rc=3，且发起者不被杀）"
run bash -c '"$1" --full "$2"; echo "inner-rc=$?"' -- "$KILL" "DOMAIN-SELFTEST-SELFKILL-MARK"
want_has "inner-rc=3" "拒杀 rc=3"
want_has "SAFE-KILL-SELFMONLY" "机读行 SELFMONLY"
want_has "ancestor" "明确指出命中的是祖先 shell"
ok "发起本测试的 shell 仍在执行（能走到这一行就是证据）"

t "真执行：--yes 才动手，并复核已消失"
run "$KILL" --yes ys-decoy-kill
want_rc 0 "执行 rc=0"
want_has "SAFE-KILL-DONE" "机读行 DONE"
want_has "still_alive=0" "复核：无残留"
if kill -0 "$DECOY_PID" 2>/dev/null; then bad "decoy 还在（未杀干净）"; else ok "decoy 已消失"; DECOY_PID=""; fi

t "无目标"
run "$KILL" no-such-proc-name-$$
want_rc 1 "无匹配 rc=1"
want_has "SAFE-KILL-NOTARGET" "机读行 NOTARGET"

echo
echo "== 7. ys-safe-rm：先解析、拒可疑范围、--yes 才动 =="
echo hi > "$TMP/a.txt"
mkdir -p "$TMP/tree/deep"; echo x > "$TMP/tree/deep/b.txt"

t "干跑"
run "$RM" "$TMP/a.txt"
want_rc 2 "干跑 rc=2"
want_has "SAFE-RM-DRYRUN" "机读行 DRYRUN"
[ -f "$TMP/a.txt" ] && ok "干跑后文件仍在" || bad "干跑竟然删了文件"

t "拒绝受保护：仓库根"
run "$RM" --yes -r "$ROOT"
want_rc 3 "仓库根 rc=3"
want_has "受保护路径" "给出受保护理由"

t "拒绝受保护：家目录"
run "$RM" --yes -r "$HOME"
want_rc 3 "家目录 rc=3"

t "拒绝受保护：cwd 的祖先（/home 这类）"
run "$RM" --yes -r /home
want_rc 3 "/home rc=3"

t "拒绝未展开的 glob（范围不确定）"
run "$RM" --yes "$TMP/*"
want_rc 3 "glob rc=3"
want_has "元字符" "说明为什么拒"
if [ -f "$TMP/a.txt" ] && [ -d "$TMP/tree" ]; then ok "glob 被拒后什么都没删"; else bad "glob 被拒却删了东西"; fi

t "目录未加 -r 拒绝"
run "$RM" --yes "$TMP/tree"
want_rc 3 "目录无 -r rc=3"
[ -d "$TMP/tree" ] && ok "目录仍在" || bad "目录被误删"

t "目标不存在 ⇒ 拒绝（不当作没事）"
run "$RM" "$TMP/never-existed"
want_rc 1 "不存在 rc=1"
want_has "SAFE-RM-REFUSED" "机读行 REFUSED"

t "真删（-r）"
run "$RM" --yes -r "$TMP/tree"
want_rc 0 "删除 rc=0"
want_has "SAFE-RM-DONE" "机读行 DONE"
[ -e "$TMP/tree" ] && bad "删后仍存在" || ok "目录已消失"

echo
echo "== 8. 约束：零新增依赖 + 全程离线 =="
t "三个工具只用 python3 标准库"
imports="$(sed -n 's/^import \([a-z_0-9]*\).*/\1/p;s/^from \([a-z_0-9]*\) import.*/\1/p' "$CHK" "$KILL" "$RM" | sort -u | tr '\n' ' ')"
bad_imports=""
for m in $imports; do
  case "$m" in
    argparse|json|os|re|shutil|signal|subprocess|sys|time) continue ;;
  esac
  # 仓内本地模块不算「新增依赖」（如 ys_env.py：X 会话环境的唯一入口，就在同目录）；
  # 判据仍是「没有第三方依赖」——本地 .py 找不到才算可疑。
  if ls "$HERE/$m.py" >/dev/null 2>&1; then continue; fi
  bad_imports="$bad_imports $m"
done
if [ -z "$bad_imports" ]; then ok "import 全在标准库：$imports"; else bad "可疑 import:$bad_imports"; fi

t "工具自身不做 GUI 动作（不点击/不抢焦点/不抓屏/不进槽）"
# 只审**真正的子进程调用**（run(["xdotool", …]) 这类），建议文案里提到工具名不算动作
calls="$(grep -hoE 'run\(\["(xdotool|wmctrl|ydotool|import|spectacle|ys-gui-slot)"[^]]*\]' "$CHK" "$KILL" "$RM" || true)"
danger="$(printf '%s\n' "$calls" | grep -E 'mousemove|click|key|windowactivate|type|import|spectacle|gui-slot' || true)"
if [ -z "$danger" ]; then
  ok "无动作类调用（只读子进程：$(printf '%s' "$calls" | tr '\n' ' '))"
else
  bad "发现动作类调用：$danger"
fi

echo
echo "────────────────────────────────────────────────────────────"
if [ "$FAIL" -eq 0 ]; then
  echo "DOMAIN-RESULT checks=$TOTAL pass=$PASS fail=$FAIL verdict=PASS"
  exit 0
fi
echo "DOMAIN-RESULT checks=$TOTAL pass=$PASS fail=$FAIL verdict=FAIL"
exit 1
