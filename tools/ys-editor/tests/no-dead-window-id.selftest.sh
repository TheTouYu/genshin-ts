#!/bin/bash
# no-dead-window-id.selftest.sh — 生产工具不许硬编码「会死的窗口 id」。
#
# 唯一实现：`ys_win.py`（python: `import ys_win; ys_win.resolve()`；bash: `"$(ys-win-id)"`）。
#
# 病根（2026-10-21 连踩三次）：游戏重启/换会话后窗口 id 会变（0x01400001 → 0x1800001 →
# 0x1200001 → 0x04000008），任何把某个 id 写成默认值/兜底的工具，在没有显式传参时都会
# 静默失败——实测 `ys-act`/`ys-drag`/`ys-game-env.sh` 都留着 0x01400001，ys-esc 的 ESC 发不出去。
#
# 判据（严格，无文件级豁免）：代码里出现 7-8 位十六进制窗口 id 字面量（0x0?[0-9a-f]{6,7}）即红。
#   不算：注释、docstring、行内 `# noqa: phantom-id`（幽灵窗识别/离线自测夹具，逐行声明）、
#   二进制/编译产物、`.c/.h`、`*.bak-*` 备份、`tests/`。
#
# 退出码：0 PASS / 1 有硬编码 id
set -u
cd "$(dirname "$0")/../../.." || exit 1
hits=$(python3 - <<'PY'
import glob, os, re
pat = re.compile(r'0x0?[0-9a-f]{6,7}\b', re.I)
files = (glob.glob('tools/ys-editor/ys-*') + glob.glob('tools/ys-editor/*.py')
         + glob.glob('tools/ys-editor/*.sh'))
bad = []
for f in files:
    if '/tests/' in f or os.path.isdir(f) or f.endswith(('.c', '.h', '.o', '.so')):
        continue
    if '.bak' in os.path.basename(f):
        continue
    try:
        raw = open(f, 'rb').read()
    except OSError:
        continue
    if b'\x00' in raw[:4096]:                 # 编译产物/二进制不扫
        continue
    in_doc = False
    for i, line in enumerate(raw.decode('utf-8', 'ignore').splitlines(), 1):
        if line.count('"""') % 2 == 1:
            in_doc = not in_doc
            continue
        if in_doc:
            continue
        s = line.strip()
        if s.startswith('#'):
            continue
        if 'noqa: phantom-id' in line:
            continue                          # 幽灵窗识别 / 自测夹具：逐行声明，不是使用
        code = line.split('#', 1)[0]
        if pat.search(code):
            bad.append("%s:%d: %s" % (f, i, s[:100]))
print('\n'.join(bad))
PY
)
if [ -n "$hits" ]; then
  echo "NO-DEAD-ID-RESULT hits=$(printf '%s\n' "$hits" | wc -l) verdict=FAIL"
  printf '%s\n' "$hits" | head -10
  echo "→ 统一走唯一入口：python: import ys_win → ys_win.resolve()/resolve_editor()；bash: \"\$(ys-win-id)\""
  exit 1
fi
echo "NO-DEAD-ID-RESULT hits=0 verdict=PASS"
