#!/usr/bin/env python3
"""按值文本中心覆盖 setting 行（一次一屏，跑前先确认还在目标面板）"""
import json, os, subprocess, sys, time
REPO='/home/h/genshin-ts'; HERE=REPO+'/tools/ys-editor'
OPS=HERE+'/ys-ops'; RC=HERE+'/ys-rowclass'
ENV={**os.environ,'DISPLAY':os.environ.get('DISPLAY',':1')}
# 窗口 id 每次重开游戏都会变：向 ys-win-id 要（解析不到才回退）
WIN=subprocess.run([HERE+'/ys-win-id'],capture_output=True,text=True,timeout=20).stdout.strip() or '0x1800001'
def grab(p):
    r=subprocess.run(['import','-window',WIN,p],env=ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=25)
    return p if r.returncode==0 and os.path.getsize(p)>4096 else None
def rdiff(a,b,box):
    from PIL import Image, ImageChops
    x,y,w,h=[int(v) for v in box]
    ia=Image.open(a).convert('L').crop((x,y,x+w,y+h)); ib=Image.open(b).convert('L').crop((x,y,x+w,y+h))
    px=list(ImageChops.difference(ia,ib).getdata())
    return round(sum(1 for v in px if v>8)/max(len(px),1),4)

# 1) 跑分类器拿这一屏的行（同时确认还在目标面板）
subprocess.run([sys.executable,RC,'--path','关卡设置 > 基础','--json','/tmp/rc3.json'],env=ENV,capture_output=True,timeout=300)
rows=json.load(open('/tmp/rc3.json'))
if not any('关卡设置' in (r.get('text') or '') for r in rows):
    print('NOT_ON_PANEL'); sys.exit(2)
covered=0
for r in rows:
    if r['class']!='setting' or not r.get('value_at'): continue
    x,y=r['value_at']
    if not (200<x<2400 and 300<r['cy']<1100): continue
    b=grab('/tmp/cf-b.png')
    if not b: continue
    subprocess.run([HERE+'/ys-pointer-click',str(x),str(y)],env=ENV,capture_output=True,timeout=60)
    time.sleep(1.3)
    a=grab('/tmp/cf-a.png')
    if not a: continue
    # 证据区要**向下扩展**：下拉/时间选择器展开的列表在行下方，只比那一条 56px 高的带会读到 0
    # （实测：下拉在行右侧区域 diff=0.2532，但在行条带内 diff=0.0）。高度 +400 覆盖展开物。
    # 两个证据区取**最大**：行条带对小控件（勾选框/图标）敏感，向下扩展区对下拉/时间选择器敏感。
    # 只用一个会顾此失彼（实测：整条带内下拉 diff=0，只扩展区时小控件 diff 被稀释到 0.002）。
    vr=list(r['value_region'])
    d_row=rdiff(b,a,vr)
    vr2=list(vr); vr2[3]=vr2[3]+400
    d_ext=rdiff(b,a,vr2)
    d=max(d_row,d_ext)
    st='covered' if d>=0.01 else 'failed'
    subprocess.run([OPS,'add','--id','SET-'+r['text'][:12],'--path','关卡设置 > 基础',
                    '--control',r['text'],'--action','observe','--risk','B','--min-diff','0.01',
                    '--frames-before','/tmp/cf-b.png','--frames-after','/tmp/cf-a.png',
                    '--note',f'value_diff={d} box={tuple(vr)} click={x},{y} val={r.get("value_text")}'],
                   env=ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=120)
    print(f'{st:8s} {r["text"][:20]:22s} click={x},{y} value_diff={d}')
    covered += (st=='covered')
print('COVERED_IN_THIS_RUN=',covered)
