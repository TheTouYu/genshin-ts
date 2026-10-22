import json, sys, re, subprocess, time
from PIL import Image

OUT = '/home/h/genshin-ts/gui-test/.04'
YSTEXT = '/home/h/genshin-ts/tools/ys-editor/ys-text'
BODY = (40, 95, 800, 1075)          # 裁块本地坐标
BODY2 = tuple(v * 2 for v in BODY)  # 2x 版本

def norm(s):
    return re.sub(r'[\s，。！？、；：「」『』（）…—·•\.\,\!\?\:\;]', '', s or '')

def ocr(frame, region, js):
    r = subprocess.run([YSTEXT, frame, '--region', ' '.join(map(str, region)),
                        '--only', 'lines', '--json-out', js], capture_output=True, text=True)
    if r.returncode != 0:
        return []
    return [l['text'].strip() for l in json.load(open(js)).get('lines', [])]

data = json.load(open(f'{OUT}/data/voices.json'))
sample = data[::5]
print(f'[xcheck] 抽样 {len(sample)} 条（每 5 条取 1）', flush=True)
same_lines = tot_lines = 0
char_hit = char_tot = 0
diff_examples = []
t0 = time.time()
for r in sample:
    crop = f"{OUT}/{r['source']}"
    im = Image.open(crop).convert('RGB')
    im2 = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
    im2.save('/tmp/x2.png')
    l1 = [l['text'].strip() for l in r['lines']]
    l2 = ocr('/tmp/x2.png', BODY2, '/tmp/x2.json')
    n1 = [norm(x) for x in l1]
    n2 = [norm(x) for x in l2]
    a = ' '.join(n1)
    b = ' '.join(n2)
    same_lines += sum(1 for x in n1 if x in n2)
    tot_lines += len(n1)
    # 字符级：以 1x 为基准，看 2x 是否含同样字符序列（近似）
    from collections import Counter
    ca, cb = Counter(a), Counter(b)
    char_hit += sum(min(ca[c], cb[c]) for c in ca)
    char_tot += max(len(a), 1)
    for x, y in zip(l1, l2):
        if norm(x) != norm(y) and len(diff_examples) < 8:
            diff_examples.append((r['idx'], x, y))
print(f'[xcheck] 行级一致率 {same_lines}/{tot_lines} = {same_lines/max(tot_lines,1):.3f}', flush=True)
print(f'[xcheck] 字符多重集吻合 {char_hit}/{char_tot} = {char_hit/max(char_tot,1):.3f}', flush=True)
print(f'[xcheck] 耗时 {time.time()-t0:.0f}s', flush=True)
print('[xcheck] 差异样例（1x vs 2x）:')
for i, x, y in diff_examples:
    print(f'  #{i:03d}  1x={x}\n         2x={y}')
json.dump({'sample': len(sample), 'line_agree': same_lines / max(tot_lines, 1),
           'char_agree': char_hit / max(char_tot, 1), 'diff_examples': diff_examples},
          open(f'{OUT}/data/xcheck-2x.json', 'w'), ensure_ascii=False, indent=1)
