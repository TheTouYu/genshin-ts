#!/usr/bin/env python3
"""构建「滚动条真值集」：正样本 bbox + 负样本（含同 UI 不可滚动版本）。

产物：`.scratch/scrollbar/truth/{pos,neg}.json` + `truth/synth/*.png`（合成负样本）
复算：`python3 tools/ys-editor/tests/scrollbar.selftest.py`
判据实现唯一源 = `tools/ys-editor/ys_scrollbar.py`（本脚本不判，只造样本）。

口径
  正样本 = 人眼在裁剪图上看到「细长轨道 + 更亮/更实的滑块段」；bbox 记录轨道与滑块像素范围。
  负样本 = 整帧边缘与各面板边缘都没有可见滑块；含**同一 UI 去掉滚动条**的合成版本
           （真机账号 173 个好友，拿不到"好友很少、无滚动条"的真实帧，故把滚动条所在列
            用左右邻域均值抹平——内容一模一样、只少滚动条，正好是最难的假阳场景）。
  帧级 / 界面级：正样本来自 5 个界面（好友列表 / 邮件 / 游戏内设置 / 编辑器设置 / 编辑器树），
           报告时分开数，不把同界面连拍当独立证据。
"""
import json
import os
import subprocess

import numpy as np
from PIL import Image

ROOT = '/home/h/genshin-ts'
OUT = os.path.join(ROOT, '.scratch/scrollbar/truth')
SYNTH = os.path.join(OUT, 'synth')

POS = [
    ('.scratch/gui-service/evidence/friends-run-20261021-1555/friends0.png',
     [2403, 144, 2408, 1268], [2403, 157, 2408, 221],
     '好友列表顶部；6px 暗槽 + 超亮滑块；OCR 顶部好友=热九（我的好友 173/200）', '亲眼看裁图'),
    ('.scratch/gui-service/evidence/friends-run-20261021-1555/now.png',
     [2403, 144, 2408, 1268], [2403, 196, 2408, 260],
     '同一会话再滚一屏；OCR 顶部好友=花花', '同族抽样核对'),
    ('.scratch/gui-service/evidence/realrun-20261021/boundary.png',
     [2403, 144, 2408, 1268], [2403, 700, 2408, 765],
     '好友列表中段（30 天分界所在屏）；滑块为六边形，比轨道宽 1–2px', '亲眼看裁图'),
    ('.scratch/gui-service/evidence/friends-run-native/act1_friends/after.png',
     [2404, 144, 2408, 1268], [2404, 156, 2408, 222],
     '好友列表（另一会话）', '同族抽样核对'),
    ('.scratch/gui-service/evidence/act-live-pos/before.png',
     [1715, 151, 1720, 1263], [1715, 163, 1720, 332],
     '好友列表（窗口较窄，轨道在 x=1715）', '同族抽样核对'),
    ('.scratch/gui-service/evidence/act-live-pos/after.png',
     [1715, 151, 1720, 1263], [1715, 175, 1720, 345], '同上，滚动后', '同族抽样核对'),
    ('.scratch/gui-service/evidence/act-live-neg/before.png',
     [1715, 151, 1720, 1263], [1715, 175, 1720, 345], '同上', '同族抽样核对'),
    ('.scratch/gui-service/evidence/act-live-neg/after.png',
     [1715, 151, 1720, 1263], [1715, 188, 1720, 357], '同上', '同族抽样核对'),
    ('.scratch/gui-corpus/capture-2026-10-18/194915.png',
     [2403, 144, 2408, 1268], [2403, 157, 2408, 221],
     '好友列表（10-18 抓帧），与 friends0 同族', '同族抽样核对'),
    ('.scratch/gui-corpus/capture-2026-10-18/195029.png',
     [2403, 144, 2408, 1268], [2403, 157, 2408, 329],
     '好友列表，滑块更长（该屏条目更多）', '同族抽样核对'),
    ('.scratch/gui-corpus/capture-2026-10-18/195258.png',
     [1264, 291, 1269, 1340], [1264, 304, 1269, 346],
     '邮件列表（邮件珍藏 339/100），轨道在面板内侧 x≈1264', '亲眼看裁图'),
    ('.scratch/gui-corpus/capture-2026-10-18/195235.png',
     [1271, 151, 1276, 1288], [1271, 163, 1276, 655],
     '邮件列表（同族，滑块更长）', '同族抽样核对'),
    ('.scratch/gui-corpus/capture-2026-10-18/195158.png',
     [2426, 259, 2431, 1275], [2426, 272, 2431, 520],
     '游戏内「基础设置」列表，滑块靠上（ratio 0.017）', '亲眼看裁图'),
    ('.scratch/gui-corpus/capture-2026-10-18/195206.png',
     [2426, 259, 2431, 1275], [2426, 717, 2431, 965],
     '同一界面滑块在中段（ratio 0.596）——位置比对照用', '亲眼看裁图'),
    ('.scratch/gui-corpus/f10.png',
     [2425, 164, 2431, 1372], [2425, 176, 2431, 848],
     '编辑器设置·图像页：10–12px 亮滑块 + 暗槽', '亲眼看裁图'),
    ('.scratch/gui-corpus/f11.png',
     [2423, 164, 2433, 1362], [2423, 687, 2433, 1357],
     '同页滚到底：同一轨道、滑块位移（ratio 0.98）', '亲眼看裁图'),
    ('.scratch/gui-corpus/capture-2026-10-18/195634.png',
     [269, 206, 275, 1404], [269, 381, 275, 1305],
     '编辑器左树面板滚动条（面板内侧，不在帧边缘）', '亲眼看裁图'),
]

NEG = [
    ('.scratch/gui-corpus/f00.png', '游戏内菜单（派蒙），只有 W/S 提示，无滚动条'),
    ('.scratch/gui-corpus/f01.png', '同族菜单'),
    ('.scratch/gui-corpus/f02.png', '同族菜单（左列表可滚但界面不显示滚动条）'),
    ('.scratch/gui-corpus/f03.png', '同族菜单'),
    ('.scratch/gui-corpus/f04.png', '同族菜单'),
    ('.scratch/gui-corpus/f05.png', '同族菜单'),
    ('.scratch/gui-corpus/f06.png', '派蒙菜单顶部（左下 ▲▼ 是滚动提示块，不是滚动条）'),
    ('.scratch/gui-corpus/f07.png', '派蒙菜单滚动后（▲▼ 仍在，仍无滚动条）'),
    ('.scratch/gui-corpus/f08.png', '千星奇域区（右边一列圆钮，无滚动条）'),
    ('.scratch/gui-corpus/f09.png', '同族'),
    ('.scratch/gui-corpus/f12.png', '同族'),
    ('.scratch/gui-corpus/f13.png', '同族'),
    ('.scratch/gui-corpus/neg-world.png', '世界 HUD 负样本'),
    ('.scratch/gui-service/evidence/live-atop.png', '浏览器窗口世界帧，无滚动条'),
    ('.scratch/gui-service/evidence/act-expect-neg/before.png', '玩法画面（草地/水面），无 UI 列表'),
    ('.scratch/gui-service/evidence/act-lease-fail/before.png', '玩法画面，无 UI 列表'),
    ('.scratch/gui-service/evidence/act-inject-fail/before.png', '玩法画面，无 UI 列表'),
]

SYNTH_SPEC = [
    ('.scratch/gui-service/evidence/friends-run-20261021-1555/friends0.png', 'friends0_nobar.png', (2400, 2412)),
    ('.scratch/gui-service/evidence/realrun-20261021/boundary.png', 'boundary_nobar.png', (2400, 2412)),
    ('.scratch/gui-service/evidence/friends-run-20261021-1555/now.png', 'now_nobar.png', (2400, 2412)),
]


def synth(src_rel, dst_name, span):
    os.makedirs(SYNTH, exist_ok=True)
    im = np.array(Image.open(os.path.join(ROOT, src_rel)).convert('RGB'))
    x0, x1 = span
    left = im[:, x0 - 12:x0 - 1].mean(axis=1, keepdims=True)
    right = im[:, x1:x1 + 11].mean(axis=1, keepdims=True)
    im[:, x0:x1] = ((left + right) / 2.0).astype(np.uint8)
    dst = os.path.join(SYNTH, dst_name)
    Image.fromarray(im).save(dst)
    return os.path.relpath(dst, ROOT)


def tracked(rel):
    r = subprocess.run(['git', 'ls-files', '--error-unmatch', rel], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return r.returncode == 0


def main():
    os.makedirs(OUT, exist_ok=True)
    pos = []
    for rel, tb, hb, note, ver in POS:
        assert os.path.exists(os.path.join(ROOT, rel)), rel
        pos.append({'path': rel, 'track_bbox': tb, 'thumb_bbox': hb, 'orientation': 'v',
                    'note': note, 'verified_by': ver, 'tracked': tracked(rel)})
    neg = []
    for rel, note in NEG:
        assert os.path.exists(os.path.join(ROOT, rel)), rel
        neg.append({'path': rel, 'note': note, 'tracked': tracked(rel),
                    'verified_by': '人眼边缘条带拼图核对（无滑块）'})
    for rel, name, span in SYNTH_SPEC:
        dst = synth(rel, name, span)
        neg.append({'path': dst, 'tracked': False,
                    'synth_from': rel, 'synth_span': list(span),
                    'note': '【合成】同 UI 去掉滚动条：%s 的 x=%d..%d 用左右邻域均值填充'
                            % (rel, span[0], span[1]),
                    'verified_by': '构造保证（填充后该列既无轨道也无滑块）'})
    json.dump({'frames': pos}, open(os.path.join(OUT, 'pos.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump({'frames': neg}, open(os.path.join(OUT, 'neg.json'), 'w'), ensure_ascii=False, indent=1)
    print('pos=%d neg=%d -> %s' % (len(pos), len(neg), OUT))


if __name__ == '__main__':
    main()
