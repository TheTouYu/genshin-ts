import json, re
manual=json.load(open('/tmp/research/ManualTextMapConfigData.json',encoding='utf-8'))
textmap=json.load(open('/tmp/research/TextMapCHS.json',encoding='utf-8'))
keywords=['ROLE_STATUS','ROLESTATUS','UNIT_STATUS','UNITSTATUS','EFFECT','STATUS','SPECIAL','FUNCTION','BUFF','SKILL','ADD_STATUS','ADDSTATUS','STATE','CONFIG_ENUM','CONFIGGLOBAL','CONFIG_']
seen=set()
for item in manual:
    tid=str(item.get('textMapId',''))
    if not tid.startswith('BeyondAssistantEditor'): continue
    zh=textmap.get(str(item.get('textMapContentTextMapHash')),'')
    # skip known pure UI? no
    up=tid.upper()
    if any(k in up for k in keywords):
        if (tid,zh) in seen: continue
        seen.add((tid,zh))
        if any(t in zh for t in ['造物不可见','定时触发','移动速率','效果','状态','技能','持续时间','层数']):
            print(tid,'=>',zh)
print('total seen',len(seen))
