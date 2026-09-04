import mmap, time
path='/home/h/beyond_33256.dmp'
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
        pos=mm.find(needle)
        print(f'{name}: pos={pos} time={time.time()-t0:.2f}s')
        if pos!=-1:
            lo=max(0,pos-256); hi=min(len(mm),pos+len(needle)+512)
            chunk=mm[lo:hi]
            print('  context_hex_head:', chunk[:160].hex())
            for enc in ('utf-16-le','utf-8'):
                try: txt=chunk.decode(enc, errors='replace')
                except Exception: txt=''
                printable=''.join(c if (c.isprintable() or c in '\n\r\t') else '?' for c in txt)
                print(f'  {enc} context:', printable[:400])
    mm.close()
print('total',time.time()-t0)
