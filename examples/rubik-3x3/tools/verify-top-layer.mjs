import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..', '..')  // examples/rubik-3x3/tools -> 仓库根
const EXAMPLE = join(__dirname, '..')
const require = createRequire(join(EXAMPLE, 'package.json') || ROOT + '/package.json')
const ir = require(join(EXAMPLE, 'dist/src/game.json'))

const doc = Array.isArray(ir) ? ir[0] : ir
const varMap = {}; for (const v of doc.variables ?? []) varMap[v.name] = v.value
const asArr = (v) => Array.isArray(v) ? v : (v?.value ?? [])
const V = {}
for (const n of ['faceCornerFrom','faceCornerTo','faceCornerTwist','faceEdgeFrom','faceEdgeTo','faceEdgeFlip','middleEdgeFrom','middleEdgeTo','middleEdgeFlip','middleCenterFrom','middleCenterTo','wholeCornerFrom','wholeCornerTo','wholeCornerTwist','wholeEdgeFrom','wholeEdgeTo','wholeEdgeFlip','wholeCenterFrom','wholeCenterTo']) V[n] = asArr(varMap[n])
const makeState = () => ({ cp: Array.from({length:8},(_,i)=>i), co: Array(8).fill(0), ep: Array.from({length:12},(_,i)=>i), eo: Array(12).fill(0), cenp: Array.from({length:6},(_,i)=>i) })
function applyMove(s, moveId) {
  const isFace = moveId <= 6, isMiddle = moveId >= 7 && moveId <= 9, isWhole = moveId >= 10
  if (isFace || isWhole) {
    const count = isFace ? 4 : 8
    const fromArr = isFace ? V.faceCornerFrom : V.wholeCornerFrom, toArr = isFace ? V.faceCornerTo : V.wholeCornerTo, twArr = isFace ? V.faceCornerTwist : V.wholeCornerTwist
    const row = (isFace ? moveId - 1 : moveId - 10) * count
    const oldCp = s.cp.slice(), oldCo = s.co.slice(); const tmp = []
    for (let i = 0; i < count; i++) { const f = fromArr[row + i]; tmp.push([oldCp[f], oldCo[f]]) }
    for (let i = 0; i < count; i++) { const t = toArr[row + i]; s.cp[t] = tmp[i][0]; s.co[t] = twArr[row * 3 + i * 3 + tmp[i][1]] }
  }
  if (isFace || isMiddle || isWhole) {
    const count = isFace ? 4 : isMiddle ? 4 : 12
    let fromArr, toArr, flArr, row
    if (isFace) { fromArr = V.faceEdgeFrom; toArr = V.faceEdgeTo; flArr = V.faceEdgeFlip; row = (moveId - 1) * 4 }
    else if (isMiddle) { fromArr = V.middleEdgeFrom; toArr = V.middleEdgeTo; flArr = V.middleEdgeFlip; row = (moveId - 7) * 4 }
    else { fromArr = V.wholeEdgeFrom; toArr = V.wholeEdgeTo; flArr = V.wholeEdgeFlip; row = (moveId - 10) * 12 }
    const oldEp = s.ep.slice(), oldEo = s.eo.slice(); const tmp = []
    for (let i = 0; i < count; i++) { const f = fromArr[row + i]; tmp.push([oldEp[f], oldEo[f]]) }
    for (let i = 0; i < count; i++) { const t = toArr[row + i]; s.ep[t] = tmp[i][0]; s.eo[t] = flArr[row * 2 + i * 2 + tmp[i][1]] }
  }
  if (isMiddle || isWhole) {
    const count = isMiddle ? 4 : 6
    let fromArr, toArr, row
    if (isMiddle) { fromArr = V.middleCenterFrom; toArr = V.middleCenterTo; row = (moveId - 7) * 4 }
    else { fromArr = V.wholeCenterFrom; toArr = V.wholeCenterTo; row = (moveId - 10) * 6 }
    const old = s.cenp.slice(); const tmp = []
    for (let i = 0; i < count; i++) tmp.push(old[fromArr[row + i]])
    for (let i = 0; i < count; i++) s.cenp[toArr[row + i]] = tmp[i]
  }
}
function parseTS(name, text) { const out=[]; const plain = text.match(new RegExp('export const '+name+': bigint\\[\\] = \\[([^\\]]*)\\]')); if(plain) out.push(...plain[1].split(',').map(x=>parseInt(x.trim().replace('n',''),10))); const re=new RegExp('export const '+name+'_c(\\d+): bigint\\[\\] = \\[([^\\]]*)\\]','g'); let m; while((m=re.exec(text))!==null) out.push(...m[2].split(',').map(x=>parseInt(x.trim().replace('n',''),10))); return out }
const cf = readFileSync(join(EXAMPLE, 'src/cfopTables.ts'),'utf8')
const ol = readFileSync(join(EXAMPLE, 'src/ollTables.ts'),'utf8')
const FACE = parseTS('CF_MOVE_CODE_FACE', cf), DIR = parseTS('CF_MOVE_CODE_DIR', cf), STEPS = parseTS('CF_MOVE_CODE_STEPS', cf)
const OLL_ACT = parseTS('CF_OLL_ACT', ol), OLL_ALGLEN = parseTS('CF_OLL_ALGLEN', ol), OLL_ALG = parseTS('CF_OLL_ALG', ol)
const PLL_SIG = parseTS('CF_PLL_SIG', cf), PLL_ACT = parseTS('CF_PLL_ACT', cf), PLL_ALGLEN = parseTS('CF_PLL_ALGLEN', cf), PLL_ALG = parseTS('CF_PLL_ALG', cf)
function applyCode(s, code) { const face = FACE[code], dir = DIR[code], steps = STEPS[code]; for (let k = 0; k < steps; k++) { if (dir < 0) { for (let i = 0; i < 3; i++) applyMove(s, face) } else applyMove(s, face) } }
// 签名：槽镜像（角 game i ↔ cube 3-i；棱一致）+ 位置镜像（角 pos → 3-pos）
function ollSigGame(s) { const co = [s.co[3], s.co[2], s.co[1], s.co[0]]; const eo = [s.eo[0], s.eo[1], s.eo[2], s.eo[3]]; const cc = ((co[0]*3+co[1])*3+co[2])*3+co[3]; const ee = ((eo[0]*2+eo[1])*2+eo[2])*2+eo[3]; return cc*16+ee }
function pllSigGame(s) {
  // CubeLib U 层 4 角 home（UFR,UFL,UBR,UBL）= 游戏 home 3,2,1,0
  const cornerHome = [3, 2, 1, 0]
  // CubeLib U 层 4 棱 home（UF,UR,UB,UL）= 游戏 home 0,1,2,3
  const edgeHome = [0, 1, 2, 3]
  let k = 0
  for (const h of cornerHome) { const gp = s.cp.indexOf(h); k = k*8 + (3 - gp) }  // 角位置镜像 3-gp
  for (const h of edgeHome) { const gp = s.ep.indexOf(h); k = k*8 + gp }  // 棱一致
  return k
}
function isSolved(s) { return s.cp.every((x,i)=>x===i) && s.co.every(x=>x===0) && s.ep.every((x,i)=>x===i) && s.eo.every(x=>x===0) }
function solveLL(s) {
  const macros = []
  const osig = ollSigGame(s)
  if (osig !== 0) {
    const act = OLL_ACT[osig]
    if (act < 0) return { ok:false, stage:'OLL-act', macros }
    const a1 = act % 64, a2 = Math.floor(act/64) - 1
    for (const a of [a1, a2]) {
      if (a < 0) continue
      if (a <= 2) { macros.push([a]); for (const c of [a]) applyCode(s, c) }
      else { const alg = a-3; const off = OLL_ALGLEN.slice(0,alg).reduce((x,y)=>x+y,0); const codes = OLL_ALG.slice(off, off+OLL_ALGLEN[alg]); macros.push(codes); for (const c of codes) applyCode(s, c) }
    }
  }
  const psig = pllSigGame(s)
  if (psig !== 0) {
    const idx = PLL_SIG.indexOf(psig)
    if (idx < 0) return { ok:false, stage:'PLL-sig', macros }
    const act = PLL_ACT[idx]
    const post = act % 4, pre = Math.floor(act/4/22), algp1 = Math.floor(act/4) % 22
    if (pre > 0) { const codes = Array(pre).fill(0); macros.push(codes); for (const c of codes) applyCode(s, c) }
    if (algp1 > 0) { const alg = algp1-1; const off = PLL_ALGLEN.slice(0,alg).reduce((x,y)=>x+y,0); const codes = PLL_ALG.slice(off, off+PLL_ALGLEN[alg]); macros.push(codes); for (const c of codes) applyCode(s, c) }
    if (post > 0) { const codes = Array(post).fill(0); macros.push(codes); for (const c of codes) applyCode(s, c) }
  }
  return { ok: isSolved(s), macros }
}
const PROTO = '/home/h/test/flash-思维链+jspace/魔方/web-prototype/js/'
const require2 = createRequire(PROTO)
require2(PROTO + 'cube.js'); require2(PROTO + 'll-table.js')
const LL = globalThis.LLTableData
function decodeCodes(packed, len) { const codes=[]; for(let i=0;i<packed.length;i++){codes.push(Math.floor(packed[i]/18)); if(i*2+1<len) codes.push(packed[i]%18)} return codes }
const OLL_FORMULAS = LL.oll.map(e => decodeCodes(e.codes, e.len))
const PLL_FORMULAS = LL.pll.map(e => decodeCodes(e.codes, e.len))
let fails = 0, total = 0, macroT = 0, codeT = 0
const N = 20000
for (let i = 0; i < N; i++) {
  const s = makeState()
  for (let k = 0; k < 1 + Math.floor(Math.random()*4); k++) applyMove(s, 3)
  for (const code of OLL_FORMULAS[Math.floor(Math.random()*57)]) applyCode(s, code)
  for (let k = 0; k < Math.floor(Math.random()*4); k++) applyMove(s, 3)
  for (const code of PLL_FORMULAS[Math.floor(Math.random()*21)]) applyCode(s, code)
  for (let k = 0; k < Math.floor(Math.random()*4); k++) applyMove(s, 3)
  const r = solveLL(s)
  total++
  if (!r.ok) { fails++; if (fails < 6) console.log('FAIL', i, r.stage, JSON.stringify(r.macros)) }
  else { macroT += r.macros.length; codeT += r.macros.reduce((a,m)=>a+m.length,0) }
}
console.log('=== 游戏状态语义端到端验证（含位置镜像） ===')
console.log('样本:', total, '失败:', fails, '| 平均宏数:', (macroT/total).toFixed(2), '平均codes:', (codeT/total).toFixed(1))
console.log(fails === 0 ? 'ALL PASS' : 'FAIL')
