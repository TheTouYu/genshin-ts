"""本体态判据标定：只用**空间+文本**特征，且必须在全部回归帧上零误报。

设计原则（照 ys-state 既有约定）：
  · 判据不是"某点是什么颜色"，而是"这块区域里有什么结构"——本体 HUD 的位置是全屏固定的
  · 每态 ≥2 条判据；负样本优先（先在"不该判成它"的帧上做到 0）
"""
import os, json, subprocess, sys
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
VENV = os.path.join(REPO, '.scratch/gui-grounding/venv-rapidocr/bin/python')
OCR = os.path.join(REPO, 'tools/ys-editor/ys_ocr.py')
REG = os.path.join(REPO, 'tools/ys-editor/calib/regress')

def ocr(path):
    r = subprocess.run([VENV, OCR, 'ocr', '--json', path], capture_output=True, text=True)
    if r.returncode != 0: return None
    return json.loads(r.stdout).get('boxes') or []

def box_center(b):
    xs=[p[0] for p in b['box']]; ys=[p[1] for p in b['box']]
    return (sum(xs)/4, sum(ys)/4)

def has_text(boxes, sub, region=None):
    """region=(x0,y0,x1,y1) 限定位置：本体 HUD 的位置固定，位置本身就是判据的一部分"""
    for b in boxes:
        if sub not in (b.get('text') or ''): continue
        if region is None: return True
        x,y = box_center(b)
        x0,y0,x1,y1 = region
        if x0<=x<=x1 and y0<=y<=y1: return True
    return False

# ── 判据（本体 2560×1440，实测坐标来自 2026-10-17 用户真机帧）──────────────
def crit_world(boxes):
    """提瓦特世界：右下 UID 行 + 底部队伍血条数值 + 无派蒙菜单左面板"""
    c = []
    c.append(('uid_right_bottom', has_text(boxes, 'UID:', (2200,1380,2560,1440))))
    # 血条数值形如 20164/20164 —— 用「/」+数字 的位置判
    c.append(('hp_bottom', any('/' in (b.get('text') or '') and 1150<=box_center(b)[0]<=1400
                               and 1320<=box_center(b)[1]<=1380 for b in boxes)))
    c.append(('no_paimon_panel', not has_text(boxes, '冒险等阶', (0,0,1000,700))))
    return c

def crit_paimon(boxes):
    """派蒙菜单：左侧面板的「冒险等阶/世界等级」固定文案 + 右上头像区"""
    c = []
    c.append(('rank_label', has_text(boxes, '冒险等阶', (0,0,1000,700))))
    c.append(('world_level', has_text(boxes, '世界等级', (0,0,1000,800))))
    c.append(('uid_in_panel', has_text(boxes, 'UID', (0,240,1000,330))))
    return c

def evaluate(name, boxes):
    w = crit_world(boxes); p = crit_paimon(boxes)
    nw = sum(1 for _,v in w if v); np_ = sum(1 for _,v in p if v)
    st = 'GAME_WORLD' if nw==len(w) else ('GAME_PAIMON' if np_==len(p) else '')
    return st, nw, len(w), np_, len(p)

def main():
    rows=[]
    for l in open(os.path.join(REG,'manifest.tsv'),encoding='utf-8').read().split('\n'):
        if not l.strip() or l.startswith('#'): continue
        p=l.split('\t'); rows.append((p[0],p[1]))
    # 本体帧就在回归集里（作 UNKNOWN 负样本），main 的上列表已覆盖，这里不再重复列。
    native=[]
    bad=0
    print('%-30s %-10s %-12s %-9s %-9s' % ('frame','expect','判为','world','paimon'))
    for fp, expect in [(os.path.join(REG,n),e) for n,e in rows] + native:
        if not os.path.exists(fp): continue
        im=Image.open(fp)
        if im.size!=(2560,1440):
            print('%-30s %-10s %-12s %-9s %-9s' % (os.path.basename(fp),expect,'(几何不符)','-','-')); continue
        boxes = ocr(fp) or []
        st,nw,tw,np_,tp = evaluate(os.path.basename(fp), boxes)
        verdict = st or '(不判本体)'
        # 两帧本体负样本：对**既有 8 态**它们必须 UNKNOWN（已在 ys-state 回归里验），
        # 但对**本体判据**它们必须判成 GAME_*——两者都要成立，所以这里单独给期望
        is_native_frame = os.path.basename(fp).startswith('neg-native-')
        if is_native_frame:
            want = 'GAME_WORLD' if 'world' in fp else 'GAME_PAIMON'
            ok = (verdict == want)
            print('%-30s %-10s %-12s %-9s %-9s %s' % (os.path.basename(fp), '本体帧',
                  verdict, '%d/%d'%(nw,tw), '%d/%d'%(np_,tp), '' if ok else '  <<< 本体判据失效'))
            if not ok: bad += 1
            continue
        ok = (verdict==expect) or (expect not in ('GAME_WORLD','GAME_PAIMON') and st=='')
        if not ok: bad+=1
        print('%-30s %-10s %-12s %-9s %-9s %s' % (os.path.basename(fp),expect,verdict,
              '%d/%d'%(nw,tw),'%d/%d'%(np_,tp), '' if ok else '  <<< 误判'))
    print('\n误判数 =', bad)

main()
