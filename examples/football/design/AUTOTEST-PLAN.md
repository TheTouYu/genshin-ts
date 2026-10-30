# 物理自动测试台接线方案（待实施）

> doc-type: D · status: 待接线 · updated: 2026-10-30
> 背景：测试驱动体已从生产内核移出（`src-fb3/autotest/kit-autotest.driver.txt`），当前**不编入任何图**。

## 0. 为什么不再"内核里带开关"

2026-10-30 事故：测试台直接写进生产内核 `kit-loop.ts`，`fb_autotest` 置 1 后忘了关 ⇒
三次试玩全程跑脚本（日志 3440：`tag='T'` 1514 条、球被瞬移回原点 12 次），
用户看到"足球乱动 + 莫名反弹"（后者其实是 x=52.4 / z=33.7 的真实场地边界）。
结论：**测试代码不进生产图；不要用开关去管理测试代码的存在**。

## 1. 目标结构

```
src-fb3/physics-core.ts      buildPhysics(f, ctx)  ← 纯物理体（唯一一份）
src-fb3/kit-loop.ts          调 buildPhysics + IO（生产，约 470 节点）
src-fb3/kit-loop-test.ts     调 buildPhysics + applyAutoTest（测试图）
src-fb3/autotest/driver.ts   11 项初态表 + 计时/回卷 + tag='T' 回传
```

- `buildPhysics` 输入：`f`、玩家位置/朝向、输入票、`dt`、上一拍状态；
  输出：新的球状态（位置/速度/自旋/state）。**纯函数、无副作用、可离线单测**。
- 两张图共用同一份 `buildPhysics` ⇒ 物理行为逐字节一致，测试结论可直接用于生产。

## 2. 接线步骤

1. 抽 `physics-core.ts`（把 `kit-loop.ts` 的物理体整块移入，局部变量改用入参）；
2. `kit-loop.ts` 缩成：读输入 → 调 core → 写回 → 发信号；
3. `kit-loop-test.ts` = 同构 + `applyAutoTest`；
4. `assets:node-graphs create --type 20008` 建测试图 + 编辑器里加一条**独立技能配置**指向它；
5. 测试会话只挂测试图；生产会话只挂生产图（技能配置切换，不靠运行时开关）。

## 3. 验收判据

- 生产图节点数 < 500，且**不含** `fb_autotest` 一类测试变量；
- 同一场景下两张图输出的 `kit_state` 序列逐拍相等（除测试台生效的拍）；
- 测试图卸载后生产行为不变（对照实验）。

## 4. 使用方式（2026-10-30 已接线完毕）

```bash
# 切到测试图（载体技能条目 #1 → 技能配置 1191182342 → 图 1082130440）
node examples/football/scripts/kittest.mjs on
# 切回生产图（→ 技能配置 1191182341 → 图 1082130436）
node examples/football/scripts/kittest.mjs off
# 只读查看全部技能配置与绑定
node examples/football/scripts/kittest.mjs status
```

测试开关：载体 1082130445 的自定义变量 `fb_autotest`（1 = 跑 11 项，0 = 不跑）。
**生产图不读这个变量**——开关只存在于测试图。

产物对照：

| 项 | 生产 | 测试 |
|---|---|---|
| 源码 | `src-fb3/kit-loop.ts`（单一真源） | `src-fb3/kit-loop-test.ts`（由脚本生成） |
| 图 | `_GSTS_kitLoop` 1082130436（611 节点） | `_GSTS_kitLoopTest` 1082130440（759 节点） |
| 技能配置 | 1191182341 | 1191182342 |
| 编译配置 | `gsts.kit3.config.ts`（主配置含全部生产图） | `gsts.kit3-test.config.ts`（独立，单图） |
