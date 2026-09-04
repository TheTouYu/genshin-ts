import mmap, time
path='/home/h/beyond_9980.dmp'
needles={
 'utf16_移动速率调整率（动态）':'移动速率调整率（动态）'.encode('utf-16-le'),
 'utf16_定时触发技能':'定时触发技能'.encode('utf-16-le'),
 'utf16_造物不可见':'造物不可见'.encode('utf-16-le'),
 'utf16_初始持续时间':'初始持续时间'.encode('utf-16-le'),
 'utf16_层数上限':'层数上限'.encode('utf-16-le'),
 'utf8_移动速率调整率（动态）':'移动速率调整率（动态）'.encode('utf-8'),
 'utf8_定时触发技能':'定时触发技能'.encode('utf-8'),
 'utf8_造物不可见':'造物不可见'.encode('utf-8'),
}
t0=time.time()
with open(path,'rb') as f:
    mm=mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ)
    for name, needle in needles.items():
        start=time.time()
        pos=mm.find(needle)
        print(f'{name}: pos={pos} time={time.time()-start:.2f}s')
        if pos!=-1:
            lo=max(0,pos-512); hi=min(len(mm),pos+len(needle)+1024)
            chunk=mm[lo:hi]
            print('  context_hex_head:', chunk[:160].hex())
            for enc in ('utf-16-le','utf-8'):
                try:
                    txt=chunk.decode(enc, errors='replace')
                except Exception:
                    txt=''
                # Filter to printable-ish
                lines=[ln for ln in txt.splitlines() if any(ord(c)>127 or c.isprintable() for c in ln)]
                print(f'  {enc} context snippet:', ''.join(lines)[:400])
    mm.close()
print('total time',time.time()-t0)
