#!/usr/bin/env python3
"""音效挑选器本地服务（多 profile 版）。

职责：
  静态文件（index.html / catalog.json / profiles.json / choice.json）
  GET  /state    → 归一后的完整状态（profiles.json 的运行时视图；文件缺失则用内置 seed + 旧 choice.json 迁移）
  POST /save     → 落盘 profiles.json（权威状态） + choice.json（v2，含 legacy 顶层字段，供旧读者/AI 直接读）

兼容三种 POST body：
  ① v2 数组： {"version":2,"active":"tetris","profiles":[{id,name,luaName,slots:[{key,label,id,note}]}]}
  ② v2 映射： {"profiles":{"tetris":{...},"generic-ui":{...}}}          ← 任务书里提到的扩展形态
  ③ 旧格式：  {"slots":{"move":{"id","note"},...},"selected":"move","at":"..."}  → 只更新 tetris 的槽位

启动：python3 serve.py   （绑定 127.0.0.1:8099；重启用 `lsof -ti:8099 | xargs -r kill` 再起）
"""
import http.server
import json
import os
import socketserver
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
PROFILES = os.path.join(ROOT, 'profiles.json')
CHOICE = os.path.join(ROOT, 'choice.json')
PORT = 8099

# 内置 seed：只在 profiles.json 缺失时使用（两个内置 profile；结构通用，tetris 只是其中一个）
SEED = {
    'version': 2,
    'active': 'tetris',
    'profiles': [
        {
            'id': 'tetris',
            'name': '俄罗斯方块（tetris）',
            'luaName': 'SFX',
            'slots': [
                {'key': 'move', 'label': '左右移动', 'id': '50884', 'luaKey': 'move', 'budget': 'move',
                 'note': '按钮点击_轻_卡通_03'},
                {'key': 'rotate', 'label': '旋转', 'id': '50883', 'luaKey': 'rotate', 'budget': 'move',
                 'note': '按钮点击_轻_卡通_02'},
                {'key': 'lock', 'label': '落地锁定', 'id': '50872', 'luaKey': 'lock', 'budget': 'lock',
                 'note': '按钮点击_重_通用_01'},
                {'key': 'clear1', 'label': '消 1 行', 'id': '50917', 'budget': 'clear',
                 'note': '确认按钮_中'},
                {'key': 'clear2', 'label': '消 2 行', 'id': '40001', 'budget': 'clear',
                 'note': '战斗_治疗_回复_01（未试听·占位）'},
                {'key': 'clear3', 'label': '消 3 行', 'id': '40022', 'budget': 'clear',
                 'note': '战斗（未试听·占位）'},
                {'key': 'clear4', 'label': '消 4 行', 'id': '40054', 'budget': 'clear',
                 'note': '战斗（未试听·占位）'},
                {'key': 'over', 'label': '游戏结束', 'id': '50929', 'luaKey': 'over', 'budget': 'over',
                 'note': '提示性UI_轻_整理背包'},
                {'key': 'levelup', 'label': '升级', 'id': '40001', 'luaKey': 'level', 'budget': 'clear',
                 'note': '战斗_治疗_回复_01（未试听·占位）'},
            ],
        },
        {
            'id': 'generic-ui',
            'name': '通用界面音（generic-ui）',
            'luaName': 'SFX_UI',
            'slots': [
                {'key': 'click', 'label': '点击', 'id': '50880', 'budget': 'move',
                 'note': '按钮点击_重_通用_09'},
                {'key': 'hover', 'label': '悬停', 'id': '50870', 'budget': 'move',
                 'note': '按钮点击_重_卡通_06'},
                {'key': 'confirm', 'label': '确认', 'id': '50915', 'budget': 'lock',
                 'note': '确认按钮_重'},
                {'key': 'cancel', 'label': '取消', 'id': '50862', 'budget': 'move',
                 'note': '取消按钮_重'},
                {'key': 'error', 'label': '错误', 'id': '50934', 'budget': 'over',
                 'note': '提示性UI_中_错误_02'},
                {'key': 'success', 'label': '成功', 'id': '50917', 'budget': 'clear',
                 'note': '确认按钮_中'},
            ],
        },
    ],
}


def _now():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.') + \
        f'{datetime.now(timezone.utc).microsecond // 1000:03d}Z'


def _read_json(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _norm_slot(key, raw):
    """槽位归一：兼容 {key,label,id,note} / 旧 {id,note} / 纯 id 字符串。"""
    if isinstance(raw, str):
        raw = {'id': raw}
    if not isinstance(raw, dict):
        raw = {}
    out = {'key': str(raw.get('key') or key), 'label': str(raw.get('label') or raw.get('key') or key),
           'id': str(raw.get('id') or ''), 'note': str(raw.get('note') or '')}
    for k in ('luaKey', 'budget'):
        if raw.get(k):
            out[k] = str(raw[k])
    return out


def _norm_profile(pid, raw):
    """profile 归一：slots 支持 数组[{key,label,id}] / 旧映射 {key:{id,note}} 两种。"""
    raw = raw if isinstance(raw, dict) else {}
    slots_in = raw.get('slots') or []
    slots = []
    if isinstance(slots_in, dict):
        for k, v in slots_in.items():
            s = _norm_slot(k, v)
            s['key'] = k
            slots.append(s)
    else:
        for i, s in enumerate(slots_in):
            k = (s.get('key') if isinstance(s, dict) else None) or f'slot{i + 1}'
            slots.append(_norm_slot(k, s))
    return {'id': pid, 'name': str(raw.get('name') or pid),
            'luaName': str(raw.get('luaName') or 'SFX'), 'slots': slots}


def norm_state(raw):
    """任意历史形态 → v2 状态 {version, active, profiles:[...], at}。"""
    if not isinstance(raw, dict):
        raw = {}
    profiles = []
    pin = raw.get('profiles')
    if isinstance(pin, dict):
        profiles = [_norm_profile(str(pid), v) for pid, v in pin.items()]
    elif isinstance(pin, list):
        for i, p in enumerate(pin):
            if isinstance(p, dict):
                profiles.append(_norm_profile(str(p.get('id') or f'profile{i + 1}'), p))
    active = raw.get('active')
    if not profiles:
        # 旧格式（或空）：{slots:{...}} 视为 tetris 的槽位
        if isinstance(raw.get('slots'), dict):
            # 旧格式只有 {id,note}，label/luaKey/budget 必须从 seed 继承（否则导出的 Lua 字段名会退化）
            seed = next(p for p in SEED['profiles'] if p['id'] == 'tetris')
            merged, seen = [], set()
            for s in seed['slots']:
                slot = dict(s)
                v = raw['slots'].get(s['key'])
                vv = {'id': v} if isinstance(v, str) else (v if isinstance(v, dict) else {})
                if vv.get('id'):
                    slot['id'] = str(vv['id'])
                if vv.get('note'):
                    slot['note'] = str(vv['note'])
                merged.append(slot)
                seen.add(s['key'])
            for k, v in raw['slots'].items():          # 旧文件里有、seed 里没有的槽位：原样保留
                if k not in seen:
                    merged.append(_norm_slot(k, v))
            profiles = [_norm_profile('tetris', {**seed, 'slots': merged})]
            # 迁移不能把内置的其它 profile（generic-ui）弄丢
            profiles += [_norm_profile(p['id'], p) for p in SEED['profiles'] if p['id'] != 'tetris']
        if not active and isinstance(raw.get('selected'), str):
            active = 'tetris'
    if not profiles:
        return {'version': 2, 'active': SEED['active'], 'profiles':
                [_norm_profile(p['id'], p) for p in SEED['profiles']], 'at': _now()}
    ids = [p['id'] for p in profiles]
    if active not in ids:
        active = ids[0]
    return {'version': 2, 'active': active, 'profiles': profiles, 'at': raw.get('at') or _now()}


def load_state():
    """profiles.json 优先；缺失则 seed + 旧 choice.json 迁移，并立刻落盘（旧格式只被读一次）。"""
    st = _read_json(PROFILES)
    if st is None:
        legacy = _read_json(CHOICE)
        st = norm_state(legacy or {})
        if legacy is not None:
            print('[state] profiles.json 缺失，已从 choice.json 迁移（旧格式）', flush=True)
        save_state(st)
        return st
    return norm_state(st)


def write_json(path, data):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.replace(tmp, path)


def save_state(st):
    st = dict(st)
    st['version'] = 2
    st['at'] = _now()
    write_json(PROFILES, st)
    # choice.json：v2 + legacy 顶层（旧读者读 .slots/.selected 仍然有效）
    # legacy 顶层 slots 固定取 tetris profile（历史单游戏读者只认它的槽位键）；没有 tetris 则取第一个
    active = next((p for p in st['profiles'] if p['id'] == st['active']), st['profiles'][0])
    legacy_prof = next((p for p in st['profiles'] if p['id'] == 'tetris'), active)
    legacy_slots = {s['key']: {'id': s['id'], 'note': s.get('note', '')} for s in legacy_prof['slots']}
    choice = {
        'version': 2,
        'active': st['active'],
        'at': st['at'],
        'profiles': {p['id']: {'name': p['name'], 'luaName': p.get('luaName', 'SFX'),
                              'slots': {s['key']: {'id': s['id'], 'note': s.get('note', '')}
                                        for s in p['slots']}} for p in st['profiles']},
        'slots': legacy_slots,
        'selected': legacy_prof['slots'][0]['key'] if legacy_prof['slots'] else '',
    }
    write_json(CHOICE, choice)
    return st


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def _json(self, code, obj):
        out = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(out)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(out)

    def do_GET(self):
        if self.path.split('?')[0] == '/state':
            self._json(200, load_state())
            return
        super().do_GET()

    def do_POST(self):
        path = self.path.split('?')[0]
        if path != '/save':
            self.send_error(404)
            return
        try:
            n = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(n).decode('utf-8') or '{}'
            data = json.loads(body)
            cur = load_state()
            if isinstance(data, dict) and isinstance(data.get('profiles'), (dict, list)) and 'slots' not in data:
                merged = norm_state({**data, 'version': 2})
            elif isinstance(data, dict) and isinstance(data.get('slots'), dict) and 'profiles' not in data:
                # 旧格式：只更新正被编辑的 profile（默认 tetris）的槽位
                pid = data.get('profile') or 'tetris'
                profiles = list(cur['profiles'])
                idx = next((i for i, p in enumerate(profiles) if p['id'] == pid), None)
                if idx is None:
                    profiles.append(_norm_profile(pid, {'name': pid, 'slots': data['slots']}))
                else:
                    by_key = {s['key']: s for s in profiles[idx]['slots']}
                    for k, v in data['slots'].items():
                        if k in by_key:
                            by_key[k]['id'] = str((v or {}).get('id') or by_key[k]['id'])
                            if (v or {}).get('note'):
                                by_key[k]['note'] = str(v['note'])
                        else:
                            profiles[idx]['slots'].append(_norm_slot(k, v))
                merged = {**cur, 'profiles': profiles, 'active': data.get('active') or cur['active']}
            else:
                merged = norm_state({**data, 'version': 2} if isinstance(data, dict) else {})
            st = save_state(merged)
            active = next(p for p in st['profiles'] if p['id'] == st['active'])
            self._json(200, {'ok': True, 'saved': [PROFILES, CHOICE], 'active': st['active'],
                             'profiles': [p['id'] for p in st['profiles']],
                             'slots': len(active['slots']), 'at': st['at']})
            print(f'[save] active={st["active"]} profiles={[p["id"] for p in st["profiles"]]}', flush=True)
        except Exception as e:  # noqa: BLE001
            self._json(500, {'ok': False, 'error': str(e)})

    def log_message(self, fmt, *args):
        pass


if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    load_state()  # 启动即归一落盘一次（旧文件迁移在这里发生）
    with socketserver.TCPServer(('127.0.0.1', PORT), Handler) as httpd:
        print(f'[sfx-web] serving on http://127.0.0.1:{PORT}  (profiles.json + choice.json)', flush=True)
        httpd.serve_forever()
