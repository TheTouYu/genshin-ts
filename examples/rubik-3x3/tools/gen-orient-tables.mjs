// 生成 3×3 魔方朝向表：localAxisTable + orientIndexByEuler + moveOrientTransition
// 2026-08-21 修正：引擎文档闭合结论——
//   rotate 输出 = (x,y,z)，矩阵 R = Ry(y)*Rx(x)*Rz(z)（YXZ 内旋）
//   localAxis = R^T * worldAxis = Rz(-z)*Rx(-x)*Ry(-y)*worldAxis
// 2026-08-21 性能优化：moveOrientTransition[move-1][oldOrient] = 该 move 后新朝向
//   已用真实日志 9 步 blockOrient 快照验证：R_new = R_move(+90°) × R_old（右手法则），0 误差。
const D2R = Math.PI / 180
function rotY(a) { const c=Math.cos(a), s=Math.sin(a); return [[c,0,s],[0,1,0],[-s,0,c]] }
function rotX(a) { const c=Math.cos(a), s=Math.sin(a); return [[1,0,0],[0,c,-s],[0,s,c]] }
function rotZ(a) { const c=Math.cos(a), s=Math.sin(a); return [[c,-s,0],[s,c,0],[0,0,1]] }
function rotAxis(axis, deg) {
  const [x,y,z] = axis; const a = deg*D2R; const c = Math.cos(a), s = Math.sin(a), t = 1-c
  return [
    [c+x*x*t, x*y*t-z*s, x*z*t+y*s],
    [y*x*t+z*s, c+y*y*t, y*z*t-x*s],
    [z*x*t-y*s, z*y*t+x*s, c+z*z*t]
  ]
}
function mul(A,B) { return A.map((row,i)=>B[0].map((_,j)=>row[0]*B[0][j]+row[1]*B[1][j]+row[2]*B[2][j])) }
function transpose(A) { return A[0].map((_,j)=>A.map(row=>row[j])) }
function apply(A,v) { return A.map(row=>row[0]*v[0]+row[1]*v[1]+row[2]*v[2]) }
// R = Ry(y)*Rx(x)*Rz(z)
function eulerToMat(x,y,z) { return mul(rotY(y*D2R), mul(rotX(x*D2R), rotZ(z*D2R))) }
function matStr(A) { return A.flat().map(v => Math.round(v)).join(',') }
function matToEuler(A) {
  // R = Ry*Rx*Rz
  // A[0][2] = sin(y)*cos(x), A[1][2] = -sin(x), A[2][2] = cos(y)*cos(x)
  const x = Math.asin(Math.max(-1,Math.min(1,-A[1][2])))
  const cosx = Math.cos(x)
  const y = Math.atan2(A[0][2]/cosx, A[2][2]/cosx)
  const z = Math.atan2(A[1][0]/cosx, A[1][1]/cosx)
  return [x,y,z] // (x,y,z)
}
function normAngle(a) { a = a % (2*Math.PI); if (a < -1e-9) a += 2*Math.PI; return Math.round(a/(Math.PI/2)) % 4 }

const byMat = new Map()
const orientations = [] // { mat, euler: [x,y,z] }
for (let x=0;x<4;x++) for (let y=0;y<4;y++) for (let z=0;z<4;z++) {
  const mat = eulerToMat(x*90,y*90,z*90)
  const key = matStr(mat)
  if (byMat.has(key)) continue
  byMat.set(key, orientations.length)
  orientations.push({ mat, euler: [x*90,y*90,z*90] })
}
console.error('orientations:', orientations.length)

const MOVE_AXES = [null,[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[1,0,0],[0,1,0],[0,0,-1],[-1,0,0],[0,-1,0],[0,0,-1]]

const localAxisTable = []
for (let move=1; move<=12; move++) {
  const axis = MOVE_AXES[move]
  for (let oi=0; oi<24; oi++) {
    const R = orientations[oi].mat
    const local = apply(transpose(R), axis).map(v => Math.round(v))
    localAxisTable.push(local)
  }
}

// orientIndexByEuler 下标 = qy*16 + qx*4 + qz（与 flow_update_orient 的 key 一致）
const orientIndexByEuler = []
for (let i=0;i<64;i++) orientIndexByEuler.push(0)
for (let x=0;x<4;x++) for (let y=0;y<4;y++) for (let z=0;z<4;z++) {
  const mat = eulerToMat(x*90,y*90,z*90)
  const idx = byMat.get(matStr(mat))
  orientIndexByEuler[y*16 + x*4 + z] = idx
}

// moveOrientTransition[(moveId-1)*24 + oldOrient] = newOrient
// 方向 = +90° 右手法则绕 MOVE_AXES[move]，R_new = R_move × R_old
const moveOrientTransition = []
for (let move=1; move<=12; move++) {
  const Rm = rotAxis(MOVE_AXES[move], 90)
  for (let oi=0; oi<24; oi++) {
    const R = orientations[oi].mat
    const Rnew = mul(Rm, R)
    moveOrientTransition.push(byMat.get(matStr(Rnew)))
  }
}

function fmtVec(v) { const s = v.map(x => x === 0 ? 0 : x).join(', '); return `vec3([${s}])` }
function chunks(arr, per) { const out=[]; for(let i=0;i<arr.length;i+=per) out.push(arr.slice(i,i+per)); return out }

console.log('// 3×3 魔方朝向表（由 tools/gen-orient-tables.mjs 生成，勿手改）')
console.log('// 2026-08-21 修正：rotate 输出 (x,y,z)，矩阵 R = Ry(y)*Rx(x)*Rz(z)')
console.log('// localAxisTable[ (moveId-1)*24 + orientIdx ] = 局部轴')
console.log('export const localAxisTable0 = [')
for (const row of chunks(localAxisTable.slice(0,100), 6)) console.log('  ' + row.map(fmtVec).join(', ') + ',')
console.log(']')
console.log('export const localAxisTable1 = [')
for (const row of chunks(localAxisTable.slice(100,200), 6)) console.log('  ' + row.map(fmtVec).join(', ') + ',')
console.log(']')
console.log('export const localAxisTable2 = [')
for (const row of chunks(localAxisTable.slice(200), 6)) console.log('  ' + row.map(fmtVec).join(', ') + ',')
console.log(']')
console.log('// orientIndexByEuler[ qy*16 + qx*4 + qz ] = 朝向索引（0..23）')
console.log('export const orientIndexByEuler = [')
for (const row of chunks(orientIndexByEuler, 16)) console.log('  ' + row.map(v => v + 'n').join(', ') + ',')
console.log(']')
console.log('// moveOrientTransition[ (moveId-1)*24 + oldOrient ] = newOrient，按 100 元素分块（引擎字面量上限）')
console.log('export const moveOrientTransition0 = [')
for (const row of chunks(moveOrientTransition.slice(0,100), 16)) console.log('  ' + row.map(v => v + 'n').join(', ') + ',')
console.log(']')
console.log('export const moveOrientTransition1 = [')
for (const row of chunks(moveOrientTransition.slice(100,200), 16)) console.log('  ' + row.map(v => v + 'n').join(', ') + ',')
console.log(']')
console.log('export const moveOrientTransition2 = [')
for (const row of chunks(moveOrientTransition.slice(200), 16)) console.log('  ' + row.map(v => v + 'n').join(', ') + ',')
console.log(']')
