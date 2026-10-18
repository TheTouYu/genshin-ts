#!/usr/bin/env python3
"""_lib.py — 本批真值 JSON 的构造小工具（不改共享工具）。

约定（与 truth/_rules.md + prelabel.py 一致）：
  · bbox 用 xywh；OCR 的 text[].bbox 是 xyxy —— 换算时别混。
  · kind 只取 prelabel.KINDS：panel/row/tile/card/button/icon/avatar/chip/unknown。
  · image 写**相对仓库根**的路径（prelabel render 会 join(ROOT, image)）。
"""
import json
import os

ROOT = '/home/h/genshin-ts'
OUTDIR = os.path.join(ROOT, '.scratch/gui-corpus/truth-v8-game')


def o(oid, bbox, kind, text=None, clickable='no', parent=None, note=None,
      clipped=None, badges=None):
    d = {'id': str(oid), 'parent': parent, 'bbox': [int(v) for v in bbox], 'kind': kind,
         'text': list(text or []), 'clickable': clickable,
         'state': {'selected': False, 'focused': False, 'disabled': False},
         'badges': list(badges or []),
         'clipped': clipped or {'edges': [], 'cut_by': None, 'px': 0}}
    if note:
        d['note'] = note
    return d


def clipped(edges, cut_by='screen', px=0):
    return {'edges': list(edges), 'cut_by': cut_by, 'px': int(px)}


def write(doc_meta, objects, stem):
    doc = dict(doc_meta)
    doc['frame'] = stem
    doc['image'] = '.scratch/gui-corpus/truth-v8-game/%s.png' % stem
    doc['size'] = [2560, 1440]
    doc['units'] = len(objects)
    doc['objects'] = objects
    path = os.path.join(OUTDIR, stem + '.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print('WROTE %s units=%d' % (path, len(objects)))
    return path
