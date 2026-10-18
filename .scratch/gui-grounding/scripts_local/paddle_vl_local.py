#!/usr/bin/env python3
"""PaddleOCR-VL 本地 GPU 推理（任务2）：venv-vl（paddlepaddle-gpu 3.2.0 cu126 + paddleocr[doc-parser] 3.7.0）。
用法: venv-vl/bin/python scripts_local/paddle_vl_local.py IMG [IMG...] [-o out.json]
首次运行自动下载模型（bcebos——已设 NO_PROXY 直连）。
输出: 每图 {file, init_secs, infer_secs, texts[]} 打印 + 存 out.json。
"""
import argparse, json, os, sys, time

def extract_texts(obj, acc):
    """从 PaddleOCRVL 结果对象递归抽 markdown 文本。"""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == 'markdown' and isinstance(v, dict) and 'text' in v:
                acc.append(v['text'])
            else:
                extract_texts(v, acc)
    elif isinstance(obj, (list, tuple)):
        for it in obj:
            extract_texts(it, acc)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs='+')
    ap.add_argument('-o', '--out', default='results/expC3_local_gpu.json')
    args = ap.parse_args()

    import paddle
    print('paddle', paddle.__version__, '| compiled with cuda:',
          paddle.is_compiled_with_cuda(), flush=True)
    t0 = time.perf_counter()
    from paddleocr import PaddleOCRVL
    ocr = PaddleOCRVL()          # 首次触发模型下载
    init_secs = time.perf_counter() - t0
    print(f'init+model_secs={init_secs:.1f}', flush=True)

    out = []
    for fp in args.files:
        t1 = time.perf_counter()
        try:
            res = ocr.predict(fp)
            infer_secs = time.perf_counter() - t1
            acc = []
            extract_texts(res, acc)
            out.append(dict(file=fp, infer_secs=round(infer_secs, 2),
                            texts=acc, ok=True))
            print(f'{os.path.basename(fp)}: {infer_secs:.2f}s -> '
                  f'{sum(len(t) for t in acc)} chars', flush=True)
        except Exception as e:
            out.append(dict(file=fp, ok=False, error=f'{type(e).__name__}: {e}'))
            print(f'{os.path.basename(fp)}: FAIL {type(e).__name__}: {e}', flush=True)
    os.makedirs(os.path.dirname(args.out) or '.', exist_ok=True)
    json.dump(dict(paddle=paddle.__version__, init_secs=round(init_secs, 1),
                   results=out), open(args.out, 'w'), ensure_ascii=False, indent=1)
    print('saved', args.out)

if __name__ == '__main__':
    main()
