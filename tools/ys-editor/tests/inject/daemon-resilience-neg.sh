#!/bin/bash
# inject/daemon-resilience-neg.sh — F-2-11 的注入用例（证明 daemon-resilience 门禁不是空转）
#
# 注入什么：把 `ys_lookd.py` 回包处的两个 except 兜底删掉，恢复 **2026-10-18 事故形态**：
#   `c.sendall(resp)` 裸调 ⇒ 客户端 RST 之后抛 BrokenPipeError ⇒ 没人接 ⇒ 冒泡出 serve() ⇒ 进程退出。
#   这正是 F-2-11 记的那件事：客户端提前断开把常驻服务掀翻（此后每次调用回退本地，慢 4 倍）。
# 预期红哪条：`✗ 服务退出了（socket 对端 pid … → NONE）—— 客户端断开把常驻服务杀了`。
#
# 为什么必须起**私有实例**（本用例最容易踩的一条）：
#   · 生产 daemon 是**已经在内存里跑**的进程，改磁盘上的源文件对它没有任何影响；
#   · 而重启生产服务被明令禁止（会斩断别人飞行中的调用）。
#   ⇒ 所以把注入后的副本在**同一目录**起一个私有实例（`YS_LOOKD_SOCK=/tmp/...`，
#      同目录是因为 ys_lookd.py 用 `sys.path.insert(0, dirname(__file__))` 找 ys_look/ys-state），
#      再用**同一条门禁**去判它。全程不碰生产 socket：脚本启动前会显式比对 SOCK 不是生产路径。
#   私有实例只读屏幕帧（px），不抬窗、不取焦点、不响铃。
# 成本：私有实例预热 ~4s（CUDA/模型，与生产实例并存时会互相让显存，预热失败不致命）。
# 还原：trap 删掉副本、杀掉私有实例、清理临时 socket（生产服务全程未被触碰）。
#
# 用法: bash tools/ys-editor/tests/inject/daemon-resilience-neg.sh      rc=0 = 故障被正确抓住
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
SRC="tools/ys-editor/ys_lookd.py"
TMP_PY="tools/ys-editor/ys_lookd.__inject_tmp__.py"
PROD_SOCK="/run/user/$(id -u)/ys-lookd.sock"
SOCK="/tmp/ys-lookd-inject-$$.sock"
DLOG="$(mktemp)"; OUT="$(mktemp)"
DPID=""
cleanup() {
  [ -n "$DPID" ] && kill -9 "$DPID" 2>/dev/null
  rm -f "$TMP_PY" "$SOCK" "$DLOG" "$OUT"
}
trap cleanup EXIT

# 红线：本用例只许打私有 socket。生产路径写死在这里，比对不过就直接拒绝跑。
[ "$SOCK" = "$PROD_SOCK" ] && { echo "INJECT-BROKEN 私有 socket 与生产 socket 同路径，拒绝运行" >&2; exit 3; }

cp "$SRC" "$TMP_PY"
python3 - "$TMP_PY" <<'PY' || exit 3
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
old = '''        try:
            c.sendall((json.dumps(resp) + "\\n").encode())
        except (BrokenPipeError, ConnectionResetError) as e:
            print(f"[ys-lookd] 客户端提前断开，丢弃本次响应（{type(e).__name__}）", flush=True)
        except Exception as e:                              # noqa: BLE001 —— 任何回包失败都不许退出
            print(f"[ys-lookd] 回包失败但服务继续：{type(e).__name__}: {e}", flush=True)
'''
new = '''        try:
            c.sendall((json.dumps(resp) + "\\n").encode())   # INJECT：恢复事故形态（只剩 finally，无人接异常）
'''
if s.count(old) != 1:                       # 锚点必须全文唯一，否则可能打偏（假红比空转更浪费时间）
    print('INJECT-BROKEN 锚点不唯一或已失效（ys_lookd.py 回包兜底改动过？）', file=sys.stderr)
    sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new, 1))
PY

python3 -m py_compile "$TMP_PY" 2>"$DLOG" || {
  echo "INJECT-BROKEN 注入后的副本编译不过（注入写法有问题，不是门禁的问题）:" >&2; tail -3 "$DLOG" >&2; exit 3; }
rm -rf tools/ys-editor/__pycache__

# 起私有实例（不碰生产 socket）
YS_LOOKD_SOCK="$SOCK" DISPLAY="${DISPLAY:-:1}" python3 "$TMP_PY" >"$DLOG" 2>&1 &
DPID=$!
# 就绪判据 = **服务自己打印 "listening"**（不是 socket 文件、也不是自己去 ping）：
#   · bind 在预热之前 ⇒ socket 文件很早就有，拿它当就绪会让第一枪撞上门禁自己的 8s 探针超时
#     （实测踩过一次：变红的是「socket 存在但无应答」，与注入无关 = 假红）；
#   · 自己 ping 更糟：这一版是**故意无兜底**的，客户端一旦提前放弃（超时/close）就把
#     服务打死了 —— 探针会亲手制造它要检测的那个故障（实测踩过一次）。
#   serve() 在进 accept 循环之前会打印 `[ys-lookd] listening <sock>`，读它就是我们想要的那句话。
ready=0
for _ in $(seq 1 600); do                  # 最多等 60s（空闲预热 ~4s；机器忙时实测见过 6s+，留足余量）
  if ! kill -0 "$DPID" 2>/dev/null; then
    echo "INJECT-BROKEN 私有实例启动即退出，无法判断门禁（日志尾）:" >&2; tail -5 "$DLOG" >&2; exit 3
  fi
  grep -q 'listening' "$DLOG" 2>/dev/null && { ready=1; break; }
  sleep 0.1
done
[ "$ready" = 1 ] || { echo "INJECT-BROKEN 私有实例 60s 内没进 accept 循环（$SOCK）" >&2; tail -5 "$DLOG" >&2; exit 3; }

YS_LOOKD_SOCK="$SOCK" bash tools/ys-editor/tests/daemon-resilience.selftest.sh --only alive >"$OUT" 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then
  echo "INJECT-FAIL daemon-resilience-neg: 去掉回包兜底后门禁仍绿（门禁空转）"; tail -4 "$OUT"; exit 1
fi
if [ "$rc" -ne 1 ]; then                   # 2 = 环境未就绪；那说明变红不是注入造成的
  echo "INJECT-FAIL daemon-resilience-neg: rc=$rc（应为 1；2 = 私有实例没就绪，变红与注入无关）"; tail -6 "$OUT"; exit 1
fi
grep -q '✗ 服务退出了' "$OUT" || {
  echo "INJECT-FAIL daemon-resilience-neg: 变红但不是「服务退出了」那条（判据串了）："; tail -6 "$OUT"; exit 1; }
echo "  抓到: $(grep '✗ 服务退出了' "$OUT" | head -1)"
echo "INJECT-PASS daemon-resilience-neg: 删掉 sendall 的 except 兜底（恢复 10-18 事故形态）⇒「服务没被掀翻」报红（私有 socket，生产未动）"
exit 0
