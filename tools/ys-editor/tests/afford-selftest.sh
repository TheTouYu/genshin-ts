#!/usr/bin/env bash
# afford-selftest.sh — 可点性打分（tools/ys-afford）离线自测
#
# 纪律：**全部离线读 fixtures，不碰活体桌面**（不点击/不抓屏/不抢焦点/不进槽）。
# 每条断言失败都打印「期望 vs 实测」+ 分数构成；机读行为最后一行：
#   AFFORD-RESULT frames=<n> assert=<n> pass=<n> fail=<n> verdict=PASS|FAIL
#
# 覆盖 task-7 四条硬判据 + open-items O-2026-10-18-01 第 1/2/3 条：
#   ① yingying-play  top-1 = 羊皮纸中央播放圆钮（±60px）
#   ② events-teams   ? 图标 (2102,334) 进 top-5（本地+云端 OCR 都读不到的入口）
#   ③ claim-before   两个【领取】(1789,431)/(1790,590) 进 top-5，
#                    且 5 行领取全部被检出（ys-screen 单路会 0/5 漏掉——实心色块通道的验收点）
#   ④ battle-report  负样本：top-3 不得是 3D 角色/怪物（画面主体不是按钮）
#   ⑤ 红点 badge 通道：真红点命中 / HUD 血条与插画红块不得冒充 / 红点本身不当点击目标
#   ⑥ 分数自洽：score = raw × Π惩罚、parts 求和 = raw、排序单调、理由≥5 条
#
# 用法：bash tools/ys-editor/tests/afford-selftest.sh
# 退出码：0 = 全 PASS / 1 = 有断言失败 / 2 = 环境缺件（帧或工具不存在）
set -uo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$HERE/../../.." && pwd)
FIX="$ROOT/tools/ys-editor/tests/fixtures/unknown"
TOOL="$ROOT/tools/ys-afford"
TOP=5

TMP=$(mktemp -d "${TMPDIR:-/tmp}/ys-afford-selftest.XXXXXX")
trap 'rm -rf "$TMP"' EXIT

# 八帧：五个活动页 + 两个奖励面板 + 一个战斗负样本（就是用户放好的那 8 张只读帧）
FRAMES=(claim-before claim-after events-teams reward-panel rules-panel settle-success
        yingying-play battle-report)

echo "== ys-afford selftest =="
echo "   工具: $TOOL"
echo "   帧:   $FIX （${#FRAMES[@]} 张，只读 PNG）"
echo "   屏:   ${DISPLAY:-<无 DISPLAY>}（本测试不使用屏幕）"

[ -x "$TOOL" ] || { echo "FAIL 前置：$TOOL 不存在或不可执行（期望：可执行；实测：缺失）" >&2; exit 2; }
[ -d "$FIX" ] || { echo "FAIL 前置：fixtures 目录缺失 $FIX（期望：目录；实测：缺失）" >&2; exit 2; }
for f in "${FRAMES[@]}"; do
  [ -f "$FIX/$f.png" ] || { echo "FAIL 前置：帧缺失 $FIX/$f.png（期望：只读 PNG；实测：缺失）" >&2; exit 2; }
done

# 一次一波并行（OCR 子进程是主要成本，单帧 ~1.5~2.4s；串行 8 帧 ~17s → 并行 ~5s）。
# 注：并行只影响耗时，不影响断言——本测试不断言时间。
declare -A RC
run_frame() {
  local name=$1
  local t0 t1
  t0=$(date +%s%N)
  "$TOOL" "$FIX/$name.png" --json --top "$TOP" --json-out "$TMP/$name.json" \
      >"$TMP/$name.stdout" 2>"$TMP/$name.err"
  echo $? >"$TMP/$name.rc"
  t1=$(date +%s%N)
  echo $(( (t1 - t0) / 1000000 )) >"$TMP/$name.ms"
}
PAR=4
n=0
for f in "${FRAMES[@]}"; do
  run_frame "$f" &
  n=$((n+1))
  if [ $((n % PAR)) -eq 0 ]; then wait; fi
done
wait
for f in "${FRAMES[@]}"; do
  RC["$f"]=$(cat "$TMP/$f.rc" 2>/dev/null || echo 99)
  if [ -s "$TMP/$f.err" ]; then
    echo "   [stderr] $f:"
    sed 's/^/     /' "$TMP/$f.err" | head -6
  fi
done

CHECK_OUT="$TMP/checks.txt"
python3 - "$TMP" "$TOP" "${FRAMES[@]}" <<'PY' >"$CHECK_OUT"

import json
import os
import sys

tmp = sys.argv[1]
top_n = int(sys.argv[2])
FRAMES = sys.argv[3:]
SEP = '\x1f'
results = []

# 判据锚点（全部来自离屏实测，见 tools/ys-afford 头注释与任务书 task-7）
PLAY_BTN = (1281, 695)            # yingying-play 羊皮纸中央播放圆钮（125x130，DoG bbox 中心）
Q_ICON = (2102, 334)              # events-teams 「活动说明」的 ? 图标（52x52 圆环）
CLAIM_ROW1 = (1789, 431)          # claim-before 第 1 行【领取】
CLAIM_ROW2 = (1790, 590)          # claim-before 第 2 行【领取】
CLAIM_ROWS = [(1789, 431), (1789, 590), (1789, 750), (1790, 910), (1790, 1070)]
# 负样本的地面真值：battle-report 里的 3D 角色/怪物（逐个人眼核定，见提交里的裁剪拼图）
ACTORS = [
    ('角色A1 小人+血条', (674, 652, 750, 790)),
    ('怪物A2 青色史莱姆', (1335, 510, 1415, 600)),
    ('角色A3 远景小人', (1435, 365, 1485, 470)),
    ('怪物A4 蓝白造物', (1590, 375, 1660, 515)),
    ('怪物A5 青色史莱姆', (1425, 712, 1510, 800)),
    ('角色A6 右侧大角色', (1966, 738, 2124, 964)),
]
# 红点中心（= 红块 bbox 角 + 半边长；实测 bbox (326,322,26,26)/(1805,227,26,26)）
BADGES_CLAIM = [(338, 334), (338, 582), (1817, 239)]
BADGES_TEAMS = [(338, 334), (338, 582)]
PENALTY_KEYS = {'textbox', 'line', 'dim', 'scene', 'huge', 'ink', 'hud'}
PART_KEYS = {'badge', 'small', 'contrast', 'ring', 'text'}


def ok(name, actual=''):
    results.append(('PASS', name, '', actual))


def bad(name, expect, actual):
    results.append(('FAIL', name, expect, str(actual)))


def load(name):
    p = os.path.join(tmp, name + '.json')
    try:
        with open(p, encoding='utf-8') as f:
            return json.load(f), None
    except FileNotFoundError:
        return None, '文件不存在 %s' % p
    except ValueError as exc:
        return None, 'JSON 解析失败：%s' % exc


def dist(a, b):
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


def rc_of(name):
    try:
        with open(os.path.join(tmp, name + '.rc'), encoding='utf-8') as f:
            return f.read().strip()
    except OSError:
        return '?'


def why(c):
    """把候选的**分数构成**摊开——失败时能看出是哪个分量没给分，而不是只知道"没进榜"。"""
    if c is None:
        return '（无候选）'
    parts = ' '.join('%s=%.3f' % (k, v) for k, v in c['parts'].items())
    pens = ' '.join('%s×%.2f' % (k, v) for k, v in c['penalties'].items() if v < 1.0) or '无惩罚'
    return 'score=%.3f (%d,%d) src=%s | %s | raw=%.3f | %s' % (
        c['score'], c['cx'], c['cy'], ','.join(c['sources']), parts, c['raw'], pens)


def rank_within(doc, target, tol, n):
    """top-n 里有没有中心落在 target ±tol 内的候选；返回 (rank, 候选|None)。"""
    for c in doc.get('top', [])[:n]:
        if dist((c['cx'], c['cy']), target) <= tol:
            return c['rank'], c
    return None, None


def in_candidates(doc, target, tol):
    """全部候选里有没有中心落在 target ±tol 内（不看排名，用于覆盖率断言）。"""
    for c in doc.get('candidates', []):
        if dist((c['cx'], c['cy']), target) <= tol:
            return c
    return None


def nearest(doc, target):
    best, bd = None, 1e9
    for c in doc.get('candidates', []):
        dd = dist((c['cx'], c['cy']), target)
        if dd < bd:
            best, bd = c, dd
    return best, bd


# ---------------------------------------------------------------- 基础：跑通 + 结构自洽
docs = {}
for name in FRAMES:
    rc = rc_of(name)
    d, err = load(name)
    if rc != '0':
        bad('rc/' + name, '退出码 0', 'rc=%s' % rc)
    if err:
        bad('json/' + name, '可解析 JSON（--json-out）', err)
        continue
    ok('rc+json/' + name, 'rc=0 cands=%d badges=%d ms=%s' % (
        len(d['candidates']), len(d['badges']), d['timing']['total_ms']))
    docs[name] = d
    if d.get('schema') != 'ys-afford/1':
        bad('schema/' + name, 'ys-afford/1', d.get('schema'))
    if len(d.get('top') or []) != min(top_n, len(d['candidates'])):
        bad('top-n/' + name, 'top 长度 = min(%d, 候选数)' % top_n,
            '%d / %d' % (len(d.get('top') or []), len(d['candidates'])))

# 分数自洽（每个候选都要能被复算，不许出现"说不清为什么高"的候选）
for name, d in docs.items():
    bads = []
    prev = 2.0
    for c in d['candidates']:
        if not (0.0 <= c['score'] <= 1.0):
            bads.append('score 越界 %.3f' % c['score'])
        if abs(sum(c['parts'].values()) - c['raw']) > 2e-3:
            bads.append('parts 和 %.4f != raw %.4f' % (sum(c['parts'].values()), c['raw']))
        rec = c['raw']
        for v in c['penalties'].values():
            rec *= v
        if abs(rec - c['score']) > 3e-3:
            bads.append('score 复算 %.4f != 报出 %.4f @(%d,%d)' % (
                rec, c['score'], c['cx'], c['cy']))
        if set(c['parts']) != PART_KEYS:
            bads.append('parts 键不符 %s' % sorted(c['parts']))
        if set(c['penalties']) != PENALTY_KEYS:
            bads.append('penalties 键不符 %s' % sorted(c['penalties']))
        if len(c['reasons']) < 5:
            bads.append('理由不足 %d 条 @(%d,%d)' % (len(c['reasons']), c['cx'], c['cy']))
        if c['score'] > prev + 1e-9:
            bads.append('排序不单调 @rank%d' % c['rank'])
        prev = c['score']
        if c.get('shape') is None or c.get('bbox') is None:
            bads.append('缺少 shape/bbox')
        if 'badge' in [s.split(':')[0] for s in c['sources']]:
            bads.append('红点自己成了候选 @(%d,%d)' % (c['cx'], c['cy']))
    if bads:
        bad('score/' + name, 'score=raw×Π惩罚、parts 求和=raw、排序单调、理由≥5',
            '; '.join(bads[:4]))
    else:
        ok('score/' + name, '%d 个候选全部可复算' % len(d['candidates']))

# ---------------------------------------------------------------- ① yingying-play 播放圆钮
d = docs.get('yingying-play')
if d:
    c = (d.get('top') or [None])[0]
    if c is None:
        bad('play/top1', '有 top-1', '空')
    else:
        dd = dist((c['cx'], c['cy']), PLAY_BTN)
        if dd <= 60:
            ok('play/top1±60', 'score=%.3f (%d,%d) 偏差%.0fpx %s' % (
                c['score'], c['cx'], c['cy'], dd, ','.join(c['sources'])))
        else:
            bad('play/top1±60', 'top-1 中心 = 播放圆钮 (1281,695) ±60px',
                '(%d,%d) 偏差%.0fpx；实测 top-1 构成 %s' % (c['cx'], c['cy'], dd, why(c)))
        if 0.6 <= c['w'] / float(c['h']) <= 1.6:
            ok('play/圆形', 'w/h=%.2f' % (c['w'] / float(c['h'])))
        else:
            bad('play/圆形', 'w/h ∈ [0.6,1.6]（圆钮）', 'w/h=%.2f' % (c['w'] / float(c['h'])))
    top = d.get('top') or []
    if len(top) > 1 and top[0]['score'] > top[1]['score']:
        ok('play/领先第二名', '%.3f > %.3f' % (top[0]['score'], top[1]['score']))
    else:
        bad('play/领先第二名', 'top-1 分数严格大于 top-2（不许并列蒙对）',
            'top1=%.3f top2=%.3f' % (top[0]['score'], top[1]['score']) if len(top) > 1
            else 'top 不足 2 条')

# ---------------------------------------------------------------- ② events-teams ? 图标
d = docs.get('events-teams')
if d:
    rk, c = rank_within(d, Q_ICON, 30, 5)
    if rc is not None and c is not None:
        ok('qicon/top5', 'rank=%d score=%.3f (%d,%d) src=%s' % (
            rk, c['score'], c['cx'], c['cy'], c['evidence']['src']))
        if c['evidence']['src'] == 'ring':
            ok('qicon/圆环证据', 'ring_contrast=%.0f edge_cov=%.2f' % (
                c['evidence']['ring_contrast'] or -1, c['evidence']['edge_cov']))
        else:
            bad('qicon/圆环证据', 'src=ring（ys-screen 径向通道）', c['evidence']['src'])
    else:
        nn, nd = nearest(d, Q_ICON)
        bad('qicon/top5', '? 图标 (2102,334) 进 top-5（±30px）',
            '未进（偏%.0fpx）；最近候选 rank=%s %s' % (nd, nn['rank'] if nn else '?', why(nn)))

# ---------------------------------------------------------------- ③ claim-before 领取按钮
d = docs.get('claim-before')
if d:
    for tag, target in (('row1', CLAIM_ROW1), ('row2', CLAIM_ROW2)):
        rk, c = rank_within(d, target, 30, 5)
        if c is not None:
            ok('claim/%s' % tag, 'rank=%d score=%.3f (%d,%d) src=%s' % (
                rk, c['score'], c['cx'], c['cy'], ','.join(c['sources'])))
        else:
            nn, nd = nearest(d, target)
            bad('claim/%s' % tag, '【领取】%s 中心 %s ±30px 进 top-5' % (tag, target),
                '未进（偏%.0fpx）；最近候选 %s' % (nd, why(nn)))
    hit = sum(1 for t in CLAIM_ROWS if in_candidates(d, t, 45) is not None)
    if hit == len(CLAIM_ROWS):
        ok('claim/5行覆盖', '%d/%d 行领取都被检出' % (hit, len(CLAIM_ROWS)))
    else:
        miss = [t for t in CLAIM_ROWS if in_candidates(d, t, 45) is None]
        bad('claim/5行覆盖', '5/5 行【领取】被检出（ys-screen 单路会 0/5 漏掉）',
            '%d/%d；漏 %s' % (hit, len(CLAIM_ROWS),
                              '；'.join('%s → %s' % (t, why(nearest(d, t)[0])) for t in miss)))

# ---------------------------------------------------------------- ④ battle-report 负样本
d = docs.get('battle-report')
if d:
    top3 = (d.get('top') or [])[:3]
    inside = []
    for c in top3:
        for tag, b in ACTORS:
            if b[0] <= c['cx'] <= b[2] and b[1] <= c['cy'] <= b[3]:
                inside.append('%s ← rank%d (%d,%d)' % (tag, c['rank'], c['cx'], c['cy']))
    if not inside:
        ok('battle/top3无角色', 'top-3 = ' + ' | '.join(
            '%.3f(%d,%d)' % (c['score'], c['cx'], c['cy']) for c in top3))
    else:
        bad('battle/top3无角色', 'top-3 不得是 3D 角色/怪物（画面主体不是按钮）',
            '; '.join(inside) + ' || ' + ' / '.join(why(c) for c in top3))
    # 反向读数 1：角色/怪物必须确实被检出过（否则"没进 top-3"可能只是没看见，等于没验）
    per_actor = []
    for tag, b in ACTORS:
        hits = [c for c in d['candidates']
                if b[0] <= c['cx'] <= b[2] and b[1] <= c['cy'] <= b[3]]
        per_actor.append((tag, sorted(c['rank'] for c in hits)))
    found = [t for t, ranks in per_actor if ranks]
    if len(found) >= 4:
        ok('battle/角色被检出', '%d/%d 个角色/怪物进了候选池：%s' % (
            len(found), len(ACTORS),
            ' '.join('%s:rank%s' % (t, r[0]) for t, r in per_actor if r)))
    else:
        bad('battle/角色被检出', '≥4/6 个角色/怪物出现在候选池（证明是"压下去"而不是"没看见"）',
            '%d/%d：%s' % (len(found), len(ACTORS), per_actor))
    # 反向读数 2：每个被检出的角色/怪物，其最好名次都必须在 top-3 之外
    too_high = ['%s rank%d' % (t, r[0]) for t, r in per_actor if r and r[0] <= 3]
    if not too_high:
        ok('battle/角色名次均>3', '最好名次 %s' % ', '.join(
            '%s=rank%d' % (t, r[0]) for t, r in per_actor if r))
    else:
        bad('battle/角色名次均>3', '每个角色/怪物的最好名次 > 3（画面主体排在按钮后面）',
            '; '.join(too_high))

# ---------------------------------------------------------------- ⑤ 红点 badge 通道
def check_badges(name, expect, label):
    d = docs.get(name)
    if not d:
        return
    got = [(b['cx'], b['cy']) for b in d['badges']]
    missing = [e for e in expect if not any(dist(g, e) <= 8 for g in got)]
    extra = [g for g in got if not any(dist(g, e) <= 8 for e in expect)]
    if not missing and not extra:
        ok('badge/' + label, '%d 个红点 %s' % (len(got), got))
    else:
        bad('badge/' + label, '红点 %s（±8px）' % (expect,),
            '缺 %s；多 %s（全部 %s）' % (missing, extra, got))


check_badges('claim-before', BADGES_CLAIM, 'claim-before 3 处(2 侧栏+1 页签)')
check_badges('events-teams', BADGES_TEAMS, 'events-teams 2 处侧栏')
check_badges('battle-report', [], 'battle-report 0 处(HUD 血条不得冒充)')
check_badges('yingying-play', [], 'yingying-play 0 处')

for name, d in docs.items():
    if any(b.get('attach') for b in d['badges']):
        ok('badge/attach-' + name, '%d/%d 个红点贴到了控件/条目' % (
            sum(1 for b in d['badges'] if b.get('attach')), len(d['badges'])))

# ---------------------------------------------------------------- ⑨ 暗面=不可点（跨帧同点对拍）
# 判据：**同一个侧栏条目**（砺行修远，屏幕坐标 (425,604)）在两张帧里是同一块 UI，
# 唯一差别是 claim-before 打开弹窗、侧栏被压暗幕（scrim）盖住。
#   要求 A：无遮罩帧（events-teams）的可点分 ≥ 有遮罩帧（claim-before）的 1.2 倍
#   要求 B：原因必须是 dim 惩罚生效（不是别的分量碰巧有差）
SIDEBAR_ROW = (425, 604)


def check_dim(teams, claim):
    if not teams or not claim:
        bad('dim/暗面不可点', '两帧都要有候选', 'teams=%s claim=%s' % (bool(teams), bool(claim)))
        return
    a, _ = nearest(teams, SIDEBAR_ROW)
    b, _ = nearest(claim, SIDEBAR_ROW)
    if a is None or b is None:
        bad('dim/暗面不可点', '(425,604) 附近两帧都有候选', 'teams=%s claim=%s' % (a, b))
        return
    ratio = a['score'] / max(1e-6, b['score'])
    if ratio >= 1.20:
        ok('dim/无遮罩更可点', '同一行 events-teams=%.3f / claim-before=%.3f = %.2f×' % (
            a['score'], b['score'], ratio))
    else:
        bad('dim/无遮罩更可点', '同一行在无遮罩帧的分数 ≥ 有遮罩帧 1.20 倍',
            'events-teams=%.3f claim-before=%.3f = %.2f× | %s | %s' % (
                a['score'], b['score'], ratio, why(a), why(b)))
    if a['penalties']['dim'] >= 0.999 and b['penalties']['dim'] < 0.999:
        ok('dim/原因在 dim', 'events-teams dim×%.2f（无遮罩）/ claim-before dim×%.2f（有遮罩）' % (
            a['penalties']['dim'], b['penalties']['dim']))
    else:
        bad('dim/原因在 dim', '无遮罩帧 dim=1.0 且 有遮罩帧 dim<1.0（差别要来自压暗层判定）',
            'teams dim×%.2f claim dim×%.2f' % (
                a['penalties']['dim'], b['penalties']['dim']))


check_dim(docs.get('events-teams'), docs.get('claim-before'))

for status, name, expect, actual in results:
    if status == 'PASS':
        print('PASS' + SEP + name + SEP + actual)
    else:
        print('FAIL' + SEP + name + SEP + expect + SEP + actual)
PY
PY_RC=$?

# ---------------------------------------------------------------- ⑦ 失败路径不许吞码（假成功闸门）
# 三个已知失败必须各自打出可 grep 的 token 且带出对应退出码：3/2/4。
neg_run() {   # $1=tag  $2..=命令
  local tag=$1; shift
  "$@" >"$TMP/neg.$tag.out" 2>"$TMP/neg.$tag.err"
  echo $? >"$TMP/neg.$tag.rc"
}
neg_run noframe "$TOOL" "$FIX/__不存在__.png"
neg_run badtop "$TOOL" "$FIX/yingying-play.png" --top 0
printf '#!/usr/bin/env python3\nimport sys\nsys.stderr.write("stub: ocr backend missing\\n")\nsys.exit(4)\n' \
  >"$TMP/stub-screen"
chmod +x "$TMP/stub-screen"
YS_AFFORD_SCREEN="$TMP/stub-screen" neg_run screenrc "$TOOL" "$FIX/yingying-play.png"

# 复用路径（--screen-json）必须和现跑一致：先让 ys-screen 出一份 JSON
"$ROOT/tools/ys-screen" "$FIX/yingying-play.png" --json-out "$TMP/yingying.screen.json" \
  >"$TMP/screen.stdout" 2>"$TMP/screen.err"
echo $? >"$TMP/screen.rc"
"$TOOL" "$FIX/yingying-play.png" --screen-json "$TMP/yingying.screen.json" --json \
  --json-out "$TMP/yingying-reuse.json" >"$TMP/reuse.stdout" 2>"$TMP/reuse.err"
echo $? >"$TMP/reuse.rc"

python3 - "$TMP" <<'PY2' >"$TMP/checks-neg.txt"
import json
import os
import sys

tmp = sys.argv[1]
SEP = '\x1f'
res = []


def ok(n, a=''):
    res.append(('PASS', n, '', a))


def bad(n, e, a):
    res.append(('FAIL', n, e, str(a)))


def read(name):
    p = os.path.join(tmp, name)
    try:
        with open(p, encoding='utf-8', errors='replace') as f:
            return f.read()
    except OSError:
        return ''


def rc(name):
    t = read(name + '.rc').strip()
    return int(t) if t.isdigit() else -1


CASES = [
    ('noframe', 3, 'NO-FRAME', '帧不存在 → rc=3 + AFFORD-FAIL NO-FRAME'),
    ('badtop', 2, 'BAD-TOP', '--top 0 → rc=2 + AFFORD-FAIL BAD-TOP'),
    ('screenrc', 4, 'SCREEN-FAIL', 'ys-screen 退出 4 → rc=4 + AFFORD-FAIL SCREEN-FAIL（不吞码）'),
]
for tag, want_rc, token, label in CASES:
    got_rc = rc('neg.' + tag)
    err = read('neg.' + tag + '.err')
    if got_rc == want_rc and ('AFFORD-FAIL ' + token) in err:
        ok('failclosed/' + tag, '%s（rc=%d，token 在）' % (label, got_rc))
    else:
        bad('failclosed/' + tag, label,
            'rc=%d（期望 %d）stderr=%r' % (got_rc, want_rc, err.strip()[:160]))

# 复用路径一致性：同一帧 --screen-json 与现跑必须给出同一条 top-1
try:
    with open(os.path.join(tmp, 'yingying-play.json'), encoding='utf-8') as f:
        fresh = json.load(f)
    with open(os.path.join(tmp, 'yingying-reuse.json'), encoding='utf-8') as f:
        reuse = json.load(f)
    a = (fresh['top'][0]['cx'], fresh['top'][0]['cy'], fresh['top'][0]['score'])
    b = (reuse['top'][0]['cx'], reuse['top'][0]['cy'], reuse['top'][0]['score'])
    if a == b and reuse['screen']['source'].startswith('reused:'):
        ok('reuse/screen-json', '现跑与复用一致 top1=%s' % (a,))
    else:
        bad('reuse/screen-json', '--screen-json 复用结果与现跑一致（同一条 top-1）',
            '现跑=%s 复用=%s source=%s' % (a, b, reuse['screen']['source']))
except (OSError, ValueError, KeyError, IndexError) as exc:
    bad('reuse/screen-json', '复用路径可跑且结果一致', '异常 %r rc=%d' % (exc, rc('reuse')))

for st, n, e, a in res:
    if st == 'PASS':
        print('PASS' + SEP + n + SEP + a)
    else:
        print('FAIL' + SEP + n + SEP + e + SEP + a)
PY2
PY2_RC=$?

# ---------------------------------------------------------------- ⑧ 白盒：numpy 兜底 CCL 与 scipy 逐位一致
# 本机装了 scipy，`_label_runs`（无 scipy 时的兜底）平时一行都不跑 —— 未跑 = 未验证。
# 这里把工具当模块 import（复制成 .py 才有 loader），同一批 mask 走两条路，
# 要求分量数/面积/bbox **完全一致**（bbox 差 1px 就会改变 rho / 对比 / edge_cov）。
cp "$TOOL" "$TMP/ys_afford_mod.py"
python3 - "$TMP" "$FIX/events-teams.png" >"$TMP/checks-ccl.txt" <<'PY3AFFORD'
import importlib.util
import sys

tmp, frame = sys.argv[1], sys.argv[2]
SEP = '\x1f'
spec = importlib.util.spec_from_file_location('ys_afford_mod', tmp + '/ys_afford_mod.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
import numpy as np

res = []


def ok(n, a=''):
    res.append(('PASS', n, '', a))


def bad(n, e, a):
    res.append(('FAIL', n, e, str(a)))


try:
    from scipy import ndimage  # noqa: F401
    has_scipy = True
except ImportError:
    has_scipy = False

if not has_scipy:
    ok('ccl/fallback', '本机无 scipy：只跑兜底路径，无从对拍（已显式说明）')
else:
    arr, lum, sat, val, hue = mod.load_frame(frame)
    roi = (slice(280, 700), slice(200, 1000))     # 裁 ROI 控制耗时（全帧游程并查集要几秒）
    masks = {
        'red': (((hue <= 24) | (hue >= 336)) & (sat >= 0.50) & (val >= 0.40))[roi],
        'solid': ((sat >= 0.42) & (val >= 0.28))[roi],
        'luma': (lum[roi] > 130),
        'synthetic': np.random.default_rng(7).random((180, 260)) > 0.92,
    }
    bads = []
    for tag, mk in masks.items():
        _, sa = mod.label_mask(mk)
        _, sb = mod._label_runs(mk)
        ka = sorted((s['area'], tuple(s['bbox'])) for s in sa)
        kb = sorted((s['area'], tuple(s['bbox'])) for s in sb)
        if ka != kb:
            bads.append('%s: scipy=%d numpy=%d 差异 %s' % (
                tag, len(ka), len(kb), sorted(set(ka) ^ set(kb))[:2]))
    if bads:
        bad('ccl/fallback==scipy', '兜底 CCL 的分量数/面积/bbox 与 scipy 完全一致', '; '.join(bads))
    else:
        ok('ccl/fallback==scipy', '%d 个 mask 双路完全一致（分量数/面积/bbox）' % len(masks))

for st, n, e, a in res:
    if st == 'PASS':
        print('PASS' + SEP + n + SEP + a)
    else:
        print('FAIL' + SEP + n + SEP + e + SEP + a)
PY3AFFORD
PY3_RC=$?
if [ "${PY3_RC:-1}" -ne 0 ] || [ ! -s "$TMP/checks-ccl.txt" ]; then
  echo "AFFORD-FAIL NO-CHECKS expected=CCL 对拍照常跑完 actual=rc=${PY3_RC:-?}" >&2
  exit 3
fi

if [ "${PY_RC:-1}" -ne 0 ]; then
  echo "AFFORD-FAIL NO-CHECKS expected=判据脚本退出码 0 actual=rc=$PY_RC" >&2
  exit 3
fi
if [ ! -s "$CHECK_OUT" ]; then
  echo "AFFORD-FAIL NO-CHECKS expected=至少 1 条断言 actual=checks.txt 为空" >&2
  exit 3
fi

ASSERT=0; PASSED=0; FAILED=0
while IFS= read -r line; do
  case "$line" in
    PASS*)
      IFS=$'\x1f' read -r _ name actual <<<"$line"
      ASSERT=$((ASSERT+1)); PASSED=$((PASSED+1))
      printf '  \033[32mPASS\033[0m %-28s %s\n' "$name" "$actual"
      ;;
    FAIL*)
      IFS=$'\x1f' read -r _ name expect actual <<<"$line"
      ASSERT=$((ASSERT+1)); FAILED=$((FAILED+1))
      printf '  \033[31mFAIL\033[0m %-28s\n         期望: %s\n         实测: %s\n' "$name" "$expect" "$actual"
      ;;
  esac
done <"$CHECK_OUT"
if [ "${PY2_RC:-1}" -ne 0 ] || [ ! -s "$TMP/checks-neg.txt" ]; then
  echo "AFFORD-FAIL NO-CHECKS expected=失败路径判据退出码 0 actual=rc=${PY2_RC:-?}" >&2
  exit 3
fi
while IFS= read -r line; do
  case "$line" in
    PASS*)
      IFS=$'\x1f' read -r _ name actual <<<"$line"
      ASSERT=$((ASSERT+1)); PASSED=$((PASSED+1))
      printf '  \033[32mPASS\033[0m %-28s %s\n' "$name" "$actual"
      ;;
    FAIL*)
      IFS=$'\x1f' read -r _ name expect actual <<<"$line"
      ASSERT=$((ASSERT+1)); FAILED=$((FAILED+1))
      printf '  \033[31mFAIL\033[0m %-28s\n         期望: %s\n         实测: %s\n' "$name" "$expect" "$actual"
      ;;
  esac
done < <(cat "$TMP/checks-neg.txt" "$TMP/checks-ccl.txt")

VERDICT=PASS
[ "$FAILED" -gt 0 ] && VERDICT=FAIL
[ "$ASSERT" -lt 10 ] && VERDICT=FAIL     # 断言数塌到 <10 = 判据脚本没真跑，不是好消息
echo
echo "  TIME  每帧（并行 4 路；含 ys-screen 子进程 OCR）"
for f in "${FRAMES[@]}"; do
  printf '        %-16s rc=%s %sms\n' "$f" "${RC[$f]}" "$(cat "$TMP/$f.ms" 2>/dev/null || echo '?')"
done
echo "  NOTE  负样本判据用的是**离屏人眼核定的角色/怪物框**（见脚本顶部 ACTORS 表），"
echo "        不是工具自己的读数——否则就是拿工具验工具。"

echo
echo "AFFORD-RESULT frames=${#FRAMES[@]} assert=$ASSERT pass=$PASSED fail=$FAILED verdict=$VERDICT"
[ "$VERDICT" = PASS ] || exit 1
exit 0
