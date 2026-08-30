# 物理足球 · 第一阶段物理核心（headless 确定性引擎）

> 交付物：按《足球游戏·第一阶段物理核验标准》实现的确定性足球物理核心 + 门 A–D 全量验收 harness + 核验报告。
> 状态：**总判定 PASS（31 PASS / 0 FAIL / 1 观察项）**，见 `reports/verification-report.md`。

## 快速开始

```bash
npm run football:sim                # 全部门 A–D（headless），退出码 0=PASS / 1=FAIL
npm run football:sim -- --gate A    # 只跑门 A（解析解对齐）
npm run football:sim -- --gate B,C  # 组合
npm run football:sim -- --out /tmp/r # 指定报告输出目录
npx tsx examples/football/sim/verify/smoke.ts  # 开发冒烟（非验收）
```

## 架构

```
sim/src/               物理核心（零依赖纯 TS，无渲染/时钟/系统随机）
  vec3.ts              确定向量/四元数（同平台逐位一致）
  params.ts            集中参数表（铁律 6：全部系数+依据；热更新 resolveParams）
  state.ts             球体六态状态机定义 + 快照序列化
  world.ts             地面（可倾斜）/墙/门柱横梁胶囊/球网/进球判定
  core.ts              stepBall：RK4 气动积分 + 自适应子步 CCD + TOI 冲量接触 + 滞回分类
  kick.ts              踢球 API（射门/传球/带球触球，B6 区间映射，冲量事件）
  player.ts            球员（冲量输入源，out of scope 物理化）
  sim.ts               累加器步进(1/120s) + 输入事件表 + 带球控制器 + 快照/恢复
  telemetry.ts         每 tick 遥测（环形缓冲，CSV 导出）+ 轨迹哈希
  hash.ts / rng.ts     FNV-1a 64 位哈希 / 固定种子 PRNG
sim/verify/            验收 harness（门 A/B/C/D + 报告生成 + CLI）
sim/reports/           核验报告 + 全部遥测 CSV + SVG 轨迹图（数字可追溯）
```

## 关键设计（与核验标准的对应）

| 机制 | 实现 | 验收 |
|---|---|---|
| 气动段积分 | RK4（真空弹道网格点精确）+ 精确指数自旋衰减 | A1 误差 1.7e-14，A2 漂移 1.8e-13 |
| 接触 | 法向冲量+恢复系数；切向库仑摩擦（薄壁球壳停滑冲量 0.4·m·v_slip）；地面/墙/门柱 TOI 闭式回滚 | A4 回高 ±0.001%，C6 反射比 0.7200 精确 |
| CCD | 单子步位移 ≤ 0.25r（27.5mm < 门柱合并半径 170mm）+ TOI | C6 最大穿透 1.37mm |
| 状态机 | AIRBORNE/BOUNCING(≤1 tick)/SLIDING/ROLLING/REST/DRIBBLE_CONTROLLED，滚滑滞回带 0.1/0.5 | C1/C4/C5 |
| 确定性 | 零时钟/固定种子 PRNG/输入事件表/Float64 位级轨迹哈希；快照含累加器余数与哈希态 | D1/D2 哈希逐位一致 |
| 性能 | 单球中位 0.008ms/tick；22 球 0.29ms/帧 | D3 |

## 坐标系与游戏内图（第二阶段移植）的映射

- 本核心：X=右（横向），Y=上，Z=前（射门方向）；自旋方向约定按核验标准 4.1（ω=+x̂ & v=+ẑ 为上旋；ω=+ŷ 俯视逆时针）。
- 游戏内节点图（`examples/football/src`）：X=纵深（球门 ±52.5），Y=上，Z=横向。移植映射：`sim +Z ↔ game ±X`（绕 Y 旋转 90°），`sim ±X ↔ game ∓Z`。
- 参数基准：本核心 `params.ts` 默认值即单一事实源；游戏内 5Hz 图的常量（KM/KD/e 等）是同族参数的低频重标定（5Hz tick 下等效系数 ≈ 连续系数×dt 适配），第二阶段移植时从 `params.ts` 派生，不再手填。

## 已知简化（详见核验报告 §7）

1. 滚动态自旋衰减只作用于绕接触法向的分量（滚动分量由纯滚约束锁定，保 A5 一致性）。
2. 球-球切向摩擦只作用于线速度（不交换自旋）。
3. 球网不建模网顶（越过横梁上方的球正常飞过；网=背+侧）。
4. 确定性声明为「同平台同构建逐位一致」（核验标准 5.2 规则 4 允许）。
