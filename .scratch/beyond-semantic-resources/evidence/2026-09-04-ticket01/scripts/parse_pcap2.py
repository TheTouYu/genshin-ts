import struct
path='/home/h/loop.pcap'
data=open(path,'rb').read()
be = data[:4]==b'\xa1\xb2\xc3\xd4'
def u32(b,o): return struct.unpack('>I' if be else '<I', b[o:o+4])[0]
linktype = u32(data,20)
off=24
packets=[]
while off < len(data):
    if be:
        ts_sec, ts_usec, incl_len, orig_len = struct.unpack('>IIII', data[off:off+16])
    else:
        ts_sec, ts_usec, incl_len, orig_len = struct.unpack('<IIII', data[off:off+16])
    packets.append((ts_sec,ts_usec,data[off+16:off+16+incl_len]))
    off += 16+incl_len
print('linktype',linktype,'packets',len(packets))
# start offset depending linktype: 101 raw IP no link header
def parse_ip(pkt):
    start = 0 if linktype==101 else 4
    if len(pkt)<start+20: return None
    p=pkt[start:]
    if (p[0]>>4)!=4: return None
    ihl=(p[0]&0xf)*4
    if len(p)<ihl: return None
    return {'proto':p[9], 'src':struct.unpack('>I',p[12:16])[0], 'dst':struct.unpack('>I',p[16:20])[0], 'off':start+ihl}

def ip_str(x): return f'{x>>24&255}.{x>>16&255}.{x>>8&255}.{x&255}'
payloads=[]
flowbytes={}
for ts,us,pkt in packets:
    info=parse_ip(pkt)
    if not info or info['proto']!=6: continue
    po=info['off']
    if len(pkt)<po+20: continue
    sport,dport=struct.unpack('>HH', pkt[po:po+4])
    doff=(pkt[po+12]>>4)*4
    if doff<20 or len(pkt)<po+doff: continue
    payload=pkt[po+doff:]
    flowbytes[(sport,dport,ip_str(info['src']),ip_str(info['dst']))]=flowbytes.get((sport,dport,ip_str(info['src']),ip_str(info['dst'])),0)+len(payload)
    if (sport in (54562,54569) or dport in (54562,54569) or (ip_str(info['src'])=='127.0.0.1' and ip_str(info['dst'])=='127.0.0.1')):
        payloads.append((ts,us,sport,dport,ip_str(info['src']),ip_str(info['dst']),len(payload),payload))
print('flows localhost tcp:')
for k,v in sorted(flowbytes.items()):
    if k[2]=='127.0.0.1' or k[3]=='127.0.0.1':
        print(k,v)
print('payloads',len(payloads))
with open('/tmp/loop_payloads.bin','wb') as f:
    for ts,us,sport,dport,src,dst,l,payload in payloads:
        f.write(b'=== %d.%06d %s:%d->%s:%d len=%d ===\n' % (ts,us,src.encode(),sport,dst.encode(),dport,l))
        f.write(payload)
        f.write(b'\n')
blob=open('/tmp/loop_payloads.bin','rb').read()
print('blob size',len(blob))
for n in ['造物不可见','定时触发技能','移动速率调整率','移动速率','特殊功能','单位状态','效果详细信息','层数上限','1720001','2110001','2010001']:
    for enc in ('utf-8','utf-16-le'):
        pos=blob.find(n.encode(enc))
        if pos!=-1: print('HIT',n,enc,pos)
