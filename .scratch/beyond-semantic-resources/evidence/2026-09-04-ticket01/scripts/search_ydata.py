import os, mmap, time
root='/mnt/e/ys/Genshin Impact Game/YuanShen_Data'
exclude_dirs={'StreamingAssets','AssetBundles','webCaches','SDKCaches','Native'}
# patterns: decimal strings and binary
ids=[1720001,2110001,2010001]
def varint(n):
    out=bytearray()
    while True:
        b=n&0x7f; n>>=7
        if n: out.append(b|0x80)
        else: out.append(b); break
    return bytes(out)
patterns={}
for i in ids:
    s=str(i).encode('utf-8')
    s16=str(i).encode('utf-16-le')
    patterns[f'id{i}_u8']=s
    patterns[f'id{i}_u16']=s16
    patterns[f'id{i}_var']=varint(i)
    patterns[f'id{i}_u32le']=i.to_bytes(4,'little')
    patterns[f'id{i}_u32be']=i.to_bytes(4,'big')
names=['造物不可见','定时触发技能','移动速率调整率','移动速率调整率（动态）','特殊功能','单位状态','效果详细信息','层数上限']
for n in names:
    patterns['name_'+n+'_u8']=n.encode('utf-8')
    patterns['name_'+n+'_u16']=n.encode('utf-16-le')

hits=[]
scanned=0
errors=[]
t0=time.time()
for dirpath, dirnames, filenames in os.walk(root):
    # prune
    dirnames[:] = [d for d in dirnames if d not in exclude_dirs]
    for fn in filenames:
        p=os.path.join(dirpath,fn)
        try:
            sz=os.path.getsize(p)
        except OSError:
            continue
        if sz>300*1024*1024: # skip >300MB
            continue
        if sz==0:
            continue
        scanned+=1
        try:
            with open(p,'rb') as f:
                data=f.read()
        except Exception as e:
            errors.append((p,str(e))); continue
        for label, needle in patterns.items():
            pos=data.find(needle)
            if pos!=-1:
                rel=os.path.relpath(p,root)
                hits.append((rel,label,pos,sz))
print('scanned',scanned,'files, time',time.time()-t0)
print('hits',len(hits))
for h in hits[:200]:
    print(h)
print('errors',errors[:10])
