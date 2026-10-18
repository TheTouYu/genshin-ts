import time, hashlib, sys
import numpy as np
from Xlib import display as xdisplay, X

D = xdisplay.Display(':1')
WIN = D.create_resource_object('window', 0x01400001)
info = WIN.get_geometry()
print('geom', info.width, info.height, info.depth, flush=True)
t=[]
prev=None
for i in range(6):
    t0=time.perf_counter()
    raw = WIN.get_image(0,0,info.width,info.height, X.ZPixmap, 0xffffffff)
    data = raw.data
    t1=time.perf_counter()
    arr = np.frombuffer(data, dtype=np.uint8).reshape(info.height, info.width, 4)[:,:,:3]
    t2=time.perf_counter()
    h=hashlib.sha256(arr.tobytes()).hexdigest()[:12]
    d = None if prev is None else int(np.count_nonzero(np.any(arr!=prev,axis=2)))
    prev=arr
    t.append((t1-t0)*1000)
    print(f'iter{i} get_image={(t1-t0)*1000:6.2f}ms np={(t2-t1)*1000:6.2f}ms sha={h} diff_px={d} bytes={len(data)}', flush=True)
    time.sleep(0.12)
print('median_get_image_ms', round(float(np.median(t)),2))
