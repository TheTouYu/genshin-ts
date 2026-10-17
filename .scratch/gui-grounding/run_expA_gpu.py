import sys, warnings, runpy
warnings.filterwarnings('ignore')
sys.path.insert(0, '/home/h/genshin-ts/tools/ys-editor')
import numpy as np, ys_look
_gpu = ys_look._ncc_gpu
def ncc_gpu(I, T):
    return _gpu(np.asarray(I, dtype=np.float32), np.asarray(T, dtype=np.float32))
ys_look._ncc_np = ncc_gpu          # 让未改动的 expA 走 GPU
runpy.run_path('expA_template_matching.py', run_name='__main__')
