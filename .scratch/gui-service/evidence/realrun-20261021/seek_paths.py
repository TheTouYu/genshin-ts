#!/usr/bin/env python3
"""seek_paths.py — 拖动 / 滚动条 / 键盘 三组 seek 对照（55s）。"""
import json, os, subprocess, sys, time
REPO="/home/h/genshin-ts"; TOOLS=os.path.join(REPO,"tools","ys-editor")
WS=os.path.join(REPO,".scratch","gui-service","worldsvc.py"); OUT=os.path.join(REPO,".scratch","gui-service","evidence","realrun-20261021")
META={"Lv.60","在线","●在线","离线","今日内","● 今日内","好友／我的好友","我的好友","min:","max:","千星奇域游玩中","申请加入","前往其大厅"}
def run(a,t,timeout=60,env=None):
    t0=time.monotonic(); p=subprocess.run(a,capture_output=True,text=True,timeout=timeout,cwd=REPO,env={**os.environ,**(env or {})})
    ms=round((time.monotonic()-t0)*1000,1); print("[seek] %-16s rc=%-2d %7.1fms"%(t,p.returncode,ms),flush=True)
    return p.returncode,p.stdout or "",p.stderr or "",ms
def nm(t):
    for x in t:
        x=str(x).strip()
        if x and x not in META and not x.startswith(("min:","max:")) and len(x)<=8 and not any(c in x for c in "，。！？；：…、"): return x
def rows(d):
    o=[]
    for x in (d or {}).get("objects") or []:
        b=x.get("bbox") or []; t=x.get("text") or []
        if len(b)>=4:
            X,Y,W,H=[float(v) for v in b[:4]]
            if W>=800 and 30<=H<=300 and Y>=80:
                n=nm(t)
                if n: o.append((round(Y,1),n))
    return sorted(o)
def look(tag):
    p=os.path.join(OUT,tag+".json")
    rc,o,e,ms=run([sys.executable,WS,"look","--live","--backend","daemon-world","--fast","--no-cache","--json-out",p],"look/"+tag)
    try: d=json.load(open(p,encoding="utf-8"))
    except Exception: d=None
    st=(d or {}).get("state"); st=st.get("name") if isinstance(st,dict) else st
    return rc,d,st,ms
def find_friend(d):
    for x in (d or {}).get("objects") or []:
        b=x.get("bbox") or []; t=" ".join(x.get("text") or [])
        if "好友" in t and len(b)==4:
            X,Y,W,H=[float(v) for v in b[:4]]; return int(X+W/2),int(Y+H/2)
def probe(tag, action, d):
    b=rows(d); bf=b[0][1] if b else None
    ys=[y for y,_ in b]; dys=[q-p for p,q in zip(ys,ys[1:]) if 80<q-p<300]; pitch=sorted(dys)[len(dys)//2] if dys else 160
    rc,o,e,ms=action()
    info={}
    try: info=json.loads((o.strip().splitlines() or ["{}"])[-1])
    except Exception: pass
    rc2,d2,st2,ms2=look(tag)
    a=rows(d2); af=a[0][1] if a else None
    mp=info.get("moved_px"); est=(abs(float(mp))/pitch) if mp not in (None,0) else None
    lost=(af is None or af==bf or info.get("moved_confirmed") is False)
    print("[seek] %s before=%r after=%r moved_px=%r est=%s lost=%s"%(tag,bf,af,mp,round(est,2) if est else None,lost),flush=True)
    return {"tag":tag,"before_first":bf,"after_first":af,"moved_px":mp,"moved_confirmed":info.get("moved_confirmed"),
            "pitch_px":round(pitch,1),"rows_est":round(est,2) if est else None,"ms":ms,"look_ms":ms2,
            "rows_per_sec":round((est or 0)/max(0.001,(ms+ms2)/1000),2),"lost":bool(lost)}
def main():
    ap=__import__("argparse").ArgumentParser(); ap.add_argument("--deadline-s",type=float,default=42); a=ap.parse_args()
    try: s=json.load(open(os.path.expanduser("~/.ys/session.json"),encoding="utf-8"))
    except Exception: s=None
    if not s or s.get("state")!="active": print("SEEK-RESULT error=NO_SESSION"); return 2
    t0=time.monotonic(); left=lambda: a.deadline_s-(time.monotonic()-t0)
    rc,d,st,ms=look("s0")
    if not rows(d):
        run([os.path.join(TOOLS,"ys-esc")],"esc",30)
        for i in range(3):
            rc,d,st,ms=look("nav_p%d"%i)
            if st=="GAME_PAIMON": break
            time.sleep(0.3)
        c=find_friend(d)
        if c: run([os.path.join(TOOLS,"ys-pointer-click"),str(c[0]),str(c[1])],"click/friends",40)
        for i in range(4):
            rc,d,st,ms=look("nav_f%d"%i)
            if rows(d): break
            time.sleep(0.3)
    if not rows(d): print("SEEK-RESULT error=NO_ROWS state=%s"%st); return 3
    env={"YS_WIN":"0x1600001"}
    out=[]
    for rr in (10,30):
        if left()<10: break
        r=probe("drag%d"%rr, lambda rr=rr: run([os.path.join(TOOLS,"ys-scroll"),"--at","1800,700","--by","rows=%d"%rr,"--settle-ms","200","--no-hint"],"drag%d"%rr,60,env), d)
        out.append(r); d=json.load(open(os.path.join(OUT,"drag%d.json"%rr),encoding="utf-8")) if os.path.isfile(os.path.join(OUT,"drag%d.json"%rr)) else d
    for key,label in ((109,"PageDown"),(107,"End")):
        if left()<8: break
        r=probe("key%d"%key, lambda key=key: run(["bash","-c","YS_SLOT_ACTIVE=1 ydotool key %d:1 %d:0"%(key,key)],"key%d"%key,20), d)
        out.append(r); d=json.load(open(os.path.join(OUT,"key%d.json"%key),encoding="utf-8")) if os.path.isfile(os.path.join(OUT,"key%d.json"%key)) else d
    res={"schema":"gui.seek-paths/1","wall_s":round(time.monotonic()-t0,1),"probes":out}
    json.dump(res,open(os.path.join(OUT,"seek-paths.json"),"w",encoding="utf-8"),ensure_ascii=False,indent=1)
    print("SEEK-RESULT "+json.dumps(res,ensure_ascii=False),flush=True); return 0
if __name__=="__main__": sys.exit(main())
