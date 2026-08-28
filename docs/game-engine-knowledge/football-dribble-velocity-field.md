# 足球带球「速度场吸附」算法（参考版「足球地面运动」逆向还原）

> 状态：已验证（真实 GIL 逐节点 pin 追踪）
> 来源：真实 GIA/GIL 验证（`足球.gil` 节点图「足球地面运动」id=1073742433）
> 最近校验：2026-08-28
> 适用范围：游戏编辑器真实输出（参考版）；复合化实现见 `examples/football/src/composites/dribble-field.ts`

逆向样本：`/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/足球.gil`
命令：`npx tsx tools/explain-gil-node-graph.ts <gil> --graph 足球地面运动` + `parse-gil-node-graph.ts --json` 逐节点 pin 追踪

## 0. 一句话本质

参考版带球是**连续速度场吸附**：每个 tick 把球速重算为「玩家速度分量 + 朝向吸附分量」的合成，
球被持续牵引到玩家脚前，玩家转向球跟着转、玩家停球也停。**球速 = 玩家速度 ×1.2 的连续跟随**，
是一个闭环负反馈系统，不是"踢一脚滚出去"的开环脉冲。

## 1. 驱动方式

- 定时器名 `run`，间隔 **0.12s**（Assembly List 首值 0.11999999731779099），`loop=true`（循环）。
- 启动时机：`When Entity Is Created` → 读图变量 `_init`（默认 false）→ 首次置 true → `Start Timer`。
- 图变量：`_init`(bool)、`ballVx`(float)、`ballVz`(float)、`tickCount`(int)、`lastKickTick`(int)。

## 2. 每 tick 完整执行流程（精确还原）

### 2.1 读状态（局部变量身份，E<1016> 连线追溯）

| 局部变量 | 来源 | 含义 |
|---|---|---|
| 玩家实体 | `Get Self Entity` | 持球者（本图挂玩家） |
| 玩家位置 P | `Get Entity Location and Rotation`.Vec[0] | 玩家世界坐标 |
| 玩家朝向 F | `3D Vector Rotation`(玩家rot, 轴(0,0,1)) | 前向单位向量 |
| 玩家速度 vP | `Query Character's Current Movement SPD`.Flt | 速度标量（只用 Flt，不用 Vec） |
| 球实体 | `Get Entity With Specified Prefab ID`(1077936262) → `Get Corresponding Value From List`[0] | 场上球 |
| 球位置 B | `Get Entity Location and Rotation`(球).Vec[0] | 球世界坐标 |
| 球速 | 图变量 `ballVx`/`ballVz` | 上一 tick 的球速（水平） |

### 2.2 几何量计算

```text
D   = B - P                    # 球相对玩家的向量
Dn  = normalize(D)             # 相对方向单位向量
fwd = dot(F, Dn)               # 前后分量：球在玩家前方=正(1)，后方=负(-1)
dist2 = dot(D, D)              # 距离平方
```

### 2.3 合成方向（速度场核心）

```text
dir = normalize( 0.7·F + 0.3·Dn )
```

- **0.7 玩家朝向**：球主要跟着玩家面朝方向走（玩家转向，球方向立即改）。
- **0.3 相对方向**：球被拉回玩家脚前（球偏离脚前时，这个分量把它拽回来）。
- 两者归一化后就是球的目标速度方向。

### 2.4 目标球速

```text
vTarget = vP × 1.2
```

球速 = 玩家速度 ×1.2（略快于玩家，球总在脚前一点点，玩家能追上）。

### 2.5 分段 clamp（前后分量 fwd 决定两个系数 k1、k2）

**k1（前后系数，决定球在前后方向上的推力强弱）**：

| fwd 区间 | k1 | 含义 |
|---|---|---|
| fwd > 0.9 | 1.2 | 球在正前方，全力推 |
| 0.5 < fwd ≤ 0.9 | 1.0 | 球在前方，正常推 |
| 0 < fwd ≤ 0.5 | 0.5 | 球偏侧前，减半推 |
| -0.5 < fwd ≤ 0 | 0.2 | 球在侧后，弱推 |
| fwd ≤ -0.5 | 0.1 | 球在身后，几乎不推 |

**k2（左右系数，决定球在左右方向上的推力强弱）**：

| fwd 区间 | k2 | 含义 |
|---|---|---|
| fwd > 0.9 | 1.2 | 球在正前方，全力 |
| 0 < fwd ≤ 0.9 | 0.8 | 球在前方，正常 |
| fwd ≤ 0 | 0.3 | 球在身后，弱 |

> 注意：k1 和 k2 都用同一个 `fwd`（前后分量）分段，只是阈值和系数不同。
> 这是参考图的实现细节——它没有单独算"左右分量"，而是用前后分量近似控制两个方向的推力。

### 2.6 最终球速与速度向量

```text
vFinal = vTarget × k1 × k2          # 目标球速 × 前后系数 × 左右系数
velDir = dir × vFinal                # 速度向量 = 合成方向 × 最终球速
```

### 2.7 衰减与叠加

```text
ballVx = ballVx × 0.95              # 旧球速衰减（阻尼，防越滚越快）
ballVz = ballVz × 0.95
newVel = (ballVx, 0, ballVz) + velDir   # 旧速度 + 新速度向量（叠加，不覆盖）
ballVx = newVel.x
ballVz = newVel.z
```

### 2.8 写回 + 运动器

```text
Add Uniform Basic Linear Motion Device(球, "dribbleCtrl", 0.12s, (ballVx,0,ballVz))
Add Uniform Basic Rotation-Based Motion Device(球, "角度", 0.12s, 角速度, 旋转轴)
Set Custom Variable(球, "速度", (ballVx,0,ballVz))
```

- 旋转：用「球体滚动旋转计算」复合（见 §4）算角速度和旋转轴。

### 2.9 踢球节流（lastKickTick）

```text
tickDiff = tickCount - lastKickTick
踢球条件 = (tickDiff ≥ 3) AND (dist2 < 2.25) AND (fwd > -0.3)
```

- 满足条件才执行 §2.3~2.8 的完整速度场计算，并 `lastKickTick = tickCount`。
- 不满足则直接走 §2.7 的衰减 + 写回（球自然减速）。
- 作用：球离玩家太远（dist2 ≥ 2.25）或球在身后（fwd ≤ -0.3）时，不施加吸附力，让球自由滚，
  避免"隔空吸球"；tickDiff ≥ 3 是节流（0.36s 内不重复踢）。

## 3. 为什么这个算法"丝滑、能一直控球"

1. **连续负反馈**：球速每 tick 被重算为「玩家速度 + 朝向吸附」的合成，球永远被牵引到脚前。
   球偏离 → 相对方向分量把它拉回；球在身后 → k1/k2 系数降到 0.1/0.3，几乎不推（不吸身后球）。
2. **速度匹配**：球速 = 玩家速度 ×1.2，玩家跑多快球多快，玩家停球也停（速度场里 vP=0 时
   球速只剩朝向吸附残余，很快衰减到 0）。球永远不会甩开玩家，也不会被玩家撞上。
3. **转向跟手**：合成方向里 0.7 是玩家朝向，玩家转向 → dir 立即改 → 球方向立即改。
4. **阻尼稳定**：旧球速 ×0.95 衰减，球不会越滚越快，速度场收敛稳定。

## 4. 球体滚动旋转计算（复合，14 节点，纯数据）

接口：`当前旋转:Vector`、`直线速度向量:Vector`、`半径:Float` → `角速度(角度/秒):Float`、`旋转轴朝向:Vector`

```text
# 滚动轴 = 上向量 × 速度方向（右手系，球沿速度方向滚动）
axis = normalize( cross((0,1,0), 直线速度向量) )
# 角速度 = |速度| / 半径（纯滚动无滑），rad→deg
angVel = |直线速度向量| / 半径 × 180/π
# 旋转轴朝向：把世界轴转回球的局部系（球带任意朝向）
# 用当前旋转的逆旋转（YXZ 内旋）作用到 axis 上
```

> 注意：参考图里 `Division` 节点 n=10 的输入是 `1 / 0`（字面量），这是**未连线/占位**，
> 实际角速度由 n=11 `3D Vector Modulo Operation` 直接取速度模长（半径未真正参与除法）。
> 复合化版本应修正为 `|v| / 半径`。

## 5. 与当前版本（冲量踢球）的根本差异

| 维度 | 参考版（速度场吸附） | 当前版（冲量踢球） |
|---|---|---|
| 模型 | 连续速度场（每 tick 重算球速） | 离散冲量（踢一脚滚出去） |
| 球速来源 | 玩家速度 ×1.2 实时跟随 | 固定冲量 Δv，与玩家速度弱相关 |
| 球-玩家关系 | 球被"拉"到脚前，永远贴脚 | 球被"踹"出去，滚开再追 |
| 转向 | 玩家转向 → dir 立即改球方向 | 球已滚出，转向只能等下次踢 |
| 停球 | 玩家停 → 速度场衰减 → 球停脚边 | 球滚 2-3m 才停，玩家要追 |
| 定时器 | 0.12s 循环（8.3Hz） | 0.2s 一次性+自重启（5Hz） |
| 实现 | 无复合，145 节点平铺 | 复合封装（dribbleDecide 等） |

## 6. 复合化要点（把 145 节点平铺图变成复合）

参考版用大量局部变量（E<1016> 身份链）在平铺图里传递中间值。复合化时：

1. **纯数据复合** `dribbleFieldCompute`：输入（玩家位置/朝向/速度、球位置/球速）→ 输出（新球速向量）。
   把 §2.2~2.7 的几何量、合成方向、分段 clamp、衰减叠加全部封装成纯数据复合。
2. **纯数据复合** `dribbleFieldClamp`：输入 fwd → 输出 k1、k2（分段 clamp 查表）。
3. **exec 复合** `dribbleFieldTick`：读状态 → 调纯数据复合 → 写回 + 运动器 + 自重启定时器。
4. **纯数据复合** `ballRollSpin`：输入速度向量/半径/当前旋转 → 输出角速度/旋转轴（§4）。

这样既保留参考版的丝滑手感，又符合项目"复合封装、模块化"的规范。
