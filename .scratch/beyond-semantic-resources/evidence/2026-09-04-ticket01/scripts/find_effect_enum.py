import json, re, collections
manual=json.load(open('/tmp/research/ManualTextMapConfigData.json',encoding='utf-8'))
textmap=json.load(open('/tmp/research/TextMapCHS.json',encoding='utf-8'))
recs=[x for x in manual if str(x.get('textMapId','')).startswith('BeyondAssistantEditorConfigGlobal_configEnum_maps_')]
print('total recs',len(recs))
maps=collections.defaultdict(dict)
for item in recs:
    tid=item['textMapId']
    h=item.get('textMapContentTextMapHash')
    zh=textmap.get(str(h),'')
    m=re.match(r'^BeyondAssistantEditorConfigGlobal_configEnum_maps_(\d+)_mapTitle$', tid)
    if m:
        maps[int(m.group(1))]['title']=zh
        maps[int(m.group(1))]['title_tid']=tid
        continue
    m=re.match(r'^BeyondAssistantEditorConfigGlobal_configEnum_maps_(\d+)_map_(\d+)_textMapId_(\d+)$', tid)
    if m:
        mid=int(m.group(1)); idx=int(m.group(2)); suffix=int(m.group(3))
        maps[mid].setdefault('entries',[]).append((idx, suffix, zh, h, tid))
        continue
    # unmatched
    maps.setdefault(-1,{})
print('maps count',len(maps))
# search terms
terms=['造物不可见','定时触发技能','移动速率调整率','移动速率','特殊功能','单位状态','效果详细信息','初始持续时间','层数上限','定时触发','不可见']
for mid,info in sorted(maps.items()):
    if mid<0: continue
    title=info.get('title','')
    title_hit=[t for t in terms if t in title]
    entries=[]
    for idx,suffix,zh,h,tid in info.get('entries',[]):
        hits=[t for t in terms if t in zh]
        if hits:
            entries.append((idx,suffix,zh,h,tid,hits))
    if title_hit or entries:
        print('\n=== enum map',mid,'title=',repr(title),'title_hits=',title_hit,'entries=',len(info.get('entries',[])))
        for e in entries[:30]:
            print('  idx',e[0],'suffix',e[1],'zh=',e[2],'hash=',e[3],'tid=',e[4],'hits=',e[5])
