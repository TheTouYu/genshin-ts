import os
BASE="/mnt/e/ys/Genshin Impact Game/BeyondAssets/BeyondAssistEditor/Resource/Json"
XOR=0xe5
hashes=[1842178763,1272094579,3678006995]
patterns=[]
for h in hashes:
    def varint(n):
        out=bytearray()
        while True:
            b=n&0x7f; n>>=7
            if n: out.append(b|0x80)
            else: out.append(b); break
        return bytes(out)
    patterns += [
        (f'{h}_u32le', h.to_bytes(4,'little')),
        (f'{h}_u32be', h.to_bytes(4,'big')),
        (f'{h}_u64le', h.to_bytes(8,'little')),
        (f'{h}_var', varint(h)),
        (f'{h}_utf8', str(h).encode()),
        (f'{h}_utf16le', str(h).encode('utf-16-le')),
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
                hits.append((rel,label,dec.find(pat)))
print('hits',len(hits))
for h in hits[:200]: print(h)
