import struct, sys

path='/home/h/loop.pcap'
data=open(path,'rb').read()
magic=struct.unpack('>I', data[:4])[0] if data[:4]==b'\xa1\xb2\xc3\xd4' else struct.unpack('<I',data[:4])[0]
be = data[:4]==b'\xa1\xb2\xc3\xd4'
def u16(b,o): return struct.unpack('>H' if be else '<H', b[o:o+2])[0]
def u32(b,o): return struct.unpack('>I' if be else '<I', b[o:o+4])[0]
linktype = u32(data,20)
print('linktype',linktype,'endian_be',be)
off=24
packets=[]
while off < len(data):
    if off+16>len(data): break
    if be:
        ts_sec, ts_usec, incl_len, orig_len = struct.unpack('>IIII', data[off:off+16])
    else:
        ts_sec, ts_usec, incl_len, orig_len = struct.unpack('<IIII', data[off:off+16])
    pkt=data[off+16:off+16+incl_len]
    packets.append((ts_sec,ts_usec,pkt))
    off += 16+incl_len
print('packets',len(packets))

def ip_parse(pkt):
    # skip DLT_NULL 4 bytes family
    if len(pkt)<4: return None
    # family 2 = AF_INET
    p=pkt[4:]
    if len(p)<20: return None
    version_ihl=p[0]
    ihl=(version_ihl&0xf)*4
    if ihl<20 or len(p)<ihl: return None
    proto=p[9]
    src=struct.unpack('>I',p[12:16])[0]
    dst=struct.unpack('>I',p[16:20])[0]
    return {'proto':proto,'src':src,'dst':dst,'ip_start':4,'ihl':ihl,'payload_offset':4+ihl}

def ip_str(x): return f'{x>>24&255}.{x>>16&255}.{x>>8&255}.{x&255}'

flows={}
payloads=[]
for ts_sec,ts_usec,pkt in packets:
    info=ip_parse(pkt)
    if not info: continue
    if info['proto']!=6: continue
    po=info['payload_offset']
    if len(pkt)<po+20: continue
    sport,dport = struct.unpack('>HH', pkt[po:po+4])
    data_off=(pkt[po+12]>>4)*4
    flags=pkt[po+13]
    if data_off<20 or len(pkt)<po+data_off: continue
    payload=pkt[po+data_off:]
    key=(sport,dport,ip_str(info['src']),ip_str(info['dst']))
    flows[key]=flows.get(key,0)+len(payload)
    if payload and (sport in (54562,54569) or dport in (54562,54569) or (ip_str(info['src'])=='127.0.0.1' and ip_str(info['dst'])=='127.0.0.1')):
        payloads.append((ts_sec,ts_usec,sport,dport,ip_str(info['src']),ip_str(info['dst']),len(payload),payload))

print('flows localhost tcp:')
for k,v in sorted(flows.items()):
    if k[2]=='127.0.0.1' or k[3]=='127.0.0.1':
        print(k, 'bytes', v)
print('payloads localhost', len(payloads))
# dump payloads to file
with open('/tmp/loop_payloads.bin','wb') as f:
    for item in payloads:
        ts,us,sport,dport,src,dst,l,payload=item
        f.write(b'=== %d.%06d %s:%d->%s:%d len=%d ===\n' % (ts,us,src.encode(),sport,dst.encode(),dport,l))
        f.write(payload)
        f.write(b'\n')
# search payloads for Chinese names in utf8/utf16le
needles=['造物不可见','定时触发技能','移动速率调整率','移动速率','特殊功能','单位状态','效果详细信息','层数上限','1720001','2110001','2010001']
blob=open('/tmp/loop_payloads.bin','rb').read()
for n in needles:
    for enc in ('utf-8','utf-16-le'):
        pos=blob.find(n.encode(enc))
        print('needle',n,enc,pos)
