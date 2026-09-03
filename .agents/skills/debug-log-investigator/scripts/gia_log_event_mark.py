#!/usr/bin/env python3
# 客户端帧流逐记录标记：rec -> 事件集（cast 恒真/P/T/echo/tear/nan）
import sys

cur = None
flags = {}
out = {}


def emit():
    if cur is not None:
        out[cur] = flags


for line in sys.stdin:
    line = line.rstrip('\n')
    if line.startswith('=== rec'):
        emit()
        cur = int(line.split('rec')[1].split(':')[0])
        flags = {'cast': True, 'P': False, 'T': False, 'echo': False,
                 'tearE': False, 'nan': False, 'P_nan': False, 'P_none': False}
        continue
    if cur is None:
        continue
    if 'IN0:String=P' in line:
        flags['P'] = True
        if 'nan' in line:
            flags['P_nan'] = True
        if 'None=?' in line:
            flags['P_none'] = True
    if 'IN0:String=T' in line:
        flags['T'] = True
    if 'IN0:String=ok' in line or 'IN0:String=e5' in line:
        flags['echo'] = True
    if 'tearE' in line:
        flags['tearE'] = True
    if 'nan' in line:
        flags['nan'] = True
emit()

for rec in sorted(out):
    f = out[rec]
    print(rec, int(f['P']), int(f['T']), int(f['echo']), int(f['tearE']),
          int(f['nan']), int(f['P_nan']), int(f['P_none']))
