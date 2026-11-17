// 冒烟检查：提取 multi-verify.html 的 <script> 段，mock DOM 后跑 N 拍
// 判据：①语法可解析 ②3000 拍无 NaN ③touch 有发生（触碰带球真的在踢）④球从未出界 NaN
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/multi-verify.html', 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('FAIL: no script block'); process.exit(1); }
let src = m[1];

// ---- DOM mocks ----
const noop = () => {};
const el = () => ({
  style: {}, textContent: '', innerHTML: '', value: '0.3', checked: true,
  appendChild: noop, classList: { add: noop, remove: noop },
  getContext: () => new Proxy({}, { get: () => () => true }),
  addEventListener: noop, oninput: noop, onchange: noop, onclick: noop,
  children: [],
});
global.document = { getElementById: el, createElement: el };
global.addEventListener = noop;
global.performance = { now: () => 0 };
global.requestAnimationFrame = noop; // 不进渲染循环
let timeouts = [];
global.setTimeout = (fn) => { timeouts.push(fn); return 0; };

// ---- load：把测试钩子拼进同一作用域（页面脚本是 strict + const，跨 eval 不可见） ----
const hooks = `
;globalThis.__T__ = {
  scene, SCENES, resetStats, params, pickPassTarget,
  stepTick: () => stepTick(),
  ball: () => ball, players: () => players, stats: () => S,
  FIELD, setKey: (c, d) => { keysDown[c] = d; },
  kickSpd: () => Math.hypot(ball.vx, ball.vy, ball.vz),
};`;
try { eval(src + hooks); } catch (e) { console.error('FAIL eval:', e.message); process.exit(1); }
console.log('ok: script evaluated without throwing');
const T = globalThis.__T__;

// ---- 冒烟：逐场景驱动 stepTick ----
for (const sc of ['S1','S2','S3','S4']) {
  T.scene = sc; T.SCENES[sc].init(); T.resetStats();
  let bad = { nan: 0, out: 0 }, ok = true;
  for (let i = 0; i < 3000 && ok; i++) {
    try { T.stepTick(); } catch (e) { console.error(`FAIL ${sc} stepTick@${i}:`, e.message); process.exit(1); }
    const b = T.ball();
    if (!isFinite(b.x) || !isFinite(b.z) || !isFinite(b.vx) || !isFinite(b.vz) || !isFinite(b.y)) { bad.nan = i; ok = false; }
    else if (Math.abs(b.x) > T.FIELD.x + 5 || Math.abs(b.z) > T.FIELD.z + 5) { bad.out = i; ok = false; }
    for (const pl of T.players()) if (!isFinite(pl.x) || !isFinite(pl.z)) { bad.nan = i; ok = false; }
  }
  const st = T.stats();
  const touched = st.touchBy[0] + st.touchBy[1] > 0;
  const b = T.ball();
  console.log(`${ok ? 'ok ' : 'FAIL'} ${sc}: ball=(${b.x.toFixed(1)},${b.z.toFixed(1)},${b.y.toFixed(2)}) touch=[${st.touchBy}] ownSwitch=${st.ownSwitch} tackles=${st.tacklesTry}/${st.tackleOk} passes=${st.passes} goals=${st.goals}${ok ? '' : ' bad=' + JSON.stringify(bad)}${touched || sc === 'S3' ? '' : ' [WARN no touch]'}`);
  if (!ok) process.exit(1);
}

// ---- 定向测试 1：S3 短传 12m/s → V0 选人后 NPC/P2 接球 ----
{
  T.scene = 'S3'; T.SCENES.S3.init(); T.resetStats();
  T.players()[0].face = Math.PI / 2; // P1 面向 +x（P2(-22,6)/P3(-24,-5) 均在锥内，V0 选更近的 P3）
  T.setKey('Digit4', true); T.stepTick(); T.setKey('Digit4', false);
  const spd = T.kickSpd();
  const passOk1 = spd > 11 && spd < 13;
  for (let i = 0; i < 150; i++) T.stepTick(); // 10s：接应队友应控住
  const st = T.stats();
  const caught = st.catchTicks.length >= 1;
  console.log(`${passOk1 && caught ? 'ok ' : 'FAIL'} T1 短传: 出球速度=${spd.toFixed(1)}m/s(应≈12) 选人P2:P3=${st.pickCnt[1]}:${st.pickCnt[2]} 接住=${st.catchTicks.length}次`);
  if (!passOk1 || !caught) process.exit(1);
}

// ---- 定向测试 2：抢断路径最小单元测试（P1 touch 持球 → P2 贴身按键抢断） ----
// 注：AI 追不上先跑者（同 max speed 5.3 物理上追不上）是物理正确，非 bug——真人靠预判拦截
{
  T.scene = 'S2'; T.SCENES.S2.init(); T.resetStats();
  T.params.ai = false; T.params.sup = 6; T.params.lag = 0;  // P2 手动输入（mock 环境默认 AI=true 会吞键盘）
  T.setKey('KeyD', true); T.stepTick(); T.stepTick(); T.setKey('KeyD', false); // P1 跑动 touch 球 ⇒ owner=0
  const p2 = T.players()[1], b = T.ball();
  p2.x = b.x; p2.z = b.z - 1.5; p2.face = Math.PI/2;              // P2 贴球 1.5m 面朝球
  T.setKey('KeyU', true); T.stepTick(); T.setKey('KeyU', false);  // P2 抢断键
  const st = T.stats(), p1 = T.players()[0];
  const okTk = st.tacklesTry === 1 && st.tackleOk === 1 && p1.suppressed === T.params.sup && T.ball().owner === 1;
  const spd = T.kickSpd();
  console.log(`${okTk ? 'ok ' : 'FAIL'} T2 抢断: 尝试=${st.tacklesTry} 成功=${st.tackleOk} 被抢者抑制拍=${p1.suppressed}(应=${T.params.sup}) 球权=${T.ball().owner} 出球速度=${spd.toFixed(1)}(应≈7)`);
  if (!okTk) process.exit(1);
}

// ---- 定向测试 5：V0 传球选人纯函数（锥内最近 / 挪近改选 / 全出锥退化 none） ----
{
  T.scene = 'S3'; T.SCENES.S3.init(); T.resetStats();
  const [p1, p2, p3] = T.players();
  p1.x = 0; p1.z = 0; p1.face = Math.PI / 2; p1.vx = p1.vz = 0;   // P1 原点朝 +x
  T.ball().x = 0; T.ball().z = 0;
  p2.x = 6; p2.z = 6; p2.vx = p2.vz = 0;                          // 锥内 45°, d≈8.5
  p3.x = 10; p3.z = -2; p3.vx = p3.vz = 0;                        // 锥内, d≈10.2（更远）
  const r1 = T.pickPassTarget(p1);
  const okA = r1 && r1.id === 1;                                   // 选 P2（更近的锥内队友）
  p3.x = 4.5; p3.z = -2;                                           // P3 挪近: d≈4.9
  const r2 = T.pickPassTarget(p1);
  const okB = r2 && r2.id === 2;                                   // 改选 P3
  p2.x = -34; p2.z = 5; p3.x = -36; p3.z = -5;                       // 两人都摆到背后（锥外）
  const r3 = T.pickPassTarget(p1);
  const okC = r3 === null;                                         // 无队友 → none（V2 直塞语义）
  console.log(`${okA && okB && okC ? 'ok ' : 'FAIL'} T5 V0选人: 近锥选P2=${okA} 挪近改选P3=${okB} 全出锥none=${okC}`);
  if (!(okA && okB && okC)) process.exit(1);
}

// ---- 定向测试 6：V0 选人后球射向接球点（静止目标=当前位置方向） ----
{
  T.scene = 'S3'; T.SCENES.S3.init(); T.resetStats();
  T.params.ai = false;
  const [p1, p2, p3] = T.players();
  p1.x = 0; p1.z = 0; p1.face = Math.PI / 2; p1.vx = p1.vz = 0;
  T.ball().x = 0.5; T.ball().z = 0; T.ball().vx = T.ball().vz = T.ball().vy = 0;
  p2.x = 10; p2.z = 6; p2.vx = p2.vz = 0;                          // 锥内但远
  p3.x = 4.5; p3.z = -2; p3.vx = p3.vz = 0;                        // 锥内近（P1 正前偏下）
  T.setKey('Digit4', true); T.stepTick(); T.setKey('Digit4', false);
  const st = T.stats(), b = T.ball();
  const picked = (st.pickCnt[2] || 0) === 1;
  const aimOk = b.vx > 0 && b.vz < 0 && Math.abs(Math.abs(b.vx / b.vz) - 2.25) < 0.6;  // 方向≈(4.5,-2)，|vx/vz|≈2.25
  console.log(`${picked && aimOk ? 'ok ' : 'FAIL'} T6 接球点瞄准: 选P3=${picked} 球初速=(${b.vx.toFixed(1)},${b.vz.toFixed(1)}) |vx/vz|=${Math.abs(b.vx/b.vz).toFixed(2)}(应≈2.25)`);
  if (!(picked && aimOk)) process.exit(1);
}

console.log('SMOKE PASS');
