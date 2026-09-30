#!/usr/bin/env python3
"""A2 实践 demo：按钮计数器（客户端 Lua ↔ 服务端变量信号全闭环）
链路：SimulateCursorClick → AddCursorEventListener 回调 → ServerSignal('set_score') 
     → serverLogic 规则 setCustomVariable(Level, score) → RegisterCustomVariableChangedHandler 
     → 文本框 text 字段更新
用法：python3 research/a2-lua-gen/demo-counter.py  （经 studio cli.mjs headless 跑）
"""
import json, subprocess, sys, tempfile, os

CLI = '/home/h/miliastra-beyond-simulator/studio/cli.mjs'
WORK = tempfile.mkdtemp(prefix='qxqy-demo-')

def run_job(job):
    inp, outp = os.path.join(WORK, 'in.json'), os.path.join(WORK, 'out.json')
    with open(inp, 'w', encoding='utf-8') as f:
        json.dump(job, f, ensure_ascii=False)
    r = subprocess.run(['node', CLI, '--in', inp, '--out', outp], capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        print('CLI FAIL', r.returncode, r.stderr[:500]); sys.exit(2)
    return json.load(open(outp, encoding='utf-8'))

# ① 默认工程模板
base = run_job({'cmd': 'get'})['data']

LUA = r"""
local score = 0
function OnStart()
  script.object.showCursor = true  -- 光标事件门：祖先 container 须 showCursor=true，默认 false 时点击静默无效
  local btn = script.object:GetChild('预设按钮')
  local label = script.object:GetChild('文本框')
  label.text = '分数: 0'
  btn:AddCursorEventListener(Enum.CursorEventType.CursorClick, function()
    score = score + 1
    -- ServerSignal 的 Add 族返回 nil（不可链式，与 Tween 风格不同）——必须分步调用
    local sig = game.ServerSignal('set_score')
    sig:AddInt(score)
    sig:SendSignal()
    print('click', score)
  end)
  script:RegisterCustomVariableChangedHandler(Enum.CustomVariableEntityType.Level, 'score',
    function(entityType, name)
      -- 官方契约：回调不带 value（仅 entityType/name 两参），当前值须 GetGlobalCustomVariableValue 读
      local v = game.GetGlobalCustomVariableValue(Enum.CustomVariableEntityType.Level, 'score')
      label.text = '分数: ' .. tostring(v)
      print('var-changed', name, tostring(v))
    end)
  btn:SimulateCursorClick()
  btn:SimulateCursorClick()
  btn:SimulateCursorClick()
  print('final-text', label.text)
end
"""

# ② 注入脚本 + 服务端规则，playRun 驱动
proj = dict(base)
proj['assets'] = {'scripts': [{'path': 'counter', 'controlId': 'n1', 'source': LUA}]}  # 不传 controlAsset=挂 server 模板（能跑）；传 client-control-template 会撞名挂错模板
proj['serverLogic'] = {'version': 1, 'rules': [
    {'id': 'r1', 'signalName': 'set_score', 'actions': [
        {'kind': 'setCustomVariable', 'entityType': 'Level', 'name': 'score', 'value': {'fromSignalParam': 0}},
    ]},
]}
res = run_job({'project': proj, 'cmd': 'playRun', 'frames': 30})
if not res['ok']:
    print('RUN FAIL:', res['error']); sys.exit(3)
snap = res['data']
logs = [l.get('text', str(l)) for l in snap.get('logs', [])]
print('===== demo 日志 =====')
for l in logs:
    print(' ', l)

# ③ 验证
text = '\n'.join(logs)
checks = [
    ('三次点击', text.count('click') == 3),
    ('变量变化事件×3', text.count('var-changed') == 3),
    ('final 文本=分数: 3', 'final-text\t分数: 3' in text),
]
print('===== 验证 =====')
ok = all(c[1] for c in checks)
for name, passed in checks:
    print(('  PASS ' if passed else '  FAIL ') + name)
# 服务端变量终值
vars_snap = None
print('结论:', '全闭环 PASS' if ok else '存在断链，见日志')
sys.exit(0 if ok else 1)
