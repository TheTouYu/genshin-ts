#!/usr/bin/env python3
"""name_check.py — 上滚 1–2 行，让命中行完整可见，抓 boundary_name.png + look JSON。"""
import json, os, subprocess, sys, time
REPO="/home/h/genshin-ts"; TOOLS=os.path.join(REPO,"tools","ys-editor")
WS=os.path.join(REPO,".scratch","gui-service","worldsvc.py"); OUT=os.path.join(REPO,".scratch","gui-service","evidence","realrun-20261021")
def run(a,t,timeout=30):
    t0=time.monotonic(); p=subprocess.run(a,capture_output=True,text=True,timeout=timeout,cwd=REPO)
    print("[name] %-14s rc=%-2d %7.1fms"%(t,p.returncode,(time.monotonic()-t0)*1000),flush=True)
    return p.returncode,p.stdout or "",p.stderr or "",round((time.monotonic()-t0)*1000,1)
def look(tag):
    p=os.path.join(OUT,tag+".json")
    rc,o,e,ms=run([sys.executable,WS,"look","--live","--backend","daemon-world","--no-cache","--json-out",p],"look/"+tag)
    try: d=json.load(open(p,encoding="utf-8"))
    except Exception: d=None
    return rc,d,ms
def rows(d):
    out=[]
    for o in (d or {}).get("objects") or []:
        b=o.get("bbox") or []; t=o.get("text") or []
        if len(b)>=4:
            x,y,w,h=[float(v) for v in b[:4]]
            if w>=800 and 30<=h<=300 and y>=0:
                out.append({"y":round(y,1),"bbox":[x,y,w,h],"text":t})
    return sorted(out,key=lambda r:r["y"])
def main():
    try: s=json.load(open(os.path.expanduser("~/.ys/session.json"),encoding="utf-8"))
    except Exception: s=None
    if not s or s.get("state")!="active": print("NAME-RESULT error=NO_SESSION"); return 2
    rc,d,ms=look("before")
    rs=rows(d); print("[name] before rows=%d first=%r"%(len(rs),rs[0]["text"] if rs else None),flush=True)
    for attempt in range(2):
        run([os.path.join(TOOLS,"ys-scroll"),"--at","900,500","--dir","up","--rows","2","--settle-ms","200","--no-hint"],"up%d"%attempt,30)
        rc,d,ms=look("after%d"%attempt)
        rs=rows(d)
        top=rs[0] if rs else None
        print("[name] after%d rows=%d top=%r"%(attempt,len(rs),top),flush=True)
        # 完整可见判据：首行 y>=80 且 text 里同时有名字、Lv.60、N天前
        if top and top["y"]>=80 and any("Lv.60" in str(x) for x in top["text"]) and any("天前" in str(x) for x in top["text"]):
            run([os.path.join(TOOLS,"ys-capture"),"latest","--out",os.path.join(OUT,"boundary_name.png"),"--encode-if-needed"],"capture",30)
            res={"top":top,"rows":rs,"free_text":(d or {}).get("free_text"),"frame":(d or {}).get("frame"),"attempt":attempt}
            json.dump(res,open(os.path.join(OUT,"name-check.json"),"w",encoding="utf-8"),ensure_ascii=False,indent=1)
            print("NAME-RESULT "+json.dumps({"top":top,"attempt":attempt},ensure_ascii=False),flush=True)
            return 0
    print("NAME-RESULT error=STILL_CLIPPED",flush=True); return 3
if __name__=="__main__": sys.exit(main())
