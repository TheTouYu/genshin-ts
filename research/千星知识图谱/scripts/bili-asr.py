#!/usr/bin/env python3
"""T12 补源 ASR —— faster-whisper large-v3-turbo + CUDA

为什么必须传 initial_prompt：bilibili-learn 技能实测记载「无 prompt → Python 被识别成『拍損』×5」。
千星领域的术语误识别是系统性的，不给术语表则语料不可用。

跑法（LD_LIBRARY_PATH 必须在进程启动前设好，进程内改无效）：
  NV=$(ls -d .scratch/uv-cache/archive-v0/*/lib/python3.12/site-packages/nvidia/*/lib | tr '\\n' ':')
  LD_LIBRARY_PATH="${NV}/usr/lib/wsl/lib" python3 .scratch/t12-asr/transcribe.py
"""
import os
import sys
from pathlib import Path

SRC = Path('/home/h/genshin-ts/.scratch/t12-asr')
OUT = Path('/home/h/genshin-ts/research/千星知识图谱/learn')

# 领域术语表：把千星领域的正确写法喂给模型，抑制同音误识别
PROMPT = (
    '以下是原神千星奇域（UGC 编辑器/千星沙箱）的教学内容，术语包括：'
    '千星奇域、千星沙箱、节点图、白盒物件、局内存藏、本地过滤器、布尔过滤器、'
    '选项卡、悬浮交互页、实体、元件、预制、负载、定时器、信号、结构体、字典、列表、'
    '节点图变量、自定义变量、局部变量、奇想等级、奇匠中心、活跃指数、游玩时长、'
    '引导、横幅引导、场景搭建、地形编辑、元件库、实体摆放、战斗预设、运动器、'
    '碰撞触发器、伤害、生命值、攻击力、结算、副本、地图、创作者、热度、推荐。'
)

BV_TITLE = {
    'BV1r2fDBFEqJ': '做千星奇域不能错过的引导神器分享：信号驱动的横幅引导',
    'BV1Yx8Y6bE7K': '千星奇域奇匠中心使用（活跃指数和游玩时长分析）',
    'BV1amsGzKETY': '【千星奇域UGC入门教程】第1期：初识编辑器与场景搭建',
    'BV19nyZBFE7G': '原神千星奇域恶性bug，创作者千万不要手贱填满一整片地形',
}


def ts(sec: float) -> str:
    s = int(sec)
    return f'{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}'


def to_md(segs, window: float = 45.0) -> str:
    out, buf, t0 = [], [], None
    for seg in segs:
        if t0 is None:
            t0 = seg.start
        buf.append(seg.text.strip())
        if seg.end - t0 >= window:
            out.append(f'[{ts(t0)}] ' + ''.join(buf))
            buf, t0 = [], None
    if buf:
        out.append(f'[{ts(t0)}] ' + ''.join(buf))
    return '\n\n'.join(out)


def main() -> int:
    from faster_whisper import WhisperModel

    print('CUDA 设备数:', end=' ')
    try:
        import ctranslate2
        print(ctranslate2.get_cuda_device_count())
    except Exception as e:
        print('未知', e)

    model = WhisperModel('large-v3-turbo', device='cuda', compute_type='float16')
    total = 0
    for mp3 in sorted(SRC.glob('*.mp3')):
        bv = mp3.stem
        title = BV_TITLE.get(bv, bv)
        print(f'\n=== {bv} {title} ===')
        segs, info = model.transcribe(
            str(mp3), language='zh', initial_prompt=PROMPT,
            vad_filter=True, beam_size=5
        )
        segs = list(segs)  # 惰性 → 落地
        chars = sum(len(s.text) for s in segs)
        total += chars
        print(f'  段数 {len(segs)} / 字数 {chars} / 检测语言 {info.language} p={info.language_probability:.2f}')
        d = OUT / bv
        d.mkdir(parents=True, exist_ok=True)
        head = (f'# P1 · {title}\n\n'
                f'> **ASR 转写**（faster-whisper large-v3-turbo，含千星领域 initial_prompt）\n'
                f'> 该源无官方字幕轨，本文件为本地转写，术语可能仍有误识别，引用前请对照上下文。\n\n')
        body = head + f'时长 {int(info.duration)}s ｜ 段数 {len(segs)} ｜ 字数 {chars}\n\n' + to_md(segs)
        (d / f'P1-{title[:40]}.md').write_text(body, encoding='utf-8')
        (d / 'ALL.md').write_text(f'# {title}\n\n{bv} ｜ ASR 转写\n\n---\n\n' + to_md(segs), encoding='utf-8')
        print(f'  → {d}/ALL.md')
    print(f'\n✓ 合计 {total} 字')
    return 0


if __name__ == '__main__':
    sys.exit(main())
