import os
BASE="/mnt/e/ys/Genshin Impact Game/BeyondAssets/BeyondAssistEditor/Resource/Json"
XOR=0xe5
ids=[1720001,2110001,2010001]
patterns=[]
for i in ids:
    patterns += [
        (f'{i}_u32le', i.to_bytes(4,'little')),
        (f'{i}_u32be', i.to_bytes(4,'big')),
        (f'{i}_utf8', str(i).encode()),
        (f'{i}_utf16le', str(i).encode('utf-16-le')),
        (f'{i}_utf16be', str(i).encode('utf-16-be')),
    ]
hits=[]
for root,dirs,files in os.walk(BASE):
    for fn in files:
        if not fn.endswith('.mihoyobin'): continue
        p=os.path.join(root,fn)
        raw=open(p,'rb').read()
        dec=bytes(b^XOR for b in raw)
        rel=os.path.relpath(p,BASE)
        for label,pat in patterns:
            if pat in dec:
                hits.append((rel,label))
            # also in raw (unlikely)
            if pat in raw:
                hits.append((rel,label+'RAW'))
print('hits',len(hits))
for h in hits[:100]: print(h)
