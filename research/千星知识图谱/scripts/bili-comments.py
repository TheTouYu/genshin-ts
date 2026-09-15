#!/usr/bin/env python3
"""T01 · B站评论区采集（K 轴「邪修/隐秘知识/实战教训」的富矿）

通道实测（2026-09-15）：`x/v2/reply/main` 在浏览器内 + 登录态下稳定 code:0
（直连 curl 恒 -352，同 bilibili-learn 技能记载）。

为什么值得单独一票：**实战教训、失败复盘、玩家视角吐槽不在视频里，在评论里**。
实测样本 BV11d6rB4Ejc 首条热评 = 《方神2》作者完整复盘（项目管理崩坏/性能妥协/日志开销）。

用法: bili-comments.py --bvids search/candidates-bvids.txt --out search/comments.json --limit 50
"""
import argparse
import json
import os
import subprocess
import sys
import time

JS = r"""(async()=>{
  const bv=%s;
  const out={bvid:bv};
  const v=await fetch('https://api.bilibili.com/x/web-interface/view?bvid='+bv,{credentials:'include'}).then(r=>r.json());
  if(v.code!==0){ out.err='view:'+v.code; return JSON.stringify(out); }
  out.aid=v.data.aid; out.title=v.data.title;
  out.stat={view:v.data.stat.view,reply:v.data.stat.reply,danmaku:v.data.stat.danmaku,favorite:v.data.stat.favorite,like:v.data.stat.like};
  const r=await fetch('https://api.bilibili.com/x/v2/reply/main?type=1&oid='+out.aid+'&mode=3&next=0',{credentials:'include'}).then(x=>x.json());
  if(r.code!==0){ out.err='reply:'+r.code+' '+r.message; return JSON.stringify(out); }
  const d=r.data||{};
  out.cursor={all:(d.cursor||{}).all_count};
  out.replies=((d.replies)||[]).map(x=>({
    like:x.like, rcount:x.rcount, ctime:x.ctime,
    user:((x.member)||{}).uname,
    msg:((x.content)||{}).message,
    sub:(((x.replies)||[]).slice(0,3)).map(y=>({like:y.like,user:((y.member)||{}).uname,msg:((y.content)||{}).message}))
  }));
  out.hots=((d.hots)||[]).map(x=>({like:x.like,user:((x.member)||{}).uname,msg:((x.content)||{}).message}));
  return JSON.stringify(out);
})()"""


def _bh(script: str, timeout: int = 1800) -> subprocess.CompletedProcess:
    return subprocess.run(["browser-harness"], input=script, capture_output=True,
                          text=True, timeout=timeout)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bvids", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--limit", type=int, default=50, help="最多抓几个视频的评论")
    ap.add_argument("--chunk", type=int, default=5)
    a = ap.parse_args()

    with open(a.bvids, encoding="utf-8") as f:
        bvids = [ln.strip() for ln in f if ln.strip().startswith("BV")][:a.limit]

    data = {}
    if os.path.exists(a.out):
        with open(a.out, encoding="utf-8") as f:
            data = json.load(f)
    todo = [b for b in bvids if b not in data or data[b].get("err")]
    print(f"目标 {len(bvids)} 个，待抓 {len(todo)} 个")

    for i in range(0, len(todo), a.chunk):
        part = todo[i:i + a.chunk]
        script = f"""import json, time
bvids = {json.dumps(part)}
out = {{}}
for bv in bvids:
    goto_url('https://www.bilibili.com/video/' + bv)
    wait_for_load(); time.sleep(1.6)
    try:
        out[bv] = json.loads(js({json.dumps(JS)} % json.dumps(bv)))
    except Exception as e:
        out[bv] = {{'bvid': bv, 'err': str(e)[:120]}}
print('__C__' + json.dumps(out, ensure_ascii=False))
"""
        p = _bh(script)
        if p.returncode != 0:
            print(f"  ! 块 {i // a.chunk + 1} 失败", file=sys.stderr)
            continue
        for line in p.stdout.splitlines():
            if line.startswith("__C__"):
                data.update(json.loads(line[len("__C__"):]))
        with open(a.out, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        ok = sum(1 for v in data.values() if not v.get("err"))
        print(f"  · 块 {i // a.chunk + 1}/{(len(todo) + a.chunk - 1) // a.chunk}  "
              f"累计成功 {ok}/{len(data)}")

    ok = sum(1 for v in data.values() if not v.get("err"))
    tot = sum(len(v.get("replies", [])) + len(v.get("hots", []))
              for v in data.values() if not v.get("err"))
    print(f"✓ {ok}/{len(data)} 视频评论抓取成功，共 {tot} 条 → {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
