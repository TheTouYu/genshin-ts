#!/usr/bin/env python3
"""codec-selftest.py — 票 19 变量映射编码协议可逆性自检（19-codec-protocol.md §6）

A 路（技能变量组，float 直存）：float32 pack→unpack 往返必须 bitwise 幂等。
C 路（降级定点打包）：×100 定点→int→解码，误差必须 ≤0.005（半分辨率）。
边界样例：值域端点 + 票 14/18 实测 float 样例。全过=exit 0，任一失败=exit 1。
"""
import struct
import sys

FAIL = []


def f32(x):
    return struct.unpack('f', struct.pack('f', x))[0]


def check_a(name, v):
    """A 路：float32 往返幂等"""
    r = f32(f32(v))
    if r != f32(v):
        FAIL.append(f'A路幂等失败 {name}: {v} -> {r}')


def check_c(name, v):
    """C 路：×100 定点往返误差 ≤0.005"""
    packed = int(round(f32(v) * 100))
    decoded = packed / 100.0
    if abs(decoded - v) > 0.005:
        FAIL.append(f'C路误差超界 {name}: {v} -> {decoded} (err={abs(decoded-v):.6f})')


def check_c_roundtrip_print(name, v):
    """C 路 int 表示可打印往返（str(int)->int 无损）"""
    i = int(round(v * 100))
    if int(str(i)) != i:
        FAIL.append(f'C路int打印往返失败 {name}: {i}')


# 值域端点（19-codec-protocol.md §1 物理依据）
a_samples = {
    'tick-0': 0.0,
    'tick-54k(1h@15/s)': 54000.0,
    'tick-2^24-1': float(2**24 - 1),
    'pos-x-门线+52.5': 52.5,
    'pos-x-门线-52.5': -52.5,
    'pos-y-弹高30': 30.0,
    'pos-z-34': 34.0,
    'vel-max50': 50.0,
    'vel-24.51': 24.51,
    'spin-10': 10.0,
    'state-5': 5.0,
    # 票 14/18 实测 float 样例（0.12/0.06 的引擎显示形态）
    '实测样例-0.12': 0.11999999731779099,
    '实测样例-0.06': 0.05999999865889549,
    '实测样例-2sin': 1.995,
}
for name, v in a_samples.items():
    check_a(name, v)

c_samples = {
    'pos-52.5': 52.5,
    'pos-1.37553(实测)': -1.37553,
    'pos-0.005(最坏半步)': 0.005,
    'vel-24.51': 24.51,
    'pos-0.11999…': 0.11999999731779099,
}
for name, v in c_samples.items():
    check_c(name, v)
    check_c_roundtrip_print(name, v)

# tick+state 位段装配（C 路：24b tick + 3b state）
for tick, state in [(0, 0), (54000, 5), (2**24 - 1, 5), (12345, 3)]:
    packed = (tick << 3) | state
    if (packed >> 3) != tick or (packed & 7) != state:
        FAIL.append(f'位段装配失败 tick={tick} state={state}')

total = len(a_samples) + 2 * len(c_samples) + 4
if FAIL:
    print(f'FAIL ({len(FAIL)}/{total}):')
    for m in FAIL:
        print(' ', m)
    sys.exit(1)
print(f'ALL PASS ({total} checks) — A 路幂等 / C 路误差≤0.005 / 位段装配 全过')
