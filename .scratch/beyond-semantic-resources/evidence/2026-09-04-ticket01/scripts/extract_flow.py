import struct
path='/home/h/loop.pcap'
data=open(path,'rb').read()
be=data[:4]==b'\xa1\xb2\xc3\xd4'
def u32(b,o): return struct.unpack('>I' if be else '<I', b[o:o+4])[0]
linktype=u32(data,20)
off=24
out=open('/tmp/game_flow.bin','wb')
count=0
while off < len(data):
    if be:
        ts_sec,ts_usec,incl_len,orig_len=struct.unpack('>IIII',data[off:off+16])
    else:
        ts_sec,ts_usec,incl_len,orig_len=struct.unpack('<IIII',data[off:off+16])
    pkt=data[off+16:off+16+incl_len]
    off+=16+incl_len
    start=0 if linktype==101 else 4
    if len(pkt)<start+20: continue
    p=pkt[start:]
    if (p[0]>>4)!=4: continue
    ihl=(p[0]&0xf)*4
    if p[9]!=6 or len(p)<ihl+20: continue
    sport,dport=struct.unpack('>HH', p[ihl:ihl+4])
    if not ((sport==54562 and dport==61165) or (sport==61165 and dport==54562)): continue
    doff=(p[ihl+12]>>4)*4
    if doff<20 or len(p)<ihl+doff: continue
    payload=p[ihl+doff:]
    out.write(b'=== %d.%06d %d->%d len=%d ===\n' % (ts_sec,ts_usec,sport,dport,len(payload)))
    out.write(payload)
    out.write(b'\n')
    count+=1
out.close()
print('packets in flow',count)
blob=open('/tmp/game_flow.bin','rb').read()
print('blob size',len(blob))
for n in ['造物不可见','定时触发技能','移动速率调整率','移动速率','特殊功能','单位状态','效果详细信息','1720001','2110001','2010001']:
    for enc in ('utf-8','utf-16-le'):
        pos=blob.find(n.encode(enc))
        if pos!=-1: print('HIT',n,enc,pos)
