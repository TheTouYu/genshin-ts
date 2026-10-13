#!/usr/bin/env python3
"""input-probe 构建器：组装 qxqy 存档 + 无头冒烟（playRun）"""
import json, subprocess, sys, tempfile, os

ROOT = '/home/h/genshin-ts/workspace/input-probe'
CLI = '/home/h/miliastra-beyond-simulator/studio/cli.mjs'
SAVE = os.path.join(ROOT, 'input-probe.save.json')

def run_cli(job, timeout=120):
    inp, outp = tempfile.mktemp(suffix='.json'), tempfile.mktemp(suffix='.json')
    with open(inp, 'w', encoding='utf-8') as f:
        json.dump(job, f, ensure_ascii=False)
    r = subprocess.run(['node', CLI, '--in', inp, '--out', outp],
                       capture_output=True, text=True, timeout=timeout)
    os.unlink(inp)
    if r.returncode != 0:
        print('CLI FAIL', r.returncode, r.stderr[:800]); sys.exit(2)
    out = json.load(open(outp, encoding='utf-8')); os.unlink(outp)
    if not out.get('ok'):
        print('JOB FAIL:', json.dumps(out.get('error'))[:800]); sys.exit(3)
    return out['data']

def make_node(kind, nid, guid, name, size=None):
    """按四平台布局构造节点（layoutSchemaVersion=2）"""
    tf = {}
    for plat in ['KEYBOARD', 'TOUCHSCREEN', 'CONTROLLER_CONSOLE', 'CONTROLLER_MOBILE']:
        tf[plat] = {
            'scale': {'x': 1, 'y': 1, 'z': 1},
            'rotation': {'x': 0, 'y': 0, 'z': 0},
            'anchorMin': {'x': 0.5, 'y': 0.5},
            'anchorMax': {'x': 0.5, 'y': 0.5},
            'offset': {'x': 0, 'y': 0},
            'size': {'x': (size or (100, 100))[0], 'y': (size or (100, 100))[1]},
            'pivot': {'x': 0.5, 'y': 0.5},
        }
    node = {
        'id': nid, 'guid': guid, 'kind': kind, 'name': name,
        'active': True, 'visible': True, 'canControllerFocus': False,
        'syncAllDevices': True, 'transformByPlatform': tf, 'children': [],
        'scriptMappingIds': [],
    }
    if kind == 'container':
        node['isolateNavigation'] = False
        node['disableKeyEventPassthrough'] = False
        node['disableCursorEventPassthrough'] = False
        node['showCursor'] = False
        node['giaRaw'] = {'genericField501': 0, 'footerField505': 0}
    elif kind == 'textbox':
        node.update({
            'fontSize': 20, 'adaptiveFontSize': False, 'minimumFontSize': 20,
            'fontColor': 4294967295, 'bgColor': 0, 'enableOutline': True,
            'outlineColor': 858993459, 'horizontalAlignment': 'Middle',
            'verticalAlignment': 'Middle', 'text': '',
        })
        node['giaRaw'] = {'genericField501': 0, 'footerField505': 0, 'textField501': 20,
                          'textField503': 12, 'textAlign': 0, 'textField511': 1}
    elif kind == 'button':
        node.update({
            'raycastTarget': True, 'interactable': True, 'clickAudioId': 50888,
            'unavailableChildId': None, 'hoverChildId': None,
            'pressedChildId': None, 'selectedChildId': None,
        })
        node['giaRaw'] = {'genericField501': 0, 'footerField505': 0}
    return node

def stretch(node):
    for tf in node['transformByPlatform'].values():
        tf['anchorMin'] = {'x': 0, 'y': 0}
        tf['anchorMax'] = {'x': 1, 'y': 1}
        tf['offset'] = {'x': 0, 'y': 0}
        tf['size'] = {'x': 0, 'y': 0}
    return node

def build_save(lua_src):
    base = run_cli({'cmd': 'get'})
    # ---- 服务端工程：sc1 > n1「探针层」(stretch) ----
    n1 = stretch(make_node('container', 'n1', 1073741851, '探针层'))
    n1['showCursor'] = True
    sc1 = base['root']
    sc1['children'] = [n1]
    server = {
        'layoutSchemaVersion': 2, 'version': 1,
        'meta': {'assetType': 'server-control-template', 'name': 'input-probe 界面',
                 'sourceFormat': 'authoring', 'sourceFile': ''},
        'canvasId': 'mobile-16-9', 'selectedId': 'n1',
        'root': sc1,
    }
    # ---- 客户端模板工程：根子节点=可实例化模板（prefabIndex=guid）----
    csc1 = make_node('server-container', 'sc1', 1073741850, '客户端控件模板')
    csc1['children'] = [
        make_node('textbox', 't2', 1073742301, 'tx',  size=(60, 20)),
        make_node('button',  't3', 1073742302, 'btn', size=(100, 40)),
        make_node('cursor',  't5', 1073742304, 'cursor', size=(100, 100)),
    ]
    client = {
        'layoutSchemaVersion': 2, 'version': 1,
        'meta': {'assetType': 'client-control-template', 'name': 'input-probe 模板',
                 'sourceFormat': 'authoring', 'sourceFile': ''},
        'canvasId': 'mobile-16-9', 'selectedId': 't5',
        'root': csc1,
    }
    return {
        'format': 'qxqy-simulator-save', 'version': 4,
        'meta': {'name': 'input-probe'},
        'activeAssetType': 'server-control-template',
        'serverLogic': {'version': 1, 'rules': []},
        'controlGuidChanges': [], 'scriptSync': None,
        'assets': {
            'server': server, 'client': client,
            'scripts': [{
                'id': 'main', 'guid': 1073742400, 'path': 'main',
                'source': lua_src, 'controlId': 'n1',
                'controlAsset': 'server-control-template',
            }],
        },
    }

def main():
    lua_src = open(os.path.join(ROOT, 'lua', 'main.lua'), encoding='utf-8').read()
    save = build_save(lua_src)
    # 校验：cli 能吃下这个存档并回出工程
    got = run_cli({'project': save, 'cmd': 'get', 'canvasId': 'mobile-16-9'})
    print('roundtrip ok, canvas:', got['canvasId'], 'nodes:', len(got['tree']))
    # 冒烟：playRun 120 帧（>1s 让 OnUpdate 节流跑几轮）
    smoke = run_cli({'project': save, 'cmd': 'playRun', 'frames': 120, 'canvasId': 'mobile-16-9'})
    logs = [l.get('text', str(l)) for l in smoke.get('logs', [])]
    print('--- 冒烟日志 ---')
    for l in logs[:20]:
        print(' ', l)
    json.dump(save, open(SAVE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('存档写入', SAVE, f'({os.path.getsize(SAVE)} bytes)')

if __name__ == '__main__':
    main()
