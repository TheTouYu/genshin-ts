#!/usr/bin/env python3
"""build_web.py — 把 GUI 模块读数 + 抓帧渲染成可离线打开的界面可视化页。

产物：.scratch/gui-feedback/web/index.html（数据内联，双击即可打开，无需 http 服务）
图层：容器(containers) / 文本框(text) / 图形块(free_glyphs) / 分区(structure) / 标签
"""
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(BASE, "web")

KIND_CN = {"panel": "面板", "row": "行", "button": "按钮", "tile": "格子", "card": "卡片",
           "chip": "小块", "icon": "图标", "avatar": "头像", "unknown": "未分类"}
KIND_COLOR = {"panel": "#4f9dff", "row": "#3ddc84", "button": "#ffb020", "tile": "#b06bff",
              "card": "#ff6b9d", "chip": "#00d0d0", "icon": "#ffd166", "avatar": "#ff8c42",
              "unknown": "#8b93a7"}


def title_of(name):
    if name.startswith("s00"):
        return "世界 HUD（提瓦特·冰窟）"
    if name.startswith("e01"):
        return "派蒙菜单（点头像后）"
    if name[:2].isdigit():
        return name[3:]
    return name


def build():
    rows = json.load(open(os.path.join(WEB, "data.json")))
    man = {m["name"]: m for m in json.load(open(os.path.join(WEB, "img", "manifest.json")))}
    out = []
    for r in rows:
        n = os.path.splitext(r["frame"])[0]
        if r.get("error"):
            out.append({"name": n, "title": title_of(n), "error": r["error"]})
            continue
        out.append({
            "name": n, "title": title_of(n), "img": f"img/{n}.jpg",
            "w": man.get(n, {}).get("w", 2560), "h": man.get(n, {}).get("h", 1440),
            "containers": r.get("containers") or [], "text": r.get("text") or [],
            "free_text": r.get("free_text") or [], "free_glyphs": r.get("free_glyphs") or [],
            "structure": r.get("structure") or [], "timing": r.get("timing"),
            "degraded": r.get("degraded"),
        })
    html = (HTML.replace("__DATA__", json.dumps(out, ensure_ascii=False, separators=(",", ":")))
                .replace("__KINDS__", json.dumps(KIND_COLOR, ensure_ascii=False))
                .replace("__KINDS_CN__", json.dumps(KIND_CN, ensure_ascii=False)))
    p = os.path.join(WEB, "index.html")
    open(p, "w").write(html)
    print("wrote", p, os.path.getsize(p) // 1024, "KB frames=", len(out))


HTML = r"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>原神界面 · GUI 模块读数可视化</title>
<style>
*{box-sizing:border-box}
:root{--bg:#0d1117;--panel:#161b22;--line:#273040;--fg:#e6edf3;--dim:#8b949e;--acc:#58a6ff}
html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);
  font:13px/1.55 -apple-system,"Noto Sans CJK SC","Microsoft YaHei",sans-serif;overflow:hidden}
#app{display:grid;grid-template-columns:236px 1fr 304px;grid-template-rows:54px 1fr;height:100%}
header{grid-column:1/-1;display:flex;align-items:center;gap:18px;padding:0 16px;
  border-bottom:1px solid var(--line);background:var(--panel)}
header h1{font-size:15px;margin:0;font-weight:600;letter-spacing:.4px;white-space:nowrap}
header .stat{color:var(--dim);font-size:12px;white-space:nowrap}
header .stat b{color:var(--fg);font-variant-numeric:tabular-nums}
header .hint{margin-left:auto;color:#5c6675;font-size:11px;white-space:nowrap}
#frames{border-right:1px solid var(--line);overflow-y:auto;background:var(--panel)}
.fitem{display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:pointer;border-left:3px solid transparent}
.fitem:hover{background:#1c2430}
.fitem.on{background:#1f2a3a;border-left-color:var(--acc)}
.fitem .idx{color:var(--dim);font-size:11px;width:18px;text-align:right;font-variant-numeric:tabular-nums}
.fitem .nm{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fitem .cnt{font-size:11px;color:var(--dim);font-variant-numeric:tabular-nums}
#stage{position:relative;display:flex;align-items:center;justify-content:center;background:#04060a;padding:12px;overflow:hidden}
#wrap{position:relative;max-width:100%;max-height:100%;box-shadow:0 8px 44px #000c;line-height:0}
#shot{display:block;width:100%;height:auto;image-rendering:auto}
#ov{position:absolute;inset:0;width:100%;height:100%}
#tl{position:absolute;left:8px;bottom:8px;background:#000b;border:1px solid var(--line);
  border-radius:5px;padding:3px 8px;font-size:11px;color:#c9d1d9;line-height:1.4}
#side{border-left:1px solid var(--line);overflow-y:auto;background:var(--panel);padding:12px 14px}
#side h2{font-size:11px;color:var(--dim);margin:16px 0 6px;text-transform:uppercase;letter-spacing:1.2px;font-weight:600}
#side h2:first-child{margin-top:0}
.lg{display:flex;align-items:center;gap:8px;padding:3px 0;cursor:pointer;user-select:none}
.lg .sw{width:11px;height:11px;border-radius:2px;flex:none}
.lg .nm{flex:1}
.lg .n{color:var(--dim);font-variant-numeric:tabular-nums}
.lg.off{opacity:.3}
.lg:hover{background:#1c2430}
.row{display:flex;justify-content:space-between;padding:2px 0;font-variant-numeric:tabular-nums}
.row span:last-child{color:var(--dim)}
.bar{height:3px;background:#21262d;border-radius:2px;overflow:hidden;margin:0 0 4px}
.bar i{display:block;height:100%}
#ovl{background:#21262d;color:#c9d1d9;border:1px solid #30394a;border-radius:5px;
  padding:4px 10px;font-size:12px;cursor:pointer;font-family:inherit}
#ovl:hover{background:#2b3442;color:#fff}
#modal{position:fixed;inset:0;background:#05070ad9;display:none;z-index:80;
  align-items:center;justify-content:center;padding:40px}
#modal.on{display:flex}
#mcard{background:#0d1117;border:1px solid #30394a;border-radius:10px;max-width:1100px;
  max-height:86vh;overflow:auto;padding:20px 24px;box-shadow:0 20px 60px #000}
#mcard h3{margin:0 0 12px;font-size:15px}
table{border-collapse:collapse;width:100%;font-size:12px;font-variant-numeric:tabular-nums}
th,td{padding:5px 10px;border-bottom:1px solid #1c2430;text-align:right;white-space:nowrap}
th{color:#8b949e;font-weight:600;position:sticky;top:0;background:#0d1117}
td:nth-child(2),th:nth-child(2){text-align:left}
tr:hover td{background:#131a24}
td.bad{color:#f85149}
#tip{position:fixed;pointer-events:none;background:#0b1220f2;border:1px solid #30394a;border-radius:6px;
  padding:7px 10px;font-size:12px;max-width:360px;display:none;z-index:99;white-space:pre-wrap;line-height:1.5}
.tg{display:flex;align-items:center;gap:6px;font-size:12px;color:#8b949e;cursor:pointer;user-select:none}
.tg input{accent-color:var(--acc);margin:0}
kbd{background:#21262d;border:1px solid var(--line);border-radius:3px;padding:0 4px;font-size:10px;font-family:inherit}
.tag{display:inline-block;background:#21262d;border-radius:3px;padding:0 5px;margin:2px 3px 0 0;font-size:11px;color:#c9d1d9}
.warn{color:#ffb020;font-size:11px;line-height:1.4}
.bad{color:#f85149;font-size:12px}
</style></head><body>
<div id="app">
  <header>
    <h1>原神界面 · GUI 模块读数可视化</h1>
    <div class="stat">帧 <b id="s-f">0</b> · 容器 <b id="s-c">0</b> · 文本 <b id="s-t">0</b> · 图形块 <b id="s-g">0</b></div>
    <button id="ovl">总览表</button>
    <div class="hint">← → 切帧 &nbsp;·&nbsp; 1-5 切图层 &nbsp;·&nbsp; 0 纯净模式</div>
  </header>
  <div id="frames"></div>
  <div id="stage"><div id="wrap"><img id="shot" alt=""><svg id="ov" preserveAspectRatio="xMidYMid meet"></svg><div id="tl"></div></div></div>
  <div id="side"></div>
</div>
<div id="modal"><div id="mcard"></div></div>
<div id="tip"></div>
<script>
const DATA=__DATA__, KC=__KINDS__, KCN=__KINDS_CN__;
const LAYERS=['cont','text','glyph','struct','label'];
let cur=0, show={cont:true,text:true,glyph:false,struct:false,label:true}, offKinds=new Set();
const $=s=>document.querySelector(s), esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

function totals(){
  let c=0,t=0,g=0;
  DATA.forEach(d=>{c+=(d.containers||[]).length;t+=(d.text||[]).length;g+=(d.free_glyphs||[]).length});
  $('#s-f').textContent=DATA.length;$('#s-c').textContent=c;
  $('#s-t').textContent=t;$('#s-g').textContent=g;
}

function listFrames(){
  $('#frames').innerHTML=DATA.map((d,i)=>{
    const n=(d.containers||[]).length;
    return `<div class="fitem${i===cur?' on':''}" data-i="${i}">
      <span class="idx">${String(i+1).padStart(2,'0')}</span>
      <span class="nm">${esc(d.title)}</span>
      <span class="cnt">${d.error?'!':'◫'+n}</span></div>`}).join('');
  $('#frames').querySelectorAll('.fitem').forEach(el=>el.onclick=()=>go(+el.dataset.i));
}

function go(i){cur=(i+DATA.length)%DATA.length;listFrames();render()}

function render(){
  const d=DATA[cur]; if(!d) return;
  if(d.error){$('#shot').removeAttribute('src');$('#ov').innerHTML='';$('#side').innerHTML=`<div class="bad">读取失败 ${esc(d.error)}</div>`;return}
  $('#shot').src=d.img;
  const svg=$('#ov'); svg.setAttribute('viewBox',`0 0 ${d.w} ${d.h}`);
  const H=d.h, fs=Math.round(H/62), P=[];
  if(show.struct) (d.structure||[]).forEach(s=>{
    const [x,y,w,h]=s.bbox;
    P.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#b06bff12" stroke="#b06bff" stroke-width="2.5" stroke-dasharray="10 6" rx="4"/>`);
    if(show.label) P.push(`<text x="${x+6}" y="${y+fs+4}" fill="#d8b8ff" font-size="${fs}" font-weight="600">分区 · ${s.n_rows||0} 行</text>`);
  });
  if(show.cont) (d.containers||[]).forEach(c=>{
    if(offKinds.has(c.kind))return;
    const col=KC[c.kind]||KC.unknown,[x,y,w,h]=c.bbox;
    const dash=c.clipped?'6 4':(c.clickable==='unknown'?'3 3':'');
    P.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${col}14" stroke="${col}" stroke-width="2.4" ${dash?`stroke-dasharray="${dash}"`:''} rx="3"/>`);
    if(show.label&&w>64&&h>24){
      const t=(KCN[c.kind]||c.kind)+(c.id?' ·'+c.id:'');
      const tw=t.length*fs*0.66+10;
      P.push(`<rect x="${x}" y="${y}" width="${tw}" height="${fs+5}" fill="${col}" opacity=".9" rx="2"/>`);
      P.push(`<text x="${x+5}" y="${y+fs}" fill="#08101c" font-size="${fs}" font-weight="700">${esc(t)}</text>`);
    }
  });
  if(show.glyph) (d.free_glyphs||[]).forEach(g=>{
    const [x,y,w,h]=g.bbox;
    P.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#00d0d012" stroke="#00d0d0" stroke-width="1.8" stroke-dasharray="2 3" rx="2"/>`);
  });
  if(show.text) (d.text||[]).forEach(t=>{
    const [x,y,w,h]=t.bbox, c=t.kind==='hud'?'#7d8590':'#e6edf3';
    P.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${c}" stroke-width="1.1" opacity=".7" rx="2"/>`);
  });
  svg.innerHTML=P.join('');
  $('#tl').textContent=`${d.title} · ${d.w}×${d.h} · 容器 ${(d.containers||[]).length} · 文本 ${(d.text||[]).length} · 图形块 ${(d.free_glyphs||[]).length} · 游离文本 ${(d.free_text||[]).length}`;
  renderSide(d);
  svg.onmousemove=e=>{
    const tip=$('#tip'), el=document.elementFromPoint(e.clientX,e.clientY);
    if(el&&el.tagName==='rect'){
      const x=+el.getAttribute('x'),y=+el.getAttribute('y'),w=+el.getAttribute('width'),h=+el.getAttribute('height');
      const hit=(d.containers||[]).find(c=>c.bbox[0]===x&&c.bbox[1]===y&&c.bbox[2]===w&&c.bbox[3]===h)
             ||(d.structure||[]).find(s=>s.bbox[0]===x&&s.bbox[1]===y&&s.bbox[2]===w&&s.bbox[3]===h);
      if(hit){tip.textContent=`${hit.n_rows!=null?'分区':(KCN[hit.kind]||hit.kind)}${hit.id?' '+hit.id:''}\nbbox=[${hit.bbox}]`
        +(hit.text?`\n文本: ${hit.text.join(' / ')||'—'}`:'')
        +(hit.n_rows!=null?`\n行数: ${hit.n_rows}`:'')
        +(hit.clickable?`\n可点性: ${hit.clickable}`:'')
        +(hit.clipped?'\n⚠ 边缘被裁切':'');
        tip.style.display='block';tip.style.left=(e.clientX+16)+'px';tip.style.top=(e.clientY+16)+'px';return}
    }
    tip.style.display='none';
  };
  svg.onmouseleave=()=>$('#tip').style.display='none';
}

function renderSide(d){
  const cs=d.containers||[], t=d.timing||{};
  const byKind={}; cs.forEach(c=>byKind[c.kind]=(byKind[c.kind]||0)+1);
  const kk=Object.entries(byKind).sort((a,b)=>b[1]-a[1]), total=cs.length||1;
  let h=`<h2>本帧读数</h2>
   <div class="row"><span>容器（containers）</span><span>${cs.length}</span></div>
   <div class="row"><span>文本（带框）</span><span>${(d.text||[]).length}</span></div>
   <div class="row"><span>图形块（无字）</span><span>${(d.free_glyphs||[]).length}</span></div>
   <div class="row"><span>游离文本（无框）</span><span>${(d.free_text||[]).length}</span></div>
   <div class="row"><span>分区（structure）</span><span>${(d.structure||[]).length}</span></div>
   <div class="row"><span>模块耗时</span><span>${t.total_ms!=null?t.total_ms+' ms':'—'}</span></div>
   <div class="row"><span>└ OCR</span><span>${t.ocr_ms!=null?t.ocr_ms+' ms':'—'}</span></div>
   <div class="row"><span>└ 像素</span><span>${t.pixel_ms!=null?t.pixel_ms+' ms':'—'}</span></div>
   <h2>容器分布（点按隐藏）</h2>`;
  if(!kk.length) h+=`<div class="bad">容器层未检出任何对象 —— 本帧只能靠文本行</div>`;
  kk.forEach(([k,n])=>{
    const on=!offKinds.has(k);
    h+=`<div class="lg${on?'':' off'}" data-k="${k}"><span class="sw" style="background:${KC[k]||KC.unknown}"></span>
      <span class="nm">${KCN[k]||k}</span><span class="n">${n}</span></div>
      <div class="bar"><i style="width:${n/total*100}%;background:${KC[k]||KC.unknown}"></i></div>`;
  });
  const ft=d.free_text||[];
  if(ft.length){h+=`<h2>游离文本（无容器归属 · act 解析不到）</h2><div>`+
    ft.slice(0,50).map(x=>`<span class="tag">${esc(x)}</span>`).join('')+`</div>`}
  if((d.degraded||[]).length){
    h+=`<h2>降级标记</h2>`;d.degraded.forEach(x=>{h+=`<div class="warn">${esc(x.code||'')} — ${esc((x.detail||'').slice(0,80))}</div>`});
  }
  if((d.text||[]).length){
    h+=`<h2>文本行（前 30）</h2><div>`+
      d.text.slice(0,30).map(x=>`<span class="tag">${esc(x.t)}</span>`).join('')+`</div>`;
  }
  const side=$('#side'); side.innerHTML=h;
  side.querySelectorAll('.lg').forEach(el=>el.onclick=()=>{
    const k=el.dataset.k; offKinds.has(k)?offKinds.delete(k):offKinds.add(k); render();
  });
}

function toggles(){
  const wrap=document.createElement('div');
  wrap.style.cssText='display:flex;gap:13px;align-items:center';
  const defs=[['cont','容器'],['text','文本框'],['glyph','图形块'],['struct','分区'],['label','标签']];
  wrap.innerHTML=defs.map(([k,n],i)=>`<label class="tg"><input type="checkbox" ${show[k]?'checked':''} data-k="${k}"> ${n} <kbd>${i+1}</kbd></label>`).join('');
  document.querySelector('header').appendChild(wrap);
  wrap.querySelectorAll('input').forEach(i=>i.onchange=()=>{show[i.dataset.k]=i.checked;render()});
  window._ti=wrap.querySelectorAll('input');
}

document.addEventListener('keydown',e=>{
  if(e.key==='ArrowRight'){go(cur+1);e.preventDefault()}
  else if(e.key==='ArrowLeft'){go(cur-1);e.preventDefault()}
  else if(e.key==='0'){const all=LAYERS.every(k=>show[k]);LAYERS.forEach(k=>show[k]=!all);
    [...window._ti].forEach(i=>i.checked=show[i.dataset.k]);render()}
  else if('12345'.includes(e.key)){const k=LAYERS[+e.key-1];show[k]=!show[k];
    const inp=[...window._ti].find(i=>i.dataset.k===k);if(inp)inp.checked=show[k];render()}
});

function summary(){
  const cols=['#','界面','容器','文本','图形块','游离文本','分区','耗时ms'];
  let t=`<h3>全量读数总表 · ${DATA.length} 帧（数据 = tools/ys-screen --json）</h3><table><thead><tr>`;
  t+=cols.map(c=>`<th>${c}</th>`).join('')+'</tr></thead><tbody>';
  DATA.forEach((d,i)=>{
    const c=(d.containers||[]).length, tx=(d.text||[]).length, g=(d.free_glyphs||[]).length,
          ft=(d.free_text||[]).length, st=(d.structure||[]).length,
          ms=(d.timing||{}).total_ms;
    t+=`<tr><td>${i+1}</td><td>${esc(d.title)}</td><td class="${c?'':'bad'}">${c}</td><td>${tx}</td>
        <td>${g}</td><td>${ft}</td><td>${st}</td><td>${ms!=null?ms:'—'}</td></tr>`;
  });
  const sum=k=>DATA.reduce((a,d)=>a+((d[k]||[]).length),0);
  t+=`</tbody><tfoot><tr><th></th><th>合计</th><th>${sum('containers')}</th><th>${sum('text')}</th>
      <th>${sum('free_glyphs')}</th><th>${sum('free_text')}</th><th>${sum('structure')}</th><th></th></tr></tfoot></table>`;
  t+=`<div style="margin-top:12px;color:#8b949e;font-size:12px">
     读法：<b>容器</b> = containers[]（L3 平坦皮肤容器，能挂住 text/glyphs 的框）；<b>游离文本</b> =
     没被任何容器接住的文本行，<code>act(text)</code> 在这些页面上解析不到目标。
     容器=0 的帧共 ${DATA.filter(d=>!(d.containers||[]).length).length} 个。</div>`;
  $('#mcard').innerHTML=t; $('#modal').classList.add('on');
}
$('#ovl').onclick=summary;
$('#modal').onclick=e=>{if(e.target.id==='modal')e.target.classList.remove('on')};

totals();toggles();
if(location.hash==='#summary')summary();
cur=Math.max(0,DATA.findIndex(d=>d.name.startsWith('e01')));
if(cur<0)cur=0;
listFrames();render();
</script></body></html>"""

if __name__ == "__main__":
    build()
