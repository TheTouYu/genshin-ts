#!/usr/bin/env python3
"""gui-test/.04 语音条目采集 v4（完整正序一遍：固定 2.2s + 复核重读）

为什么改：v3 用"等到稳定"的判据在 1.37s 就返回（见运行时日志 `settle=1374ms`），
而**正文/标题要到 ~2.0s 才落定** ⇒ 读到的还是上一条 ⇒ 判"没推进" ⇒ 再按一次 S
⇒ **跳过一条**（v3 共 13 次这种 stall，等于漏 13 条）。v4 改用固定 2.2s + 复核重读：
读到的标题若与上一条相同，隔 1.0s 再读一次（是"读早了"就纠正，是"到底"就连续 3 次停）。

用法: collect04d.py top|cont <tag> [cap] [budget]
"""
import os, sys, time, json
sys.path.insert(0, '/home/h/genshin-ts/gui-test/.04')
from collect04c import (grab, key, ocr_lines, norm, save_crop, OUT,
                        TITLE, KEY_W, KEY_S, FIRST_TITLE)

WAIT = 2.2


def run(mode='top', tag='p3', cap=200, budget=250):
    os.makedirs(f'{OUT}/frames', exist_ok=True)
    os.makedirs(f'{OUT}/raw', exist_ok=True)
    cur = '/tmp/ys04.bmp'
    js = '/tmp/ys04-t.json'
    t_start = time.time()
    log = open(f'{OUT}/raw/entries-{tag}.jsonl', 'w')
    recs = []

    if mode == 'top':
        for _ in range(4):
            for _ in range(25):
                key(KEY_W)
                time.sleep(0.12)
            time.sleep(2.4)
            grab(cur)
            _, t = ocr_lines(cur, TITLE, js)
            print(f'[top] 冲顶后标题={t}', flush=True)
            if norm(t).startswith(FIRST_TITLE):
                break

    grab(cur)
    _, title = ocr_lines(cur, TITLE, js)
    print(f'[run:{tag}] 起点={title}', flush=True)

    def take(kind, t):
        p = f'{OUT}/frames/{tag}-{len(recs)+1:04d}.jpg'
        save_crop(cur, p)
        d = {'idx': len(recs) + 1, 'kind': kind, 'title': t, 'settle_ms': int(WAIT * 1000),
             'crop': os.path.relpath(p, OUT), 't_rel': round(time.time() - t_start, 1)}
        recs.append(d)
        log.write(json.dumps(d, ensure_ascii=False) + '\n')
        log.flush()
        return d

    take('start', title)
    last, stalls = title, 0

    while len(recs) < cap and time.time() - t_start < budget:
        key(KEY_S)
        time.sleep(WAIT)
        grab(cur)
        _, t = ocr_lines(cur, TITLE, js)
        if norm(t) == norm(last):          # 读早了 or 到底 → 隔 1s 复核
            time.sleep(1.0)
            grab(cur)
            _, t = ocr_lines(cur, TITLE, js)
        if not norm(t) or norm(t) == norm(last):
            stalls += 1
            print(f'[run:{tag}] stall={stalls} title={t}', flush=True)
            if stalls >= 3:
                print('[run] 连续 3 次未推进 ⇒ 到底', flush=True)
                break
            continue
        stalls = 0
        d = take('key', t)
        last = t
        if d['idx'] % 10 == 0:
            el = time.time() - t_start
            print(f'[{d["idx"]:04d}] {t} t={el:.0f}s avg={el/d["idx"]:.2f}s/条', flush=True)

    summary = {'tag': tag, 'mode': mode, 'count': len(recs),
               'elapsed': round(time.time() - t_start, 1),
               'per_entry_s': round((time.time() - t_start) / max(len(recs), 1), 2),
               'titles': [r['title'] for r in recs]}
    log.write(json.dumps({'summary': summary}, ensure_ascii=False) + '\n')
    log.close()
    json.dump(summary, open(f'{OUT}/raw/summary-{tag}.json', 'w'), ensure_ascii=False, indent=1)
    print(f'[run] DONE {tag} count={summary["count"]} elapsed={summary["elapsed"]}s '
          f'avg={summary["per_entry_s"]}s/条 | last={summary["titles"][-1]}', flush=True)
    return 0


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'top'
    tag = sys.argv[2] if len(sys.argv) > 2 else 'p3'
    cap = int(sys.argv[3]) if len(sys.argv) > 3 else 200
    budget = int(sys.argv[4]) if len(sys.argv) > 4 else 250
    sys.exit(run(mode=mode, tag=tag, cap=cap, budget=budget))
