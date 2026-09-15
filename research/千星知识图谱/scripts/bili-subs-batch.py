#!/usr/bin/env python3
"""T02 · 批量取 B 站教程字幕 → 本地语料库

分两段（与 bili-search.py 同构）：
  ① probe  ：逐源探测字幕轨（全量，不抽样），落盘有无结论
  ② fetch  ：对有轨的取 CDN 正文 → Markdown（多分P 逐 P）

为什么要 probe 与 fetch 分开：**"没有字幕轨"和"探测失败"是两件事**，
混在一起会让"覆盖率"这个数字变得不可信。probe 的结论是二值可核的。

用法:
    bili-subs-batch.py --probe --cand search/candidates.json --out search/subs-probe.json --limit 50
    bili-subs-batch.py --fetch --out learn --probe search/subs-probe.json
"""
import argparse
import json
import os
import re
import subprocess
import sys
import urllib.request

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120 Safari/537.36")

PROBE_JS = r"""(async()=>{
  const bv=%s;
  const out={bvid:bv};
  try{
    const v=await fetch('https://api.bilibili.com/x/web-interface/view?bvid='+bv,{credentials:'include'}).then(r=>r.json());
    if(v.code!==0){ out.err='view:'+v.code; return JSON.stringify(out); }
    out.title=v.data.title; out.owner=(v.data.owner||{}).name; out.duration=v.data.duration;
    out.pages=[];
    for(const p of (v.data.pages||[])){
      let url=null, lan=null, err=null;
      try{
        const pv=await fetch('https://api.bilibili.com/x/player/wbi/v2?bvid='+bv+'&cid='+p.cid,{credentials:'include'}).then(r=>r.json());
        if(pv.code!==0){ err='player:'+pv.code; }
        else{
          const subs=(((pv.data||{}).subtitle||{}).subtitles)||[];
          if(subs.length){ url=subs[0].subtitle_url; lan=subs[0].lan_doc||subs[0].lan; }
        }
      }catch(e){ err='exc:'+String(e).slice(0,60); }
      out.pages.push({page:p.page, part:p.part, cid:p.cid, duration:p.duration,
                      url:url, lan:lan, err:err});
      await new Promise(r=>setTimeout(r,350));
    }
  }catch(e){ out.err='exc:'+String(e).slice(0,80); }
  return JSON.stringify(out);
})()"""


def _bh(script: str, timeout: int = 1800) -> subprocess.CompletedProcess:
    return subprocess.run(["browser-harness"], input=script, capture_output=True,
                          text=True, timeout=timeout)


def sanitize(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|]', "_", name).strip()[:60]


def read_ts(sec: float) -> str:
    s = int(sec)
    return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}"


def to_md(body: list, window: float = 45.0) -> str:
    out, buf, t0 = [], [], None
    for x in body:
        if t0 is None:
            t0 = x["from"]
        buf.append(x.get("content", ""))
        if x["to"] - t0 >= window:
            out.append(f"[{read_ts(t0)}] " + "".join(buf))
            buf, t0 = [], None
    if buf:
        out.append(f"[{read_ts(t0)}] " + "".join(buf))
    return "\n\n".join(out)


def fetch_subtitle(url: str) -> list:
    """字幕正文在 CDN，带 auth_key 签名 → 可脱离浏览器直接 GET。"""
    if url.startswith("//"):
        url = "https:" + url
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                               "Referer": "https://www.bilibili.com/"})
    with urllib.request.urlopen(req, timeout=40) as resp:
        return json.loads(resp.read().decode())["body"]


VIEW_JS = r"""(async()=>{
  const bv=%s;
  const out={bvid:bv};
  try{
    const v=await fetch('https://api.bilibili.com/x/web-interface/view?bvid='+bv,{credentials:'include'}).then(r=>r.json());
    if(v.code!==0){ out.err='view:'+v.code; return JSON.stringify(out); }
    out.title=v.data.title; out.owner=(v.data.owner||{}).name; out.duration=v.data.duration;
    out.pages=(v.data.pages||[]).map(p=>({page:p.page, part:p.part, cid:p.cid, duration:p.duration}));
  }catch(e){ out.err='exc:'+String(e).slice(0,80); }
  return JSON.stringify(out);
})()"""

SUBS_JS = r"""(async()=>{
  const items=%s;
  const out={};
  for(const it of items){
    try{
      const pv=await fetch('https://api.bilibili.com/x/player/wbi/v2?bvid='+it.bv+'&cid='+it.cid,{credentials:'include'}).then(r=>r.json());
      if(pv.code!==0){ out[it.cid]={err:'player:'+pv.code}; continue; }
      const subs=(((pv.data||{}).subtitle||{}).subtitles)||[];
      out[it.cid]= subs.length ? {url:subs[0].subtitle_url, lan:subs[0].lan_doc||subs[0].lan} : {url:null};
    }catch(e){ out[it.cid]={err:'exc:'+String(e).slice(0,60)}; }
    await new Promise(r=>setTimeout(r,250));
  }
  return JSON.stringify(out);
})()"""


def _run(script: str):
    p = _bh(script)
    if p.returncode != 0:
        return None
    for line in p.stdout.splitlines():
        for tag in ("__V__", "__S__"):
            if line.startswith(tag):
                return json.loads(line[len(tag):])
    return None


def cmd_probe(a) -> int:
    """两级探测：先视频级取分P（快），再页级探字幕（可任意分块）。

    为什么必须两级：**单个视频的分P数可以到 36**，一视频一循环会撞上 CDP
    Runtime.evaluate 超时（实测 22/21/36 分P 的三个源全失败）。按页分块后
    单次求值只跑 6 个请求，与视频长度解耦。
    """
    with open(a.cand, encoding="utf-8") as f:
        cand = json.load(f)
    bvids = [r["bvid"] for r in cand[:a.limit]]
    data = {}
    if os.path.exists(a.out):
        with open(a.out, encoding="utf-8") as f:
            data = json.load(f)

    # ---- 阶段 1：视频级 view ----
    need = [b for b in bvids if b not in data or data[b].get("err") or not data[b].get("pages")]
    print(f"阶段1 view：{len(bvids)} 个源，待取 {len(need)} 个")
    for i in range(0, len(need), 8):
        part = need[i:i + 8]
        script = f"""import json, time
bvids = {json.dumps(part)}
out = {{}}
for bv in bvids:
    goto_url('https://www.bilibili.com/video/' + bv)
    wait_for_load(); time.sleep(0.8)
    try:
        out[bv] = json.loads(js({json.dumps(VIEW_JS)} % json.dumps(bv)))
    except Exception as e:
        out[bv] = {{'bvid': bv, 'err': str(e)[:90]}}
print('__V__' + json.dumps(out, ensure_ascii=False))
"""
        got = _run(script)
        if got:
            data.update(got)
            with open(a.out, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=1)
        print(f"  · view 块 {i // 8 + 1}/{(len(need) + 7) // 8}")

    # ---- 阶段 2：页级探字幕 ----
    items, meta = [], {}
    for bv, v in data.items():
        if v.get("err"):
            continue
        for p in v.get("pages", []):
            if "url" not in p and not p.get("err"):
                items.append({"bv": bv, "cid": p["cid"]})
            meta[(bv, p["cid"])] = p
    print(f"阶段2 字幕：{len(items)} 个分P 待探")
    CH = 6
    for i in range(0, len(items), CH):
        part = items[i:i + CH]
        script = f"""import json, time
items = {json.dumps(part)}
goto_url('https://www.bilibili.com/video/' + items[0]['bv'])
wait_for_load(); time.sleep(0.8)
out = json.loads(js({json.dumps(SUBS_JS)} % json.dumps(part)))
print('__S__' + json.dumps(out, ensure_ascii=False))
"""
        got = _run(script)
        if got:
            for it in part:
                r = got.get(str(it["cid"])) or {}
                p = meta.get((it["bv"], it["cid"]))
                if p is not None:
                    p["url"] = r.get("url")
                    p["lan"] = r.get("lan")
                    if r.get("err"):
                        p["err"] = r["err"]
        with open(a.out, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        print(f"  · subs 块 {i // CH + 1}/{(len(items) + CH - 1) // CH}")

    n = len(data)
    withsub = sum(1 for v in data.values()
                  if not v.get("err") and any(p.get("url") for p in v.get("pages", [])))
    err = sum(1 for v in data.values() if v.get("err"))
    print(f"✓ 探测完成：{n} 个源，有轨 {withsub}，无轨 {n - withsub - err}，探测失败 {err} → {a.out}")
    return 0


def cmd_fetch(a) -> int:
    with open(a.probe, encoding="utf-8") as f:
        probe = json.load(f)
    os.makedirs(a.out, exist_ok=True)
    total_chars = 0
    ledger = []
    for bv, v in probe.items():
        if v.get("err"):
            ledger.append({"bvid": bv, "status": "probe_failed"})
            continue
        pages = [p for p in v.get("pages", []) if p.get("url")]
        if not pages:
            ledger.append({"bvid": bv, "status": "no_track", "title": v.get("title", "")})
            continue
        d = os.path.join(a.out, bv)
        os.makedirs(d, exist_ok=True)
        merged, chars = [], 0
        for p in pages:
            try:
                body = fetch_subtitle(p["url"])
            except Exception as e:
                print(f"  ! {bv} P{p['page']} 下载失败 {e}", file=sys.stderr)
                continue
            md = to_md(body)
            c = sum(len(x.get("content", "")) for x in body)
            chars += c
            head = (f"# P{p['page']} · {p['part']}\n\n"
                    f"时长 {p['duration']}s ｜ 字幕 {len(body)} 条 ｜ 字数 {c}\n\n")
            path = os.path.join(d, f"P{p['page']}-{sanitize(p['part'])}.md")
            with open(path, "w", encoding="utf-8") as f:
                f.write(head + md + "\n")
            merged.append(head + md)
        if merged:
            with open(os.path.join(d, "ALL.md"), "w", encoding="utf-8") as f:
                f.write(f"# {v.get('title','')}\n\n{bv} ｜ {v.get('owner','')} ｜ "
                        f"{len(pages)} 个有轨分P\n\n---\n\n" + "\n\n---\n\n".join(merged))
        total_chars += chars
        ledger.append({"bvid": bv, "status": "ok", "title": v.get("title", ""),
                       "owner": v.get("owner", ""), "pages_with_track": len(pages),
                       "chars": chars})
        print(f"  ✓ {bv} {len(pages)}P {chars:>6d} 字  {v.get('title','')[:40]}")
    with open(os.path.join(a.out, "..", "corpus-ledger.json"), "w", encoding="utf-8") as f:
        json.dump(ledger, f, ensure_ascii=False, indent=1)
    ok = [x for x in ledger if x["status"] == "ok"]
    print(f"\n✓ 语料：{len(ok)} 个源 / 共 {total_chars} 字 → {a.out}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", dest="probe_mode", action="store_true")
    ap.add_argument("--fetch", dest="fetch_mode", action="store_true")
    ap.add_argument("--cand")
    ap.add_argument("--out", required=True)
    ap.add_argument("--probe-file", dest="probe_file")
    ap.add_argument("--limit", type=int, default=50)
    ap.add_argument("--chunk", type=int, default=4, help="每个浏览器调用探测几个源（长视频要调小）")
    a = ap.parse_args()
    if a.probe_mode:
        a.out = a.out if a.out.endswith(".json") else a.out
        return cmd_probe(a)
    if a.fetch_mode:
        a.probe = a.probe_file or a.probe
        return cmd_fetch(a)
    print("✗ 需要 --probe 或 --fetch", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
