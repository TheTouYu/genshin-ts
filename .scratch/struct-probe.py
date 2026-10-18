"""结构提取 v2：OCR 框 → 面板聚类 → 行聚类 → 条目。产出的就是"这个界面有哪些区、每区有哪些条目"。"""
import sys, time, json
import numpy as np
from PIL import Image

def panels_and_rows(boxes, W, H):
    """按 x 间隙切面板，按 y 邻近合并成行。"""
    if not boxes: return []
    bs = sorted(boxes, key=lambda b: b['cx'])
    # 面板：x 间隙 > 260px 视为分栏
    groups, cur, last_x = [], [], None
    for b in bs:
        if last_x is not None and b['cx'] - last_x > 260:
            groups.append(cur); cur = []
        cur.append(b); last_x = b['cx']
    if cur: groups.append(cur)

    out = []
    for gp in groups:
        ys = sorted(((b['cy'], i, b) for i, b in enumerate(gp)), key=lambda t: t[0])
        rows, cur_row = [], [ys[0][2]]
        for (y, _i, b) in ys[1:]:
            if y - cur_row[-1]['cy'] <= 42:     # 同一行（行高约 40-60px）
                cur_row.append(b)
            else:
                rows.append(cur_row); cur_row = [b]
        rows.append(cur_row)
        xs = [b['cx'] for b in gp]; ys2 = [b['cy'] for b in gp]
        out.append({'bbox': [min(xs), min(ys2), max(xs), max(ys2)],
                    'n_items': len(gp), 'n_rows': len(rows),
                    'rows': [{'y': int(np.mean([b['cy'] for b in r])),
                              'texts': [b['text'] for b in r]} for r in rows][:12]})
    # 只保留"至少 2 行的区"（单行多半是 HUD/标题噪声）
    return [p for p in out if p['n_rows'] >= 2]

path = sys.argv[1]
t0 = time.time()
im = Image.open(path); W, H = im.size
t_load = time.time()
import subprocess, socket, os
SOCK='/run/user/%d/ys-lookd.sock'%os.getuid()
def daemon_ocr(path):
    c=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM); c.settimeout(120)
    c.connect(SOCK); c.sendall((json.dumps({'cmd':'ocr','frame':os.path.abspath(path)})+'\n').encode())
    d=b''
    while not d.endswith(b'\n'):
        ch=c.recv(65536)
        if not ch: break
        d+=ch
    c.close(); r=json.loads(d.decode())
    if r.get('error'): raise RuntimeError(r['error'])
    return r['boxes']
try:
    boxes = daemon_ocr(path)
except Exception:
    r = subprocess.run(['python3','tools/ys-editor/ys_ocr.py','ocr',path,'--json'],
                       capture_output=True, text=True)
    boxes = json.loads(r.stdout)['boxes']
t_ocr = time.time()
P = panels_and_rows(boxes, W, H)
t_end = time.time()
print('== %s  %dx%d' % (path.split('/')[-1], W, H))
print('   解码 %dms | OCR %dms | 聚类 %dms | 合计 %dms'
      % ((t_load-t0)*1000, (t_ocr-t_load)*1000, (t_end-t_ocr)*1000, (t_end-t0)*1000))
print('   识别到 %d 个面板（含>=2行）' % len(P))
for i,p in enumerate(P):
    print('   面板%d bbox=%s 行数=%d' % (i, p['bbox'], p['n_rows']))
    for row in p['rows'][:8]:
        print('        y=%4d  %s' % (row['y'], ' | '.join(row['texts'])[:70]))
