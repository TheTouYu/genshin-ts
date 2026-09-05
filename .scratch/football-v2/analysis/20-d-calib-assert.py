import json, sys

def load(p): return json.load(open(p))

def scan(v, out):
    if isinstance(v, dict):
        for key in ('bInt','bId','bEnum','bString'):
            if key in v and isinstance(v[key], dict) and 'val' in v[key]:
                out.append((key, v[key]['val']))
        for x in v.values(): scan(x, out)
    elif isinstance(v, list):
        for x in v: scan(x, out)

def has_const(d, typ, val):
    out=[]; scan(d,out); return (typ,val) in out

def node_ids(d):
    return [n.get('genericId',{}).get('nodeId') for n in d['graph']['graph']['inner']['graph']['nodes']]

calib=load('/home/h/genshin-ts/.tmp_cube/fb20d-calib.json')
ui=load('/home/h/genshin-ts/.tmp_cube/fb20d-ui3.json')
checks=[]
def check(name,cond): checks.append((name,bool(cond)))

calib_graph=calib['graph']['graph']['inner']['graph']
ui_graph=ui['graph']['graph']['inner']['graph']
check('calib graph id', calib_graph['id']['id']==1082130440)
check('ui graph id', ui_graph['id']['id']==1073741837)
check('calib CFG_RUN', has_const(calib,'bId',1207959582))
check('calib loop end 19999', has_const(calib,'bInt',19999))
check('calib CAL_START', has_const(calib,'bString','CAL_START'))
check('calib CAL_DONE', has_const(calib,'bString','CAL_DONE'))
check('calib signal id', 1610612788 in node_ids(calib))
check('ui button id', has_const(ui,'bInt',1073741843) or has_const(ui,'bId',1073741843))
check('ui create instance 809 once', node_ids(ui).count(809)==1)
check('ui cast instance 817 once', node_ids(ui).count(817)==1)
check('ui no addCharacterSkill 395', 395 not in node_ids(ui))
check('ui no panel cast 816', 816 not in node_ids(ui))
check('ui whenEntityIsCreated 71', 71 in node_ids(ui))
check('ui skill cfg present', has_const(ui,'bId',1098907654))
check('ui fb20d_echo', has_const(ui,'bString','fb20d_echo'))
check('ui created print', has_const(ui,'bString','fb20d:created'))
check('ui cast print', has_const(ui,'bString','fb20d:cast'))
check('ui start print', has_const(ui,'bString','fb20d:start'))
check('ui done print', has_const(ui,'bString','fb20d:done'))
check('ui CAL_START tag', has_const(ui,'bString','CAL_START'))
check('ui CAL_DONE tag', has_const(ui,'bString','CAL_DONE'))

failed=[n for n,c in checks if not c]
print(f'assert {len(checks)-len(failed)}/{len(checks)}')
for n,c in checks: print(('PASS' if c else 'FAIL'), n)
sys.exit(1 if failed else 0)
