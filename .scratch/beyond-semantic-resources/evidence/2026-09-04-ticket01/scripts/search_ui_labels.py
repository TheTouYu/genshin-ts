import mmap, time
path='/home/h/beyond_9980.dmp'
labels=['单位状态','未分类标签','新增状态','效果详细信息','添加效果','特殊功能','移动速率调整率','移动速率','定时触发','造物不可见','层数上限','持续时间','状态效果','状态名']
t0=time.time()
with open(path,'rb') as f:
    mm=mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ)
    for label in labels:
        for encname, enc in [('u16','utf-16-le'),('u8','utf-8')]:
            needle=label.encode(enc)
            pos=mm.find(needle)
            if pos!=-1:
                print(f'{label} [{encname}]: pos={pos}')
            else:
                print(f'{label} [{encname}]: not found')
    mm.close()
print('time',time.time()-t0)
