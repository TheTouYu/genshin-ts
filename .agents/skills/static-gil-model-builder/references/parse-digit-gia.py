import struct
data = open('digits.gia','rb').read()
proto = data[20:-4]
def rv(b,i):
    r=0;s=0
    while True:
        x=b[i];i+=1
        r|=(x&0x7f)<<s
        if x<0x80: return r,i
        s+=7
def sf(b):
    out=[]; i=0
    while i<len(b):
        t,i=rv(b,i)
        fn=t>>3; wt=t&7
        if wt==2:
            ln,i=rv(b,i); out.append((fn,2,b[i:i+ln])); i+=ln
        elif wt==0:
            v,i=rv(b,i); out.append((fn,0,v))
        elif wt==5:
            out.append((fn,5,b[i:i+4])); i+=4
        else: break
    return out
def f32(x): return struct.unpack('<f', x)[0]
def parse_transform(tr):
    pos=[0.0,0.0,0.0]; scale=[1.0,1.0,1.0]; rot=None
    for fn,wt,v in sf(tr):
        if fn==1 and wt==2:
            for f2,w2,v2 in sf(v):
                if w2==5 and 1<=f2<=3: pos[f2-1]=f32(v2)
        elif fn==2 and wt==2:
            rot=[f32(x) for _,w,x in sf(v) if w==5][:3]
        elif fn==3 and wt==2:
            for f2,w2,v2 in sf(v):
                if w2==5 and 1<=f2<=3: scale[f2-1]=f32(v2)
    return pos,rot,scale
def slot_of(sub):
    for f,wt,x in sub:
        if f==1 and wt==0: return x
    return None
def parse_aux(rec):
    aux_id=res=None; name=None; host=None; trans=None
    for fn,wt,v in sf(rec):
        if fn==1 and wt==0: aux_id=v
        elif fn==2 and wt==0: res=v
        elif fn==4 and wt==2:
            sub=sf(v); slot=slot_of(sub)
            if slot==1:
                for f2,w2,v2 in sub:
                    if f2==11 and w2==2:
                        for f3,w3,v3 in sf(v2):
                            if f3==1 and w3==2: name=v3.decode('utf8','replace')
            elif slot==40:
                for f2,w2,v2 in sub:
                    if f2==50 and w2==2:
                        for f3,w3,v3 in sf(v2):
                            if f3==502 and w3==0: host=v3
        elif fn==5 and wt==2:
            sub=sf(v); slot=slot_of(sub)
            if slot==1:
                for f2,w2,v2 in sub:
                    if f2==11 and w2==2: trans=v2
    return aux_id,res,name,host,trans
i=0; entries=[]
while i<len(proto):
    tag=proto[i]; fn=tag>>3; wt=tag&7
    ln,i2=rv(proto,i+1)
    if fn==2: entries.append(proto[i2:i2+ln])
    i=i2+ln
rows=[]
for e in entries:
    for fn,wt,v in sf(e):
        if fn==21 and wt==2:
            for f2,w2,v2 in sf(v):
                if f2==1 and w2==2: rows.append(parse_aux(v2))
from collections import Counter
print('解析:', len(rows), '| 资源:', Counter(r[1] for r in rows))
print('宿主:', Counter(r[3] for r in rows), '| 无transform:', sum(1 for r in rows if r[4] is None))
byhost={}
for r in rows: byhost.setdefault(r[3],[]).append(r)
for h,rs in sorted(byhost.items()):
    print(f'== 宿主 {h}（{len(rs)} 装饰物）==')
    for aux,res,name,host,tr in rs:
        if tr:
            pos,rot,sc=parse_transform(tr)
            print(f'  {name:10s} aux={aux} pos=({",".join(f"{p:.4f}" for p in pos)}) rot={rot} scale=({",".join(f"{s:.4f}" for s in sc)})')
