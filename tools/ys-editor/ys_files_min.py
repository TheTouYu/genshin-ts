#!/usr/bin/env python3
"""ys_files_min.py — 谓词辅助：目录内文件数 ≥ N 即成立（给 `ys-wait --files-min` 用）。

存在理由（2026-10-23 复盘 `.02` 独立模型执行）：它等远端 OCR 批处理完成时写了
四次固定等待（120/90/60 秒）共 360s——而"等目录里出现 N 个文件"
本来就是可判定的谓词。固定 sleep 的两种病它都犯了：早好了也等满、没好了也往下走。

用法: ys_files_min.py DIR N [GLOB]
退出码: 0=成立 1=未达
输出: `<现有个数>/<N>`（给 ys-wait 的状态变换序列用）
"""
import fnmatch
import os
import sys


def main(argv):
    if len(argv) < 3:
        print('用法: ys_files_min.py DIR N [GLOB]', file=sys.stderr)
        return 2
    d, n = argv[1], int(argv[2])
    pat = argv[3] if len(argv) > 3 else '*'
    if not os.path.isdir(d):
        print('0/%d（目录不存在）' % n)
        return 1
    cnt = sum(1 for f in os.listdir(d) if fnmatch.fnmatch(f, pat))
    print('%d/%d' % (cnt, n))
    return 0 if cnt >= n else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv))
