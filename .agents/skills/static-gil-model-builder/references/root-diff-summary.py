#!/usr/bin/env python3
"""root-wire-diff.json 一键摘要（对比 compare-gil-root-wire.py 的原始输出）。

用法: python3 root-diff-summary.py <root-wire-diff.json> [--detail]

  输入是 compare-gil-root-wire.py 输出的 JSON 文件，不是 .gil 文件。
  完整管道：
    compare-gil-root-wire.py <源.gil> <候选.gil> | tee /tmp/root-diff.json | root-diff-summary.py /dev/stdin

输出 root 级别摘要：rootPresenceStable、每个 changedRootField 的
fieldNumber/beforeCount/afterCount/directChildDelta(added/removed)。
--detail 再打印 added/removed 记录的 sha256 前 16 位。

期望形态（候选验证门）：
- rootPresenceStable=True
- 变化仅出现在计划的 root 集合（如新建 prefab 闭包 = 4/6/8/27）
- 其余 root 的 fieldNumber 不在 changedRootFields 里
- directChildDelta addedCount/removedCount 与计划一致
（等角螺线 V4/V5 实测：prefab 步 root 4 +1 / 6 ±1 / 8 +1 / 27 +N；
 entity 步 root 5 +1 / 6 ±1 / 27 +N。root 6 的 ±1 是登记组记录重写，
 不要逐字节解释 root 6 内部。）

注意：管道解析 JSON 时禁止 2>&1（warning 走 stderr 会污染 stdout）。
"""
import json
import sys


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    detail = '--detail' in sys.argv[1:]
    if len(args) != 1:
        print(
            'usage: root-diff-summary.py <root-wire-diff.json> [--detail]\n'
            '\n'
            '  输入是 compare-gil-root-wire.py 的 JSON 输出，不是 .gil 文件。\n'
            '  用法示例：\n'
            '    compare-gil-root-wire.py src.gil cand.gil > /tmp/diff.json\n'
            '    root-diff-summary.py /tmp/diff.json\n'
            '  或一行管道：\n'
            '    compare-gil-root-wire.py src.gil cand.gil | root-diff-summary.py /dev/stdin\n',
            file=sys.stderr,
        )
        return 2
    d = json.load(open(args[0]))
    print('rootPresenceStable:', d.get('rootPresenceStable'))
    changed = d.get('changedRootFields', [])
    if isinstance(changed, dict):  # 防御：不同版本输出形态
        changed = changed.get('items', []) or []
    if not changed:
        print('changedRootFields: (empty — no per-field detail in this output)')
        return 0
    for item in changed:
        dd = item.get('directChildDelta') or {}
        line = (
            f"root {item.get('fieldNumber')}: "
            f"records {dd.get('beforeRecordCount', item.get('beforeCount'))} -> "
            f"{dd.get('afterRecordCount', item.get('afterCount'))} "
            f"(added {dd.get('addedCount', 0)}, removed {dd.get('removedCount', 0)})"
        )
        print(line)
        if detail:
            for rec in (dd.get('added') or [])[:5]:
                print(f"  + added sha {str(rec.get('rawSha256'))[:16]}...")
            for rec in (dd.get('removed') or [])[:5]:
                print(f"  - removed sha {str(rec.get('rawSha256'))[:16]}...")
    return 0


if __name__ == '__main__':
    sys.exit(main())
