#!/bin/bash
# no-dead-window-id.selftest.sh — 生产工具不许把已死窗 id 当默认/兜底值。
#
# 病根（2026-10-21 连踩三次）：游戏重启后窗口 id 会变（0x01400001 → 0x1800001 → 0x1600001），
# 任何把旧 id 写成默认值的工具，在没有显式传参时都会静默失败——
# 实测 `ys-act`/`ys-drag`/`ys-game-env.sh` 都留着 0x01400001，导致 ys-esc 的 ESC 发不出去。
# 判据：扫生产脚本/模块（排除 tests/ 与注释行），出现 0x01400001 / 0x1400001 即红。
set -u
cd "$(dirname "$0")/../../.." || exit 1
hits=$(python3 - <<'PY'
import glob, os, re
pat = re.compile(r'0x0?1400001', re.I)
bad = []
ALLOW = {'tools/ys-editor/ys-slot-check'}   # 纯使用示例/文档性脚本（里面是给用户看的命令行样例）
for f in glob.glob('tools/ys-editor/ys-*') + glob.glob('tools/ys-editor/*.py') + glob.glob('tools/ys-editor/*.sh'):
    if f in ALLOW:
        continue
    if '/tests/' in f or os.path.isdir(f):
        continue
    try:
        in_doc = False
        for i, line in enumerate(open(f, encoding='utf-8', errors='ignore'), 1):
            if line.count('"""') % 2 == 1:
                in_doc = not in_doc
                continue
            if in_doc:
                continue
            s = line.strip()
            if s.startswith('#'):
                continue
            if 'noqa: phantom-id' in line:
                continue          # 幽灵窗识别列表：是检测不是使用
            code = line.split('#', 1)[0]          # 行内注释之后不算代码
            if pat.search(code):
                bad.append(f"{f}:{i}: {s[:100]}")
    except OSError:
        pass
print('\n'.join(bad))
PY
)
if [ -n "$hits" ]; then
  echo "NO-DEAD-ID-RESULT hits=$(printf '%s\n' "$hits" | wc -l) verdict=FAIL"
  printf '%s\n' "$hits" | head -10
  echo "→ 改成按 class 动态解析：python3 -c 'import sys;sys.path.insert(0,\"tools/ys-editor\");import ys_look;print(ys_look.WIN)'"
  exit 1
fi
echo "NO-DEAD-ID-RESULT hits=0 verdict=PASS"
