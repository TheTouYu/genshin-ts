# 节点图常见模式库

从真实关卡图（star-cube-nexus 备份 `backup-1073741849-pre-prune.gil`、信号测试 fixture 等）提炼的
高频写法。看到这些结构就能直接翻译成"代码语义"。每个模式标注了证据来源与验证层级。

## 1. 初始化链（实体创建时搭场景）

```text
事件: n=1 When Entity Is Created
  Branch[0] → n=4 Set Node Graph Variable [变量="pivot"] → n=6 Create Prefab → n=8 Create Prefab → …
  → n=21 Set Node Graph Variable [变量="pos_ufr"] → … → n=29 Set Node Graph Variable [变量="busy"]
```

- 创建实体后：Get Self Entity → 读自身位置（Get Entity Location and Rotation）→ 记录图变量
- 一排 Create Prefab：每个的位置 = 基准位置 + 相对偏移（3D Vector Addition），Prefab ID 是资源
- 随后一排 Set Node Graph Variable：把创建的实体/位置记录到图变量（`pos_*` 这类命名 = 位置记忆）
- 最后 Set `busy=false` 类解锁变量
- **证据**：`_GSTS_param-turn` n=1 事件链（265 节点图）；真实 GIL 解析
- **读法**：这就是"构造函数"，先看它创建了什么、记录了哪些变量，后续逻辑全靠这些变量

## 2. busy 锁（防重入）

```text
事件: n=31 复合:监听信号
  Branch[0] → n=33 Double Branch  [条件: n=32 Get Node Graph Variable.R<T>]   ← 读 busy
    true → n=35 Set Local Variable      ← busy==true：跳过（无操作）
    false → … → n=47 Set Node Graph Variable [变量="busy"] = True   ← 置忙
```

- 处理开始检查锁变量，处理结束（通常是某个设备/异步动作完成事件）解锁
- 锁变量常用名：`busy`；设备名约定 `p2_reset` 这类"复位"设备停止时解锁
- **证据**：`_GSTS_param-turn` n=31（监听 cube_turn）、n=254（p2_reset 停止 → busy=false）
- **读法**：看到 busy 检查 + 设备停止事件，基本就是"异步动作 + 锁"模式

## 3. 方向/状态记忆变量

```text
n=39 Equal: R<T> ← n=38 Get Node Graph Variable "direction"; 字面量 "cw"
n=41/42: direction = "ccw" / "cw"   （flip 时按上次方向取反）
n=54 Equal: 局部 direction == "cw" → 决定加 cw 还是 ccw 旋转设备
```

- 图变量存上次方向/状态，事件里读它做分支、写它做记忆
- **默认值关键**：图变量定义带初始值（`{"name":"direction","value":"cw"}`）——首次行为由它决定
- **证据**：`_GSTS_param-turn` 图变量 `direction="cw"`（parse --json graph.variables）；真实 GIL
- **读法**：先查 `graph.variables` 看全部变量名+初始值，再读逻辑就顺了

## 4. 信号参数分发（Equal 链）

```text
n=51 Equal: 信号.face == "U" → BindUFaceToPivot
n=58 Equal: 信号.face == "R" → BindRFaceToPivot
… 6 面 …
```

- 监听信号节点（如 `复合:监听信号`）输出信号参数（face/direction）作为数据源
- 一串 Equal + Double Branch 链 = switch-case 分发；**无匹配分支 = 该参数值无效（无动作）**
- **证据**：`_GSTS_param-turn` n=52-92；`_GSTS_tab-input` 7 组 tab 各发 `{face, direction}`
- **读法**：Equal 的第二个输入是字面量（case 值），第一个是信号参数（switch 变量）

## 5. 绑定/解绑（Follow Motion Device）

```text
Bind：  Switch Follow Motion Device Target by Entity（目标=pivot，Relative + CompletelyFollow）
        + Activate/Disable Follow Motion Device = True
Hold：  Switch Follow Motion Device Target by Entity（目标=世界，World + FollowLocation）
```

- 让多个实体跟随一个 pivot：把跟随目标切到 pivot + 启用跟随；旋转结束后切回世界坐标
- `CoordinateSystemType_RelativeCoordinateSystem(1200)`=相对跟随；`_WorldCoordinateSystem(1201)`=世界
- `FollowLocationType_CompletelyFollow(1100)`=完全跟随；`_FollowLocation(1101)`=跟随位置
- **证据**：`BindUFaceToPivot`（1610710002）/ `HoldUFaceAtTurnEnd`（1610710003）impl 图
- **读法**：看到"Switch Follow + Activate"成对出现 = 绑定；"Switch Follow + World" = 解绑

## 6. 旋转设备 + 设备名约定

```text
Add Basic Target-Oriented Rotation-Based Motion Device
  Ety=pivot, Str="p2_u_cw", Flt=2（速度）, Vec=(0, 90, 0)（旋转轴/角度）
```

- 设备名是字符串约定（如 `p2_<面>_<方向>`、`p2_reset`），停止事件按设备名匹配分支
- `When Basic Motion Device Stops` 事件带 Str 参数 = 停止的设备名
- **证据**：`_GSTS_param-turn` n=56/57/253、n=93/254 事件
- **读法**：设备名就是"消息 ID"，停止事件 = 异步回调

## 7. 状态轮转（循环移位）

```text
n=99 Set temp ← pos_ufr
n=101 Set pos_ufr ← pos_ufl
n=103 Set pos_ufl ← pos_ubl
n=105 Set pos_ubl ← pos_ubr
n=107 Set pos_ubr ← temp
```

- 一排 Set Node Graph Variable 互相赋值 = 循环轮转，记录实体归属变化
- **验证技巧**：与旋转几何互相印证——如 U 面顺时针 90° 后 (x,z)→(z,-x)，轮转顺序应该与之吻合
- **证据**：`_GSTS_param-turn` n=99-107；Hold 复合的偏移 = 旋转后新位置，逐一吻合
- **读法**：看到 temp + 一串交叉赋值，就是轮转/交换

## 8. 死代码信号

- 分支条件未连线（`字面量 Default(0)`）= 默认固定走某分支，另一分支永不执行
- 局部变量被 Set 但无 Get 消费 = 写而不读（占位/冗余）
- 复合定义存在但主图无调用 = 旧版本遗留
- **证据**：`_GSTS_tab-input` n=5（条件未连线，flip 发送永不触发）；`_GSTS_param-turn` n=35/43/252；
  1610612737-2740（定时任务/绑定然后旋转case1/解除绑定/格子变量）未被主图引用
- **读法**：这些不影响行为，但识别出来可以避免被误导（以为某功能存在）

## 9. 局部变量（无名，身份沿连线）

```text
n=34 Get Local Variable          ← 局部值身份起点（"创建局部值"），输出 E<1016>
n=46 Set Local Variable  ← n=34.E<1016>；值 ← 图变量 pivot   ← 写入
n=54 Equal  ← n=44 局部值.R<T>     ← 消费
```

- `Get Local Variable`（vendor id 18）：inputs [R<T>]（类型），outputs [E<1016>, R<T>]
- `Set Local Variable`（vendor id 19）：inputs [E<1016>, R<T>]——E<1016> 是身份引用（来自某 Get 的输出），
  R<T> 是要写的值
- 局部变量 wire 无名，**不能按名映射**；身份只能沿 E<1016> 连线追溯
- **证据**：`_GSTS_param-turn` n=34-50；vendor `node_pin_records.ts`；结论见
  `docs/game-engine-knowledge/variables.md`
- **读法**：局部变量 = "线程局部临时值"，在链上传递，跨链不可见

## 10. 复合内部读宿主图变量

```text
GetCubiesAtPositions（复合，接口 inputs=无）内部：
  n=2 Get Node Graph Variable "pos_ufr" → 输出 ufr:Entity
```

- 复合 impl 内部可以直接 Get/Set Node Graph Variable 读**宿主主图**的图变量（共享变量空间）
- 所以"接口 inputs=无"的复合也可能依赖外部状态——别以为它无输入就无依赖
- **证据**：`GetCubiesAtPositions`（1610710001）impl 图；真实 GIL 解析
- **读法**：复合内部看到 Get Node Graph Variable，去宿主图变量定义里找名字
