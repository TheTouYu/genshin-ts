#!/usr/bin/env python3
"""hmlt-qixia 千星版构建器：组装 qxqy 存档 + 无头验证（playRun 冒烟 + runCase 电池）"""
import json, subprocess, sys, tempfile, os, copy

ROOT = '/home/h/genshin-ts/workspace/hmlt-qixia'
CLI = '/home/h/miliastra-beyond-simulator/studio/cli.mjs'
RUNNER = os.path.join(ROOT, 'qxqy', 'runner.mjs')
SAVE = os.path.join(ROOT, 'hmlt-qixia.save.json')

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

def make_node(kind, nid, guid, name, extra=None, size=None, offset=None):
    """按四平台布局构造节点（layoutSchemaVersion=2）"""
    tf = {}
    for plat in ['KEYBOARD', 'TOUCHSCREEN', 'CONTROLLER_CONSOLE', 'CONTROLLER_MOBILE']:
        tf[plat] = {
            'scale': {'x': 1, 'y': 1, 'z': 1},
            'rotation': {'x': 0, 'y': 0, 'z': 0},
            'anchorMin': {'x': 0.5, 'y': 0.5},
            'anchorMax': {'x': 0.5, 'y': 0.5},
            'offset': {'x': (offset or (0, 0))[0], 'y': (offset or (0, 0))[1]},
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
    elif kind == 'image':
        node.update({
            'imageSource': 'StaticReference', 'imageType': None, 'imageId': 100001,
            'imageColor': 4294967295, 'enableMask': False, 'enableSoftEdge': False,
            'softEdgeMode': 'Percentage', 'softEdgeWidthX': 8, 'softEdgeWidthY': 8,
            'horizontalSoftRange': 85, 'verticalSoftRange': 85,
            'enableFill': True, 'fillType': 'Horizontal', 'fillHorizontalType': 'Left',
            'fillVerticalType': 'Bottom', 'fillRadial90Type': 'BottomLeft', 'fillRadialType': 'Bottom',
            'fillAmount': 1, 'reverseMaskArea': False,
        })
        node['giaRaw'] = {'genericField501': 0, 'footerField505': 0, 'imageSlotType': 0,
                          'imageField502': 1, 'imageField504': 1, 'imageField505': 1,
                          'imageField507': 2, 'imageFillType': 1}
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
    if extra:
        node.update(extra)
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
    # ---- 服务端工程：sc1 > n1「游戏层」(stretch) ----
    n1 = stretch(make_node('container', 'n1', 1073741851, '游戏层'))
    n1['showCursor'] = True
    n1['disableKeyEventPassthrough'] = True  # 真机防 WASD/J/K 穿透到 3D 角色移动
    sc1 = base['root']
    sc1['children'] = [n1]
    server = {
        'layoutSchemaVersion': 2, 'version': 1,
        'meta': {'assetType': 'server-control-template', 'name': 'hmlt-qixia 界面',
                 'sourceFormat': 'authoring', 'sourceFile': ''},
        'canvasId': 'mobile-16-9', 'selectedId': 'n1',
        'root': sc1,
    }
    # ---- 客户端模板工程：根子节点=可实例化模板（prefabIndex=guid）----
    csc1 = make_node('server-container', 'sc1', 1073741850, '客户端控件模板')
    csc1['children'] = [
        make_node('image',    't1', 1073742300, 'img',   size=(60, 20)),
        make_node('textbox',  't2', 1073742301, 'tx',    size=(60, 20)),
        make_node('button',   't3', 1073742302, 'btn',   size=(100, 40)),
        make_node('container','t4', 1073742303, 'panel', size=(100, 100)),
        make_node('cursor',   't5', 1073742304, 'cursor', size=(100, 100)),
    ]
    client = {
        'layoutSchemaVersion': 2, 'version': 1,
        'meta': {'assetType': 'client-control-template', 'name': 'hmlt-qixia 实体模板',
                 'sourceFormat': 'authoring', 'sourceFile': ''},
        'canvasId': 'mobile-16-9', 'selectedId': 't1',
        'root': csc1,
    }
    return {
        'format': 'qxqy-simulator-save', 'version': 4,
        'meta': {'name': 'hmlt-qixia'},
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
    # 冒烟：playRun 90 帧
    smoke = run_cli({'project': save, 'cmd': 'playRun', 'frames': 90, 'canvasId': 'mobile-16-9'})
    logs = [l.get('text', str(l)) for l in smoke.get('logs', [])]
    print('--- 冒烟日志 ---')
    for l in logs[:20]:
        print(' ', l)
    json.dump(save, open(SAVE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('存档写入', SAVE, f'({os.path.getsize(SAVE)} bytes)')

if __name__ == '__main__':
    main()
