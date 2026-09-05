import json, sys, pathlib

def load(p):
    return json.load(open(p))

def scan(v, out):
    if isinstance(v, dict):
        if 'bInt' in v and isinstance(v['bInt'], dict) and 'val' in v['bInt']:
            out.append(('bInt', v['bInt']['val']))
        if 'bId' in v and isinstance(v['bId'], dict) and 'val' in v['bId']:
            out.append(('bId', v['bId']['val']))
        if 'bEnum' in v and isinstance(v['bEnum'], dict) and 'val' in v['bEnum']:
            out.append(('bEnum', v['bEnum']['val']))
        if 'bString' in v and isinstance(v['bString'], dict) and 'val' in v['bString']:
            out.append(('bString', v['bString']['val']))
        for x in v.values():
            scan(x, out)
    elif isinstance(v, list):
        for x in v:
            scan(x, out)

def has_const(d, typ, val):
    out=[]
    scan(d, out)
    return (typ,val) in out

calib = load('/home/h/genshin-ts/.tmp_cube/fb20d-calib.json')
ui = load('/home/h/genshin-ts/.tmp_cube/fb20d-ui.json')

checks = []
def check(name, cond):
    checks.append((name, bool(cond)))

# graph ids
calib_graph = calib['graph']['graph']['inner']['graph']
ui_graph = ui['graph']['graph']['inner']['graph']
check('calib graph id', calib_graph['id']['id'] == 1082130440)
check('ui graph id', ui_graph['id']['id'] == 1073741837)
# calib constants
check('calib CFG_RUN', has_const(calib, 'bId', 1207959582))
check('calib loop end 19999', has_const(calib, 'bInt', 19999))
check('calib CAL_START', has_const(calib, 'bString', 'CAL_START'))
check('calib CAL_DONE', has_const(calib, 'bString', 'CAL_DONE'))
check('calib signal id', any(n.get('genericId',{}).get('nodeId')==1610612788 for n in calib['graph']['graph']['inner']['graph']['nodes']))
# ui constants
check('ui skill cfg', has_const(ui, 'bId', 1098907654))
check('ui button id', has_const(ui, 'bInt', 1073741843) or has_const(ui, 'bId', 1073741843))
check('ui slot12? should be slot1 3121', has_const(ui, 'bEnum', 3121))
check('ui not slot12 3132', not has_const(ui, 'bEnum', 3132))
check('ui fb20d_echo name', has_const(ui, 'bString', 'fb20d_echo'))
check('ui cast print', has_const(ui, 'bString', 'fb20d:cast'))
check('ui start print', has_const(ui, 'bString', 'fb20d:start'))
check('ui done print', has_const(ui, 'bString', 'fb20d:done'))
check('ui CAL_START tag', has_const(ui, 'bString', 'CAL_START'))
check('ui CAL_DONE tag', has_const(ui, 'bString', 'CAL_DONE'))

failed = [n for n,c in checks if not c]
print(f'assert {len(checks)-len(failed)}/{len(checks)}')
for n,c in checks:
    print(('PASS' if c else 'FAIL'), n)
sys.exit(1 if failed else 0)
