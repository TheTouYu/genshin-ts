# 完整复盘：足球运动器双触发事件链 bug（2026-08-23）

> 范围：足球物理 demo 从"状态机+球门建模完整实现"到"三轮 bug 修复"的完整历程。
> 视角：运动器停止事件的多运动器双触发语义 + 日志排障方法论。
> 证据：提交 8001887…3ed2242；日志 2824（13:53，3.5MB）；真实地图 1073741908.gil。
> 状态：根因已修复（3ed2242），待用户游戏核验。

## 一、错误谱系总览

| # | 根因层 | 具体错误 | 判定 | 提交 |
| --- | --- | --- | --- | --- |
| 1 | 运动器事件语义 | 两个运动器（motionLinear physics + motionSpin spin）同时停止，`whenBasicMotionDeviceStops` 各触发一次 → physTick 每 tick 执行两次 | ✅ 真正根因 | 3ed2242 |
| 2 | 状态同步误判 | 误判为 ballPos 图变量残留导致视觉/逻辑错位，加 getEntityLocationAndRotation 同步 | ❌ 错误修复（掩盖根因） | 15c28a3 |

## 二、根因的完整调查链（现象→统计→根因→修复）

**现象（用户三轮反馈）**：球越升越高/停空中/瞬移/瞬间复位，完全测不到物理效果。

**误判路径（两轮走了弯路）**：
- 第一轮：看日志里 ballPos 图变量 = -52.47（≠球实体位置 0），误判为"图变量残留导致视觉/逻辑错位"，在 kickLaunch 加 `getEntityLocationAndRotation(e).location` 同步 ballPos。**实际反而加剧漂移**（运动器驱动的球实体位置与逻辑 ballPos 本就双触发错乱，同步把错乱值写回逻辑）。
- 第二轮：继续在 ballPos 假说里打转，读球位置轨迹看到"正常抛物线"，与用户"越升越高"矛盾。

**真正定位（统计字段分布，铁证）**：

```bash
python3 gia_log.py <日志> frames | grep "Basic Motion Device Stops" \
  | grep -oE "OUT2:String=[a-z]*" | sort | uniq -c
# 结果：
#  220 OUT2:String=physics
#  217 OUT2:String=spin
```

`whenBasicMotionDeviceStops` 被 **physics(220) + spin(217) = 437 次**触发——两个运动器（直线 duration=0.2s + 旋转 duration=0.2s）同时停止，**各触发一次事件**，physTick **每个 tick 执行两次**。

**为什么之前版本没暴露**：旧版 physTick 入口用 `flying` bool gate，第二次触发时状态已变被 gate 掉；新版状态机（state 0/1/2 分派）没有等效 gate，双触发直接导致积分翻倍 + 状态竞争。

**修复**：game.ts 的 whenBasicMotionDeviceStops 用 `evt.motionDeviceName` 过滤：

```js
f.doubleBranch(
  f.equal(evt.motionDeviceName, new str('physics')),
  () => f.callComposite(physTick, { e: ball }),
  () => {}
)
```

只响应 physics（直线运动器）停止，忽略 spin（旋转运动器）停止。编译+注入+回读通过（复合引用 16 impl 0 悬空、变量 pin 完整）。

## 三、系统性根因（2 条）

1. **多运动器驱动单事件链的双触发隐患**：`whenBasicMotionDeviceStops` 的 payload 携带 `motionDeviceName`，**每个运动器名各触发一次**。用"直线运动器 + 旋转运动器"两个运动器驱动一个 5Hz 物理 tick，就是 2 倍 tick。这是从旧版继承下来的、一直潜伏的设计隐患，旧版靠 `flying` gate 侥幸挡住，新版状态机重构移除了 gate 后爆发。

2. **日志排障只逐帧看单值，不统计字段分布**：连续两轮在"ballPos 残留"的单一假说里打转。如果第一时间统计 `whenBasicMotionDeviceStops` 事件帧的 `OUT2`（mover_name）字段分布，437 次 = physics 220 + spin 217 一眼就能定位双触发。

## 四、流程与方法论教训

- **统计字段分布 > 逐帧看单值**：日志排障优先 `grep <关键事件> | grep -oE "<字段正则>" | sort | uniq -c`，先看"什么触发了多少次"，再看单帧值。本次单帧值（ballPos=-52）误导了两轮。
- **用户方向性提示要优先采信**：用户两轮提示"运动器参数填错""总揽全局看所有日志"，是方向性线索；执着于自己先入为主的 ballPos 假说，绕了两轮弯路。
- **带 motionDeviceName 的事件要做"多源计数"自检**：任何 whenBasicMotionDeviceStops / 设备停止事件，先确认是不是被多个运动器名重复触发，再信任单次执行语义。

## 五、风险探索与未闭合项

- 游戏内物理手感（反弹 e=0.65、滚动摩擦 0.985、空气阻力 KD=0.02、马格努斯 KM=0.01）待用户核验调参。
- 进球后球停在网里、复位移回中间等闭环待用户游戏确认。
- 旧版（round 1 前）其实也有双触发隐患，靠 flying gate 侥幸挡住；其他用 flying 布尔 + 多运动器的 demo 也应检查同族风险。

## 六、产出清单

- 修复：`examples/football/src/game.ts`（whenBasicMotionDeviceStops 按 motionDeviceName 过滤）—— 3ed2242。
- 误修（保留，因 ballPos 同步本身无害但非根因）：kickLaunch 同步 ballPos —— 15c28a3。
- 证据：日志 2824（13:53，physics 220 + spin 217）。
- 复盘文档：本文档。