#!/usr/bin/env python3
"""match5.py — 预测 vs 修正后真值：FP / FN / 错类 / 重复 / 越界 / 尺度偏差，供 README 错误画像。"""
import json, os, collections
GC='/home/h/genshin-ts/.scratch/gui-corpus'
STEMS=['r004_snap_2026-10-19_00-20-33','r007_snap_2026-10-19_00-22-25','r009_snap_2026-10-19_00-23-32',
       'r023_snap_2026-10-19_00-25-15','r024_snap_2026-10-19_00-25-30']
def xyxy(b): return (b[0],b[1],b[0]+b[2],b[1]+b[3])
def iou(a,b):
    ax0,ay0,ax1,ay1=a; bx0,by0,bx1,by1=b
    ix0,iy0=max(ax0,bx0),max(ay0,by0); ix1,iy1=min(ax1,bx1),min(ay1,by1)
    if ix1<=ix0 or iy1<=iy0: return 0.0
    inter=(ix1-ix0)*(iy1-iy0)
    ua=(ax1-ax0)*(ay1-ay0)+(bx1-bx0)*(by1-by0)-inter
    return inter/ua if ua>0 else 0.0
tot=collections.Counter(); rows=[]
conf=collections.Counter(); fp_cls=collections.Counter(); fn_cls=collections.Counter()
for st in STEMS:
    pr=json.load(open(os.path.join(GC,'truth-v9-pred',st+'.json')))['objects']
    gt=json.load(open(os.path.join(GC,'truth-v9-fixed',st+'.json')))['objects']
    used=set(); match=[]
    cand=sorted(((iou(xyxy(p['bbox']),xyxy(g['bbox'])),i,j) for i,p in enumerate(pr) for j,g in enumerate(gt)),reverse=True)
    taken_p=set(); taken_g=set()
    for v,i,j in cand:
        if v<0.5 or i in taken_p or j in taken_g: continue
        taken_p.add(i); taken_g.add(j); match.append((i,j,v))
    fp=[p for i,p in enumerate(pr) if i not in taken_p]
    fn=[g for j,g in enumerate(gt) if j not in taken_g]
    # 重复：预测之间 IoU>=0.7 的对数（同一对象多框）
    dup=sum(1 for i in range(len(pr)) for j in range(i+1,len(pr)) if iou(xyxy(pr[i]['bbox']),xyxy(pr[j]['bbox']))>=0.7)
    oob=[p for p in pr if p['bbox'][0]<0 or p['bbox'][1]<0 or p['bbox'][0]+p['bbox'][2]>2560 or p['bbox'][1]+p['bbox'][3]>1440]
    for i,j,v in match: conf[(pr[i]['kind'],gt[j]['kind'])]+=1
    for p in fp: fp_cls[p['kind']]+=1
    for g in fn: fn_cls[g['kind']]+=1
    rows.append(dict(stem=st,pred=len(pr),gt=len(gt),tp=len(match),fp=len(fp),fn=len(fn),dup=dup,oob=len(oob),
                     prec=len(match)/max(1,len(pr)),rec=len(match)/max(1,len(gt))))
    tot['pred']+=len(pr); tot['gt']+=len(gt); tot['tp']+=len(match); tot['fp']+=len(fp); tot['fn']+=len(fn); tot['dup']+=dup; tot['oob']+=len(oob)
print('%-34s %4s %4s %4s %4s %4s %4s %4s %6s %6s'%('frame','pred','gt','TP','FP','FN','dup','oob','P','R'))
for r in rows: print('%-34s %4d %4d %4d %4d %4d %4d %4d %6.2f %6.2f'%(r['stem'],r['pred'],r['gt'],r['tp'],r['fp'],r['fn'],r['dup'],r['oob'],r['prec'],r['rec']))
print('%-34s %4d %4d %4d %4d %4d %4d %4d %6.2f %6.2f'%('合计',tot['pred'],tot['gt'],tot['tp'],tot['fp'],tot['fn'],tot['dup'],tot['oob'],tot['tp']/max(1,tot['pred']),tot['tp']/max(1,tot['gt'])))
print('\nFP by pred class:',dict(fp_cls.most_common()))
print('FN by truth class:',dict(fn_cls.most_common()))
print('\nclass confusion (pred→gt) top12:')
for (a,b),n in conf.most_common(12):
    if a!=b: print('   %-8s→%-8s %d'%(a,b,n))
print('\nidentical-class matches:',sum(n for (a,b),n in conf.items() if a==b))
json.dump(dict(rows=rows,tot=dict(tot),fp=dict(fp_cls),fn=dict(fn_cls),
               conf={'%s→%s'%k:v for k,v in conf.items()}),open('/tmp/match5.json','w'),ensure_ascii=False,indent=1)
