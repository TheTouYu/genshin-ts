---
name: gil-node-graph-reading
description: 读取真实 GIL 节点图逻辑的专用技能。当用户要求"看/读/查/追踪/分析某个节点图的逻辑"、"这个图是怎么写的"、"帮我理解这个地图的玩法逻辑"、需要核对代码生成的 .gia 与真实图写法是否一致、或需要完整梳理任意复杂/深嵌套节点图的执行链路（事件入口、控制流分支、参数来源、复合内部逻辑）时，必须使用本技能。它给出从关卡全景到单节点数据来源的完整追踪路径、explain 输出的逐符号词汇表、常见代码惯用法识别和语义自洽验证方法，让模型像读本地代码一样读真实节点图，而不是瞎猜。任何涉及真实 .gil 文件、节点图追踪、复合嵌套梳理、信号链路分析的任务都先用本技能，哪怕用户没明说"读图"。
---

# 真实节点图逻辑追踪（gil-node-graph-reading）

## 定位

目标是让模型**像读本地代码一样**读懂游戏关卡里真人写的节点图：事件入口是什么、每条执行链做什么、
分支条件数据从哪来、复合节点内部怎么写、嵌套多深都能追完。工具全是只读分析器，不修改任何图文件。

适用素材：真实关卡 `.gil` 文件（含主图 + 复合 impl 图），以及编译器生成的 `.gia`。
工具链细节见 `docs/gia-tools-reference.md`；引擎规则知识见 `docs/game-engine-knowledge/`（按需取用）。

## 工具链速查

| 工具 | 一句话定位 | 常用参数 |
|---|---|---|
| `tools/list-gil-node-graphs.ts` | 关卡全景：所有主图 + 复合目录 | `<地图.gil>` |
| `tools/explain-gil-node-graph.ts` | **人读式解读**：事件入口/控制流树/参数来源/复合内部 | `--graph <名\|id\|auto>` `--composite <名>` `--depth N` |
| `tools/scan-gil-signals.ts` | 信号全景清单（主图+impl 图全扫） | `--signal <名>` `--json` |
| `tools/trace-gil-exec-flow.ts` | 执行流机器级分析 | `--auto` `--json` |
| `tools/trace-gil-dataflow.ts` | 数据流定点：某节点输入来源 | `--node <id>` `--all-inputs` `--json` |
| `tools/parse-gil-node-graph.ts` | 底层结构化解析（变量定义/inputs/value/boundary） | `--graph` `--composite` `--json` |
| `tools/compare-gil-node-graph.ts` | 两个图/文件对比 | 见 `--help` |
| `gsts assets:node-graphs layout --check` | 布局 lint：读图并报告违规（flow-upward/backward、chain-vertical、long-chain、block-order、line-align、data-detached、data-chain-long、island、overlap） | `--gil <地图> --graph <id>` |
| `gsts assets:node-graphs read` | 单节点/单图原始 pin 值（explain 过长时的定点替代） | `--gil <地图> --graph <id> [--node <n>]` |

运行方式：`npx tsx tools/<工具>.ts <文件> [参数]`（仓库根目录下）；`gsts` 用 `npx tsx src/cli/gsts.ts <子命令>`。

## 追踪 playbook（按顺序，需要才深入）

### Step 0 关卡全景
```bash
npx tsx tools/list-gil-node-graphs.ts <地图.gil>
```
先知道关卡里有几张图、每张多大、有哪些复合。**主图和复合 impl 图是两个容器路径**
（主图 root10.1.1、复合 impl root10.4.1），list 都列出来。空图（0 节点）忽略。

### Step 1 信号全景（事件入口线索）
```bash
npx tsx tools/scan-gil-signals.ts <地图.gil>
```
信号是跨图协作的主要机制：发送节点在哪张图、监听节点在哪张图、信号带什么参数。
`--signal <名>` 定点看某个信号的完整使用清单。信号可能藏在复合 impl 内部，scan 会覆盖。

### Step 2 主图事件树
```bash
npx tsx tools/explain-gil-node-graph.ts <地图.gil> --graph <图名>
```
一次拿到：事件入口列表 → 控制流树（分支+条件来源）→ 参数来源（每个节点输入）。这就是"读代码"的主视图。
- 控制流树读不懂或太长时，先看折叠行（线性链已压缩），再按需展开
- 嵌套复合默认不展开（`--depth 0`）；要追复合内部逻辑用 Step 3

### Step 2.5 输出过长怎么办（大图必读，2026-08-09 turn-ctl 复盘）
大图（Assembly List 60+ pin 节点、长参数段）会让 explain/read 输出上千行，**不要反复跑同命令分页**：
- 只看控制流：`explain ... | grep -E "^事件:|^  (Branch|default|true|false|complete|n=)"`（跳过大段「参数来源」）
- 只看单节点：`gsts assets:node-graphs read --gil <地图> --graph <id> --node <n>`（--node 定点）
- 结构化提取：`parse --json > /tmp/g.json` 后 python 按 index 过滤（比 explain 更省 token）
- 大 pin 节点（Assembly List 等）直接跳过「参数来源」段，pin 值用 --node 定点查

### Step 3 追进复合
```bash
npx tsx tools/explain-gil-node-graph.ts <地图.gil> --composite <复合名>
npx tsx tools/explain-gil-node-graph.ts <地图.gil> --graph <主图> --depth 2   # 原地展开嵌套
```
`--composite` 显示：定义接口（inputs/outputs/inflows/outflows）→ impl 图内部解读（与主图同格式）。
复合的执行起点显示为【外部入口】（InFlow 驱动），不是孤立链。`--depth N` 递归展开嵌套复合，
循环引用自动标注。复合内部节点的数据输入显示 `← 接口 <名>`（来自调用方传参）。

### Step 4 数据流定点（查具体节点参数来源）
```bash
npx tsx tools/trace-gil-dataflow.ts <地图.gil> --graph <图名> --node <id> --all-inputs
```
控制流树只显示"执行顺序"，参数值从哪来要查数据流。`--json` 拿结构化结果（依赖路径/终端来源）。

### Step 5 语义验证（确保理解正确而不是猜）
读懂了"大概"不等于"读懂"。用这些手段验证：
- **图变量默认值**：`parse --json` 看 `graph.variables`（每个变量带初始值，如 `direction="cw"`——这决定首次行为）
- **未连线条件**：分支节点的 Bol 输入 `字面量 Default(0)/True(1)` 表示条件未连线，**默认值决定固定走哪个分支**（可能是设计，也可能是死分支）
- **几何/状态自洽**：有位移/旋转/轮转逻辑时，用数值互相验证（如旋转 90° 后坐标变换与变量轮转顺序是否吻合）
- **写而不读**：局部变量被 Set 但无任何 Get 消费 = 冗余；复合定义存在但主图未调用 = 死代码
- 复合内部能直接 `Get Node Graph Variable` 读宿主图变量（impl 与宿主共享变量空间）
- **跨图复制/清空源图场景**：动任何图之前，先 `parse --json` 把源图全量落盘（复制源 + 对比基准），与 `gil-node-graph-editing` 的安全流程第 0 步联动

### Step 6 输出报告
按下面的模板给用户报告，**疑点单独列**（不猜测，标注"需用户/游戏核验"）。

## explain 输出词汇表（逐符号）

```
事件: n=1 When Entity Is Created          ← 事件入口（n=节点号 + 节点名）
  Branch[0] → n=4 Set Node Graph Variable [变量="pivot"]   ← 执行出边：Branch[0]=默认出边
    true → n=35 ...                       ← Double Branch 的 true/false 分支
    false → n=37 ...  [条件: n=36 Equal.Bol]  ← 分支条件的数据来源
  complete → n=55 ...                     ← 复合 outflow（执行完回调）
  (与上方路径合并/循环，不再展开)           ← 汇合点：该节点前面已展开过
  n=4 ... → n=6 ... → n=8 ...（折叠行）     ← 线性链压缩：单入单出无真实条件 ≥3 节点，
                                              每 6 个断行；链内省略默认条件噪音
```

- `[变量="pivot"]`：变量设置类节点的变量名（Set Node Graph Variable / Set Custom Variable）
- `[信号="cube_turn"]`：系统信号节点（发送/监听）的信号名
- `[局部变量 ← n=34 Get Local Variable.E<1016>]`：局部变量身份来源。**E<1016> 是 Local Variable
  类型码，不是索引**；局部变量 wire 无名（引擎事实），身份只能沿 E<1016> 连线追溯
- `← 接口 pivot`：复合 impl 内部节点输入来自外部接口（调用方传参）
- `← n=10 复合:监听信号.伤害值`：数据来源 = 节点输出（n=10 复合的输出引脚）
- `← 字面量 X`：未连线的字面量值（枚举自动转名，如 `CoordinateSystemType_WorldCoordinateSystem(1201)`）
- `← 未连线`：没有来源也没有值（对复合内部，先查是否接口映射；对复合调用点，可能是真的没传）
- 【系统/复合节点】：系统节点=无 impl 图（信号类，参数行为由信号名决定）；复合节点=有 impl 图
- 【外部入口】复合由调用方 InFlow 驱动：impl 图的执行起点（不是孤立链）
- 孤立执行链：无事件入口、无外部 InFlow 的链（调试时可能短暂不启用）

## 常见惯用法（快速识别"这段代码在干嘛"）

详细模式库见 `references/patterns.md`，先记住这些高频模式：

1. **初始化链**：`When Entity Is Created` → Get Self Entity → Create Prefab 一排 + Set 图变量记录实体/位置
2. **busy 锁**：信号处理开头检查 `busy` 变量，处理结束（如运动设备停止）才解锁——防止重入
3. **方向/状态记忆**：图变量存上次状态，下次根据它取反/轮转（如 `direction="cw"` 默认值）
4. **信号参数分发**：监听信号 → Equal 链按参数匹配（face=="U" → 执行 U 面逻辑），无匹配分支=该参数无效
5. **绑定/解绑**：`Switch Follow Motion Device Target by Entity` + `Activate/Disable Follow Motion Device`
   （Relative+CompletelyFollow=绑定到目标；World+FollowLocation=回到世界）
6. **设备名约定**：`Add Basic Target-Oriented Rotation-Based Motion Device` 带设备名（如 `p2_u_cw`），
   停止事件按设备名匹配分支
7. **状态轮转**：多个变量循环赋值（`pos_ufr←pos_ufl←pos_ubl←pos_ubr←temp`）= 记录实体归属的轮换
8. **死代码信号**：未连线条件的默认分支永不执行；局部变量写而不读；旧版复合未被调用

## 陷阱清单

- **impl 图不在主图列表里**：复合内部逻辑要 `--composite <名>` 或 `--depth N` 才看得到
- **折叠行省略条件**：链内节点的 `[条件: 字面量 Default(0)]` 噪音被省略；要看条件细节用 `parse --json`
- **"未连线"可能是接口**：复合 impl 内部节点的输入显示 `← 接口 X` 是外部传参，其余未连线才是真没连
- **信号参数在发送节点**：信号带什么参数看发送节点（scan --signal 定点会列出发送/监听位置）
- **图变量默认值影响首次行为**：`direction` 这类记忆变量初始值 = 第一次运行的行为
- **空图/测试残留**：list 里 0 节点图、`GSTS_` 前缀图、`信号测试全参数` 类信号是测试/注入残留，跳过
- **不要猜**：引擎规则不确定时查 `docs/game-engine-knowledge/`；查不到就列为疑点交给用户/游戏核验

## 报告模板

```
图名 (id=..., N 节点) [范围: main/composite]
事件入口: ...
每条执行链: 入口 → 分支 → 关键操作（附关键参数）
复合: 被调用复合 + 各自内部逻辑（嵌套层级）
关键数据来源: 有疑问的节点输入
疑点（需核验）: 1. ... 2. ...
```
