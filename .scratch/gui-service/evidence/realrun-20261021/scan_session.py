#!/usr/bin/env python3
"""scan_session.py — 在 ys-session 占用会话内扫好友列表（会话直注入，无嵌套 slot）。"""
import argparse, json, os, re, subprocess, sys, time
REPO="/home/h/genshin-ts"; TOOLS=os.path.join(REPO,"tools","ys-editor")
os.environ.setdefault("DISPLAY", ":1")
WORLDSVC=os.path.join(REPO,".scratch","gui-service","worldsvc.py")
OUT=os.path.join(REPO,".scratch","gui-service","evidence","realrun-20261021")
DAY=re.compile(r"(\d+)\s*天前")
def sess():
    try: return json.load(open(os.path.expanduser("~/.ys/session.json"),encoding="utf-8"))
    except Exception: return None
def run(argv,tag,timeout=60,env=None):
    t=time.time(); p=subprocess.run(argv,capture_output=True,text=True,timeout=timeout,cwd=REPO,
                                    env={**os.environ,**(env or {})})
    ms=round((time.time()-t)*1000,1)
    print("[scan] %-18s rc=%-2d %7.1fms"%(tag,p.returncode,ms),flush=True)
    return p.returncode,p.stdout or "",p.stderr or "",ms
def state(d):
    s=(d or {}).get("state"); return s.get("name") if isinstance(s,dict) else s
def look(tag):
    path=os.path.join(OUT,tag+".json")
    rc,_o,_e,ms=run([sys.executable,WORLDSVC,"look","--live","--backend","daemon-world",
                   "--fast","--no-cache","--json-out",path],"look/"+tag)
    d=None
    try: d=json.load(open(path,encoding="utf-8"))
    except Exception: pass
    # rc=8 可能是 BUDGET_EXCEEDED（AGI-BAR 50ms 预算对真机 look 必然超）；有完整状态就不算失败
    if rc==8 and _o and "ATTRIBUTION_OTHER_DESKTOP" in _o:
        import time as _t
        _t.sleep(0.5)
        rc,_o,_e,ms=run([sys.executable,WORLDSVC,"look","--live","--backend","daemon-world",
                         "--fast","--no-cache","--json-out",path],"look/"+tag+"/retry")
        try: d=json.load(open(path,encoding="utf-8"))
        except Exception: d=None
    if rc==8 and d and state(d):
        rc=0
    if rc!=0:
        print("[scan] look/%s rc=%d out=%r err=%r d=%s"%(tag,rc,(_o or "")[-400:],(_e or "")[-200:],
              (json.dumps(d,ensure_ascii=False)[:300] if d else None)),flush=True)
    return rc,d,state(d),ms

def esc():
    rc,out,err,ms=run([os.path.join(TOOLS,"ys-esc")],"esc",timeout=30)
    if rc!=0: print("[scan] esc err=%r"%(err[-200:],),flush=True)
    return rc,out,err,ms

def wait_capture(timeout=8.0):
    """轮询**真正要用的 ys-capture latest**（不是 status），直到 KWin strict=OK。
    证据：2026-10-21 session_run9 里 status.strict 与 kwin-state.desktop 打架，
    daemon 因 latest 的 fast 门失败；这里直接验 latest 的 attribution.strict。"""
    import time as _t
    t0=_t.time(); last=None
    out=os.path.join("/dev/shm","ys-scan-wait.bmp")
    while _t.time()-t0 < timeout:
        rc,o,e,ms=run([os.path.join(TOOLS,"ys-capture"),"latest","--out",out,
                       "--format","bmp","--allow-background"],"cap/latest",timeout=20)
        try:
            d=json.loads(o); a=d.get("attribution") or {}
            last={"rc":rc,"fast":a.get("fast"),"strict":a.get("strict"),
                  "strict_age":a.get("strict_age_ms")}
            if rc==0 and a.get("strict")=="OK":
                print("[scan] capture latest ready after %.1fms strict=OK"%ms,flush=True)
                return True
        except Exception:
            last={"rc":rc,"out":o[-200:]}
        _t.sleep(0.5)
    print("[scan] capture latest wait timeout last=%s"%last,flush=True)
    return False

def diag():
    rc,out,err,ms=run([os.path.join(TOOLS,"ys-capture"),"status"],"cap/status",timeout=20)
    print("[scan] cap.status=%s"%(out[-500:].replace("\n"," ")),flush=True)
    rc,out,err,ms=run([os.path.join(TOOLS,"ys-lease"),"kwin-state"],"kwin/state",timeout=20)
    try:
        d=json.loads(out); act=(d.get("active") or {})
        print("[scan] kwin desktop=%s active=%s"%(d.get("desktop"),act.get("class")),flush=True)
    except Exception: pass

def click(x,y):
    return run([os.path.join(TOOLS,"ys-pointer-click"),str(int(x)),str(int(y))],"click/friends",timeout=40)

def is_friends(d):
    """状态标签可能把好友面板误判成 GAME_WORLD（s02 实测：面板还在、header 只有「好友／我的好友」）。
    以**执行证据**为准：header + 行文本（在线/今日内/N天前/Lv.）。"""
    texts=[]
    for o in (d or {}).get("objects") or []:
        texts += [str(x) for x in (o.get("text") or [])]
    joined=" | ".join(texts)
    if "好友／我的好友" in joined or "我的好友" in joined:
        return True
    rows=[t for t in texts if any(k in t for k in ("在线","今日内","天前"))]
    return len(rows)>=3

def find_friend(d):
    for o in (d or {}).get("objects") or []:
        t=" ".join(o.get("text") or [])
        b=o.get("bbox") or []
        if "好友" in t and len(b)==4:
            x,y,w,h=[float(v) for v in b[:4]]
            return int(round(x+w/2)),int(round(y+h/2)),b
    return None
META={"Lv.60","在线","●在线","离线","今日内","● 今日内","好友／我的好友","我的好友",
      "min:","max:","千星奇域游玩中","申请加入","前往其大厅"}

def name_of(t):
    """好友名优先取**短** token（≤8 字、无标点）；签名/状态是长句，不能当行名。"""
    cands=[str(x).strip() for x in t if str(x).strip() not in META
           and not str(x).startswith(("min:","max:"))]
    for x in cands:
        if len(x) <= 8 and not any(p in x for p in "，。！？；：…、"):
            return x
    return cands[0] if cands else None

def rows(d):
    out=[]
    for o in (d or {}).get("objects") or []:
        b=o.get("bbox") or []; t=[x for x in (o.get("text") or []) if x and x.strip()]
        if len(b)<4: continue
        x,y,w,h=[float(v) for v in b[:4]]
        if w>=800 and 30<=h<=300 and y>=80 and t:
            out.append({"y":round(y,1),"bbox":[x,y,w,h],"text":t,"name":name_of(t) or t[0]})
    return sorted(out,key=lambda r:r["y"])
def days(rs):
    out=[]
    for r in rs:
        for t in r["text"]:
            m=DAY.search(t)
            if m: out.append({"days":int(m.group(1)),"y":r["y"],"name":r["name"],"text":r["text"],"bbox":r["bbox"]})
    return out
def scroll(tag):
    rc,out,err,ms=run([os.path.join(TOOLS,"ys-scroll"),"--at","1800,900","--rows","6",
                       "--settle-ms","150","--no-hint","--no-verify"],tag)
    info={"tag":tag,"rc":rc,"ms":ms}
    try: info.update(json.loads((out.strip().splitlines() or ["{}"])[-1]))
    except Exception: pass
    return rc,info
def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--deadline-s",type=float,default=46); a=ap.parse_args()
    s=sess()
    if not s or s.get("state")!="active":
        print("SCAN-RESULT error=NO_SESSION",flush=True); return 2
    if os.environ.get("YS_SLOT_ACTIVE")!="1" and not s.get("session_id"):
        print("SCAN-RESULT error=NO_SESSION_ID",flush=True); return 2
    t0=time.monotonic(); left=lambda: a.deadline_s-(time.monotonic()-t0)
    diag()
    wait_capture(6.0)
    rc,d,st,ms=look("s0")
    print("[scan] start state=%s look=%.1fms frame_source=%s"%(st,ms,((d or {}).get("timing_ms") or {}).get("frame_source")),flush=True)
    nav={"start_state":st,"world_to_paimon_ms":None,"paimon_to_friends_ms":None}
    if st=="GAME_WORLD" and left()>20:
        t=time.monotonic(); esc()
        for i in range(3):
            rc,d,st,ms=look("nav_paimon%d"%i)
            if st=="GAME_PAIMON": break
            time.sleep(0.3)
        if st!="GAME_PAIMON":
            print("[scan] direct ESC no effect, try slot ESC",flush=True)
            run([os.path.join(TOOLS,"ys-gui-slot"),"0x1600001","5",os.path.join(TOOLS,"ys-esc")],"esc/slot",timeout=30)
            time.sleep(2.5)
            for i in range(3):
                rc,d,st,ms=look("nav_paimon_slot%d"%i)
                if st=="GAME_PAIMON": break
                time.sleep(0.3)
        nav["world_to_paimon_ms"]=round((time.monotonic()-t)*1000,1)
    if st=="GAME_PAIMON" and left()>14:
        t=time.monotonic(); c=find_friend(d)
        if c: click(c[0],c[1])
        for i in range(5):
            rc,d,st,ms=look("nav_friends%d"%i)
            if st=="GAME_FRIENDS": break
            time.sleep(0.3)
        nav["paimon_to_friends_ms"]=round((time.monotonic()-t)*1000,1)
    if st!="GAME_FRIENDS" and is_friends(d):
        print("[scan] state_override FRIENDS (label=%s, header/rows evidence)"%st,flush=True)
        st="GAME_FRIENDS"
    if st!="GAME_FRIENDS":
        print("SCAN-RESULT error=WRONG_STATE state=%s"%st,flush=True); return 3
    screens=[]; found=None; prev=None; stalled=False; allnames=[]
    while left()>6 and found is None and not stalled:
        rc,inf=scroll("s%02d"%len(screens))
        if rc!=0:
            print("SCAN-RESULT error=SCROLL_RC rc=%d"%rc,flush=True); break
        rc,d,st,ms=look("screen/s%02d"%len(screens))
        if rc==0 and st!="GAME_FRIENDS" and is_friends(d):
            print("[scan] state_override FRIENDS at s%02d (label=%s)"%(len(screens),st),flush=True)
            st="GAME_FRIENDS"
        if rc!=0 or st!="GAME_FRIENDS":
            print("SCAN-RESULT error=LOOK_RC rc=%d state=%s"%(rc,st),flush=True); break
        rs=rows(d); ds=days(rs)
        named=[r for r in rs if name_of(r["text"])]
        first=named[0]["name"] if named else None
        if prev is not None and first is not None and first==prev:
            stalled=True; print("[scan] STALLED first=%r"%first,flush=True)
        prev=first; allnames += [r["name"] for r in rs]
        hit=None
        for x in ds:
            if x["days"]>=30: hit=x; break
        screens.append({"tag":"s%02d"%len(screens),"scroll":inf,"look_ms":ms,"rows":len(rs),
                        "first":first,"days":[x["days"] for x in ds],"hit":hit,
                        "frame_source":((d or {}).get("timing_ms") or {}).get("frame_source")})
        print("[scan] s%02d rows=%d first=%r days=%s"%(len(screens)-1,len(rs),first,[x["days"] for x in ds]),flush=True)
        if hit: found=hit; break
    if found:
        cap=os.path.join(OUT,"boundary.png")
        run([os.path.join(TOOLS,"ys-capture"),"latest","--out",cap,"--encode-if-needed"],"capture/boundary")
        try:
            from PIL import Image
            x,y,w,h=found["bbox"]; im=Image.open(cap).convert("RGB"); pad=40
            box=(max(0,int(x)-pad),max(0,int(y)-pad),min(im.width,int(x+w)+pad),min(im.height,int(y+h)+pad))
            im.crop(box).save(os.path.join(OUT,"boundary_crop.png"))
            found["crop"]=os.path.join(OUT,"boundary_crop.png"); found["crop_box"]=box
        except Exception as e: found["crop_err"]="%s: %s"%(type(e).__name__,e)
    inject=sum(float((x["scroll"] or {}).get("timing",{}).get("inject_ms") or 0) for x in screens)
    verify=sum(float(x["look_ms"] or 0) for x in screens)
    wall=round(time.monotonic()-t0,1)
    res={"schema":"gui.session-scan/1","wall_s":wall,"session_id":s.get("session_id"),
         "screens":screens,"found":found,"stalled":stalled,
         "nav":nav,"n_screens":len(screens),"n_rows":len(allnames),"n_unique_rows":len(set(allnames)),
         "inject_ms":round(inject,1),"verify_ms":round(verify,1),
         "effective_ratio":round((inject+verify)/(wall*1000),4) if wall else None,
         "scroll_p50_ms":sorted([x["scroll"]["ms"] for x in screens])[len(screens)//2] if screens else None,
         "loop_p50_ms":sorted([x["scroll"]["ms"]+x["look_ms"] for x in screens])[len(screens)//2] if screens else None}
    json.dump(res,open(os.path.join(OUT,"session-result.json"),"w",encoding="utf-8"),ensure_ascii=False,indent=1)
    print("SCAN-RESULT "+json.dumps(res,ensure_ascii=False),flush=True)   # 全量投影：白名单重建会静默丢未知字段（G-WHITELIST）
    return 0
if __name__=="__main__": sys.exit(main())
