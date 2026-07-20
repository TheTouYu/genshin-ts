# 客户端节点支持计划

> 状态：当前推荐 / 已验证（WP0、WP1、WP1-Sync、WP-B、WP-C、TS→IR→GIA 信号闭环已完成；客户端已有地图信号的标量/entity-GUID/列表组合图和共享布局已完成自动回归与用户游戏核验）
> 来源：当前代码实现 + 固定 vendor 候选数据 + 官方节点资料 + 真实客户端 GIA 观察 + 目标地图信号资源 + 用户游戏验证
> 最近校验：2026-07-19
> 适用范围：gsts 客户端节点支持实施计划；生产 TS→Client IR→GIA 当前仅覆盖本文记录的客户端 signal/list/data-source 组合，不代表全量客户端节点支持

本文档记录 gsts 增加客户端节点支持的当前权威计划，防止跨会话丢失设计决策、证据边界和验证门禁。

客户端 GIA 字段、signal、VarBase、列表 assembly 和 wire 编码细节以
[`client-gia-encoding.md`](./client-gia-encoding.md) 为专门权威入口；本文保留路线、API、阶段工作包和支持边界。

当前必须明确区分：

- **当前代码事实**：`g.client()`、Client IR、客户端 Stage 3 lowering 和共享布局路径已经存在，并覆盖本文明确列出的 skill signal/list/data-source 组合；未覆盖节点族仍不得从该闭环外推。
- **上游候选事实**：第三方原仓库包含客户端节点、类型和图编码候选，但其数据版本和准确性不能替代真实编辑器样本。
- **已冻结设计决策**：本文“已冻结方案”各节记录本轮共同确认的产品和架构方向。
- **真实 GIA 观察**：两个客户端 `skill` 图样本已提供图级 metadata、节点 identity、物理 pin 和 wire round-trip 基线；结论不得外推到未取样节点族。
- **待验证假设**：未取样节点的 hidden pin、Fixed/Variant identity、`gameVersion` 兼容语义和行为仍需后续真实 GIA、编辑器与游戏验证；首个 `Play Timed Effects` 样本的游戏行为已经用户确认。
- **完成证据**：自动生成、编辑器导入、编辑器回导对拍和游戏行为验证是不同层级。

## 1. 目标与非目标

### 1.1 最终目标

为 gsts 增加可维护、可审计的客户端节点编译能力：

```text
TypeScript 客户端 DSL
→ .gs.ts
→ ClientIRDocument
→ 客户端 GIA
→ 编辑器导入/回导对拍
→ 游戏行为验证
```

最终覆盖目标分为两个统计口径：

1. **客户端节点数据覆盖**：生成器识别、分类和审计上游全部客户端节点。
2. **用户公开 API 覆盖**：编辑器公开节点按风险族完成放行门槛后进入正式 API。

Hidden/Test 节点计入数据覆盖，但默认不计入用户公开 API 覆盖。

### 1.2 当前非目标

以下能力不属于首批典型节点闭环，也不因“全量节点 API”自动获得支持：

- 客户端 Composite；
- 客户端 Graph variables；
- 客户端注入、地图扫描或目标图替换；
- 未审计的低层 raw client node API；
- 同一入口文件混写服务器图和客户端图；
- 多游戏版本客户端兼容层；
- 以 `any`、`unknown` 或警告模式暴露尚未验证的客户端节点。

这些能力应在取得各自真实 GIA 证据后建立独立工作包。

## 2. 当前实现审计

### 2.1 已存在的客户端 IR 外形

`src/runtime/IR.d.ts` 当前已经定义：

```ts
export type IRDocument = ServerIRDocument | ClientIRDocument

export type ClientIRDocument = SimplifyDeep<
  BaseIRDocument & {
    graph: ClientGraphInfo
    nodes?: ClientNode[]
  }
>

export interface ClientGraphInfo {
  name?: string
  id?: number
  type: 'client'
}
```

这只说明 Client IR 是跨阶段契约的一部分；当前支持范围还需要结合运行时、Stage 3、真实 GIA、自动回归和游戏验证共同判断。

### 2.2 当前运行时实现

当前 `src/runtime/client.ts` 已提供：

- `g.client({ type: 'skill', id })`；
- `ClientGraphRegistry`；
- `ClientExecutionFlowFunctions`；
- `onStart()`；
- 客户端语义节点和值的 Client IR builder；
- 当前 signal/list/data-source 支持范围内的值校验和列表上限校验。

该运行时只覆盖本文冻结的客户端 skill 生产范围，不等于全量客户端节点 allowlist。

### 2.3 当前 Stage 3 实现

`src/compiler/ir_to_gia_transform/index.ts` 已按 `ir.graph.type` 分发客户端路径；客户端由
`src/compiler/client_ir_to_gia.ts` 消费 Client IR，并通过 `gia_vendor.ts` 使用客户端 legacy
materializer。客户端路径独立处理：

- client skill graph metadata；
- 客户端节点 identity；
- `ClientVarType`、`VarBase` 和 `ConcreteBase`；
- signal/list/data-source 的物理 pin；
- `OutParam → InParam` 数据边和 `OutFlow → InFlow` 控制边；
- 共享布局算法及客户端 raw 坐标写入。

服务端 Composite、server graph variables 和服务器 `VarType` 不进入客户端普通 lowering。尚未
开放的客户端节点族仍必须通过独立 adapter、真实 GIA 和分层回归后才能加入公共 API。

### 2.4 当前 vendored 能力边界

当前 `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/` 已包含部分客户端数据：

- `CLIENT_NODE_ID`；
- protobuf `ClientVarType`；
- 客户端类型候选；
- `Graph` 类型中的 `bool | int | skill` 外形。

但当前 vendored `gia_gen/basic.ts` 的生产图物化仍主要采用服务器 GraphUnit、NodeGraph 和
`VarType` 规则。不能因接口接受客户端 mode，就声称最终 wire 已经支持客户端图。

### 2.5 外部上游候选

只读调查仓库：

```text
/home/h/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack
```

上游候选数据统计（来自其 `utils/node_data/data.json`，不是当前游戏真值）：

- 客户端节点：124；
- Fixed：102；
- Variant：22；
- 客户端枚举类型：48；
- Domain：Arithmetic 39、Query 42、Execution 35、Control 1、Others 3、Hidden 4。

其客户端实现还表明以下高风险差异：

- 客户端 concrete identity 可由 generic shell ID、kernel ID 和泛型类型共同组成；
- 部分客户端执行节点共享 kernel（候选值常见为 `2000`）；
- 节点语义可能由隐藏 Type-5 opcode/default pin 区分；
- 客户端 pin 使用 `ClientVarType`，不能复用服务器 `VarType`；
- 客户端图候选类别为 `bool | int | skill`；
- 客户端与服务器 graph constants 不同。

这些内容只有与第 10.3 节两个真实样本一致的部分获得了样本级支持；其余仍是**编码候选**，不能升级为编辑器规范。

## 3. 已冻结的产品路线

### 3.1 总体顺序

采用以下顺序，不允许跳过首轮真实验证直接宣称全量支持：

```text
Phase 0：取得并分析最小真实客户端 GIA（已完成两个样本的语义与 wire 基线）
→ Phase 1：典型 API 闭环
→ 首次编辑器导入、回导结构对拍和游戏行为验证
→ 跨端信号专项
→ 按节点族分批开放全量公开 API
→ 持续编辑器/游戏验证
```

### 3.2 首批公共图类型

第一版公共 API 只支持 `skill` 客户端图，实际公共类型为：

```ts
type SupportedClientGraphType = 'skill'
```

内部 IR/数据模型可以预留：

```ts
type ClientGraphType = 'bool' | 'int' | 'skill'
```

但 `bool` 和 `int` 必须分别取得真实图证据后才进入公共类型。不得让类型提示包含暂不可用值。

### 3.3 用户入口 API

冻结的首版入口为：

```ts
g.client({
  type: 'skill',
  id: 1082130433
}).onStart((f) => {
  // 客户端节点
})
```

约束：

- `type` 必填；
- `id` 必填；
- `onStart()` 每张客户端图只能声明一次；
- `onStart()` 第一版只传 `f`，不伪造空 `evt` 或推测性上下文；
- `Node Graph Begins` 由运行时/编译器隐式物化，不作为普通公共节点；
- 上下文通过已验证的客户端查询节点取得，例如 `getSelfEntity()`；
- 客户端第一版每个入口文件最多声明一张客户端图。

### 3.4 图 ID 契约

当前上游候选给出的客户端图 ID 起点是：

```text
1082130432
0x40800000
```

首版按当前已知范围严格校验：

```text
1082130432..1082169753
0x40800000..0x40809999
```

规则：

- 越界直接报错；
- 同次编译重复 ID 直接报错；
- 不要求 ID 连续；
- 不自动选择“下一个”ID；
- 用户从编辑器或项目规划中提供 ID；
- 该 ID 是生成图身份，不等同于注入授权，也不能由编译器猜成地图目标 `nodeGraphId`；
- 若真实编辑器样本出现范围外合法 ID，应先保留样本和证据，再调整范围。

### 3.5 文件组织

采用以下硬边界和维护建议：

- 同一入口文件不得混合声明 `g.server()` 与 `g.client()`；
- 普通业务代码推荐一文件一图；
- 推荐 `server/`、`client/` 分目录；
- 暂时保留现有同文件多服务器图能力，避免客户端功能造成无关破坏性变更；
- 第一版客户端文件最多一张客户端图。

推荐结构：

```text
src/
├── server/
│   ├── combat-system.ts
│   └── signal-receiver.ts
└── client/
    └── skill-effects.ts
```

## 4. 首批典型 API

首批公开能力冻结为：

| API/能力 | 主要验证目标 |
|---|---|
| 隐式 `Node Graph Begins` | 客户端 skill 图入口、graph metadata 和执行链起点 |
| `getSelfEntity()` | 无参查询、客户端 Entity 输出 |
| `getEntityPosition(entity)` | 客户端数据连接和 Vector 输出 |
| `addVector3(a, b)` | 客户端 Variant/concrete identity |
| `doubleBranch(condition, trueBranch, falseBranch)` | 多 OutFlow 与回调执行流 |
| `playTimedEffects(...)` | 执行节点、共享 kernel/hidden pin、多种字面量 |

用户侧命名复用相同语义的服务器方法名，但只复用名称和用户语义：

- 客户端定义独立生成；
- 客户端节点身份独立；
- 客户端 pin schema 独立；
- 两端签名不同时保留各自真实签名；
- 不增加冗余 `client` 方法名前缀。

`sendSignalToServerNodeGraph` 不进入第一份基础闭环。它在基础图验证后作为第一个独立专项，原因是上游候选已经提示其可能依赖 complex definition，不能当作普通节点处理。

## 5. TypeScript 子集

首批支持经过白名单审计的普通 `if/else`：

```ts
if (condition) {
  f.playTimedEffects(...)
} else {
  f.playTimedEffects(...)
}
```

Stage 1 必须在客户端回调上下文中降低为客户端 `double_branch`，不能静默生成服务器节点。

同时保留显式形式：

```ts
f.doubleBranch(condition, () => {}, () => {})
```

首批向量加法使用显式：

```ts
const target = f.addVector3(position, offset)
```

以下语法在所属节点族完成审计前必须明确拒绝，而非回退到服务器 lowering：

- 未审计的标量算术和比较运算符；
- 循环；
- 列表语法；
- 变量重写；
- 其他依赖未支持客户端节点的语法糖。

诊断应说明当前客户端 skill 图尚不支持该语法，并引导用户使用已经开放的客户端节点 API。

## 6. 定义和生成策略

### 6.1 来源分层

多个来源冲突时采用分层裁决：

| 内容 | 首选来源 |
|---|---|
| 用户可见名称、描述和参数语义 | `resources/node_definitions.json` |
| shell/kernel、物理 pin 候选、hidden/default、Variant identity | 固定版本 vendor 快照 |
| 最终编辑器编码规律 | 当前版本真实客户端 GIA；现有两个样本内部 `gameVersion=6.7.0` |
| gsts 当前行为 | 当前源码和自动回归 |

生成器对账：

```text
官方参数
↔ shell 可见 pin
↔ kernel 物理 pin
↔ hidden/default injection
```

节点进入公共 allowlist 的最低条件：

- 可见参数可以一一映射；
- 输入输出方向一致；
- 类型可映射到当前 runtime ValueType；
- hidden pin 有明确默认值或专用 adapter；
- Fixed/Variant identity 可唯一解析；
- 没有未解释的 pin 空洞或来源冲突。

冲突节点必须：

- 写入机器可读诊断报告；
- 不进入公共类型；
- 不使用 `any`、`unknown` 或静默默认掩盖；
- 取得最小真实 GIA 后再修正数据、adapter 和回归。

### 6.2 生成器从第一天面向全量

不先手写五个 API 再推翻。生成器从开始读取和分析全部客户端节点，但首批只公开 allowlist。

建议生成物（具体命名可在实现前按现有生成器结构复核）：

```text
src/definitions/client_nodes.ts
src/definitions/client_enums.ts
src/definitions/client_node_metadata.ts
src/definitions/client_zh_aliases.ts
```

这些文件均属于生成物，不手改。

### 6.3 静态方法与共享调用内核

公共 API 生成真实静态 TypeScript 方法，不使用动态 `Proxy`：

```ts
getEntityPosition(target: EntityValue): Vec3Value {
  return this.invokeGeneratedClientNode(CLIENT_NODE_KEYS.getEntityPosition, [target])
}
```

分工：

- 生成方法：稳定 API 名、类型签名和返回类型；
- 共享客户端调用内核：支持状态、公开参数校验、IR 节点和输出标记；
- Stage 3 client adapter：kernel identity、KernelIndex、hidden/default、`ClientVarType` 和物理 pin；
- 专用 adapter：入口、`doubleBranch`、signal complex definition 和其他异常节点。

不得为了减少代码而将客户端 `f` 强转成服务器 `f`。

### 6.4 中文别名

首批英文 API 与中文别名同时支持，例如：

```ts
g.client({ type: 'skill', id, lang: 'zh' }).onStart((f) => {
  const self = f.获取自身实体()
})
```

约束：

- 中英文按稳定节点身份匹配，不按资源数组下标匹配；
- 优先使用官方中文显示名，再与 vendor Identifier、英文名和 alias 对账；
- 无法唯一匹配时不生成中文别名；
- 中文缺失不阻塞可靠英文 API；
- 中文覆盖率单独统计；
- 中文别名只影响用户方法名，不改变 IR node type 或客户端 identity。

## 7. 运行时与值模型

### 7.1 Registry 架构

不在现有服务器 `MetaCallRegistry` 中散布大量 `if (client)`，也不复制整套服务器 registry。

目标为渐进抽取：

```text
GraphRecordCore
├── 节点 ID 分配
├── exec/data node records
├── tail endpoints
├── flow/data edges
├── branch context
└── value ownership

ServerGraphRegistry
├── server events
├── classic/beyond
├── server subtype
├── Composite
├── graph variables
└── ServerExecutionFlowFunctions

ClientGraphRegistry
├── onStart
├── client graph type
├── client node allowlist
├── ClientExecutionFlowFunctions
└── Client IR builder
```

实施时不为追求理想结构预先重写整个服务器运行时。只抽取客户端首批真正需要的无端语义内核，并用服务器 focused 回归证明 IR 输出未改变。

### 7.2 值类型

基础字面量构造器两端共用：

```text
bool / int / float / str / vec3 / guid / entity
configId / prefabId / faction
```

它们表达用户语义值，不预先绑定 protobuf `VarType` 或 `ClientVarType`。

节点输出必须记录所属 registry/graph，禁止跨图直接接线。Stage 3 按图端选择底层类型：

```text
server vec3 → VarType.Vector
client vec3 → ClientVarType.Vector_
```

客户端枚举独立生成和解析。即使显示名与服务器枚举相同，也不得按名称复用服务器 enum ID。

首批只实现客户端所需的最小 value ownership，不借机无范围地改变现有服务器行为。

## 8. Stage 3 和 vendor 边界

### 8.1 Stage 3 显式分发

目标入口应按判别字段分发，而不是在服务器路径中散布 client 条件：

```ts
export function irToGia(ir: IRDocument, opts: IrToGiaOptions) {
  return ir.graph.type === 'client'
    ? clientIrToGia(ir, opts)
    : serverIrToGia(ir, opts)
}
```

客户端 lowering 负责：

- client graph category；
- client graph ID；
- client graph metadata；
- client node identity；
- `ClientVarType`；
- 客户端字面量、执行流和数据流；
- hidden/default injection；
- Variant concrete identity。

服务器 Composite、server graph variables 和服务器 signal 逻辑不应进入客户端普通 lowering。

### 8.2 Vendor 同步路线

禁止直接手改项目 `src/thirdparty/`，也禁止把 vendor 数据复制到 `resources/` 绕过同步。

冻结路线：

```text
当前 compat/genshin-ts-legacy-schema schema 基线
→ 建立客户端兼容工作分支/工作树
→ 在 legacy Root/GraphUnit schema 上增加真实样本约束的最小客户端物化 seam
→ 保留 field-101 Composite 兼容补丁
→ 运行 vendor server/client focused tests
→ 形成明确 vendor commit
→ 同步该 commit 的必要快照到 genshin-ts
→ 项目只通过 gia_vendor.ts/adapter 使用
```

`compat/genshin-ts-legacy-schema@497d9ec` 的精确边界是 protobuf schema 和 field-101
回归基线，不是可独立运行并整体同步的完整 legacy encoder 基线。当前审核后的客户端补丁头为
`compat/genshin-ts-client-legacy-schema@4033eaf`：功能提交 `5e05133` 增加 materializer 和
focused tests，后续提交 `4033eaf` 将旧 DSL fixture `src/test/test_def.ts` 排除出标准 TypeScript
项目，并明确 materializer 的 protobuf wire-presence 类型桥接。该分支中的旧
`utils/gia_gen/graph.ts` 仍引用后来数据重构中删除的 `node_id.ts`、
`node_pin_records.ts`、`helpers.ts` 和 `concrete_map.ts`；因此不得从该分支整目录覆盖项目
vendor 快照。

legacy 客户端数据/编码历史提交 `3309af7`、`ddb3112`、`2a411a4` 和 `7ef34e2`
均已是 `497d9ec` 的祖先，不需要再次 cherry-pick。`c4f867d` 修改的是新
`AssetBundle/ResourceEntry/PinInterface` schema，只能作为字段语义辅助来源，不能移植到当前
`Root/GraphUnit/CompositeDef` schema。

不顺带引入：

- 上游全新 AssetBundle schema；
- 与客户端闭环无关的大规模数据重构；
- 对现有 Composite 编码的替换；
- 未经真实样本校正的全量客户端公共 API。

在实际修改 vendor 分支、执行 commit 或同步前，必须再次向用户列出：

- 来源提交；
- 目标分支/工作树；
- 影响文件；
- 再生成步骤；
- vendor 和项目验证命令；
- 对当前未提交工作树的避让方案。

未经明确授权不执行 `git commit` 或分支操作。

### 8.3 可复现来源

项目日常生成流程不得依赖：

```text
/home/h/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack
```

该外部仓库只用于准备、研究和验证 vendor 补丁。合入后的 `npm run gen` 必须只读取仓库内固定来源：

- `resources/node_definitions.json`；
- 固定版本 vendor 快照；
- 项目生成 adapter。

这样同一个 genshin-ts commit 在 CI 和其他机器上能重现相同定义。

## 9. 分批全量支持

生成器始终分析全部客户端节点，但公共 API 按风险族放行：

1. **基础闭环**：入口、查询、数据连接、Vector Variant、分支、典型执行节点。
2. **普通 Fixed 查询和算术节点**：无未解释 hidden pin/complex definition。
3. **Variant/泛型节点**：比较、算术、列表等 concrete identity。
4. **客户端枚举节点**：客户端 enum type/value 严格与服务器分离。
5. **共享 kernel 执行节点**：shell/kernel 和 hidden opcode 明确。
6. **跨端信号和 complex definition**：`sendSignalToServerNodeGraph` 专项。
7. **异常和高风险节点**：hitbox、上游手工修补、pin 类型冲突等。

每批放行门槛：

```text
来源对账通过
→ 生成诊断无未解释冲突
→ TypeScript 类型测试
→ IR 回归
→ GIA 结构回归
→ 代表节点编辑器回导对拍
→ 扩大公共 allowlist
```

节点内部状态建议至少包括：

```text
recognized
reconciled
lowering-ready
structure-tested
editor-roundtrip-verified
game-verified
blocked
```

尚未开放的节点：

- 不进入公共类型；
- IDE 不展示；
- 通过 `any`、手写 IR 或 `.gs.ts` 绕过时，运行时或 Stage 3 仍拒绝；
- 覆盖报告说明阻塞原因、节点族和缺失证据；
- 不提供 `experimental` 或 `f.internal.*` 公共后门。

Hidden/Test 节点默认只用于数据完整性、类型探测和 complex definition 研究。只有真实编辑器证据证明其是稳定公开能力后，才重新决定是否提升。

## 10. Phase 0：真实样本门禁

### 10.1 第一份样本（已到达）

生产实现开始前要求提供独立测试用客户端 `skill` 图；本轮已收到以下最小结构：

```text
Node Graph Begins
→ Play Timed Effects
```

推荐使用易辨识的非默认参数：

```text
位置：[1, 2, 3]
旋转：[10, 20, 30]
缩放：1.25
默认音效：No
```

特效配置 ID 必须由用户选择并确认在当前环境有效。不得由编译器维护者猜测资源 ID。

本轮已从文件内部完成文件与图 ID 配对，不能按文件顺序猜测：

```text
播放限时特效.gia          → 1082130433
播放限时特效-变量版本.gia → 1082130434
```

字面量样本中观察到配置 ID `27`、位置 `[1,2,3]`、旋转 `[10,20,30]`、缩放
`1.25` 和默认音效枚举值 `0`。这些是文件编码观察，不证明资源在游戏中有效，也不证明默认音效的实际行为。

### 10.2 样本到达后的只读步骤

第一轮只执行：

```text
原始 GIA 只读解码
→ 提取 graph/node/pin/wire 事实
→ 与上游候选逐字段对账
→ 报告冲突和证据等级
→ 确定 vendor 兼容补丁精确范围
→ 再请求修改与 vendor commit 授权
```

不得自动：

- 注入；
- 覆盖地图或业务图；
- 猜 `mapId` / `nodeGraphId`；
- 修改游戏文件；
- 在真实样本校正前同步大批 vendor 快照。

### 10.3 两份真实样本的 WP0 证据

#### 样本与命令

样本来源使用不含本机用户名的相对描述：

```text
Beyond_Local_Export/user_edit/客户端/播放限时特效.gia
Beyond_Local_Export/user_edit/客户端/播放限时特效-变量版本.gia
```

2026-07-17 执行了以下只读检查；`<export>` 表示本机定位到的
`Beyond_Local_Export` 目录：

```bash
sha256sum '<export>/user_edit/客户端/播放限时特效.gia' \
  '<export>/user_edit/客户端/播放限时特效-变量版本.gia'
stat -c '%s %n' '<export>/user_edit/客户端/播放限时特效.gia' \
  '<export>/user_edit/客户端/播放限时特效-变量版本.gia'
NODE_OPTIONS='--no-deprecation' npx tsx tools/decode-gia.ts \
  --check-header --compact '<file.gia>'
```

无修改 round-trip 使用显式
`src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto`
加载 `protobufjs` message，直接执行 message decode→encode，再包装为 GIA 容器。该临时核验脚本位于
`/tmp`，没有写入仓库或修改生产工具。

| 文件 | 原始/回编码大小 | 原始/回编码 SHA-256 | 逐字节比较 |
|---|---:|---|---|
| `播放限时特效.gia` | 585 / 585 bytes | `0470fa9acc2d5ca4b16d6bc6ff735266abbece97a73032ee9fda1d6e641cc0cb` | 相同，0 个差异 |
| `播放限时特效-变量版本.gia` | 1544 / 1544 bytes | `d52127d7c6501bdf0f893bf7831206be461787394392ddee0c9ab9966188525a` | 相同，0 个差异 |

两份文件的容器头校验均通过。完整容器和 protobuf payload 都能逐字节 round-trip，说明当前
schema 对这两个样本没有观察到未知字段丢失或字段重排；这不证明 schema 已覆盖其他客户端图。

`decode_gia_file()` 会通过 `{ defaults: true }` 转成普通对象。将该对象交给
`encode_gia_file()` 会把默认值显式重编码，两个文件分别变为 625 和 1706 bytes。因此该 helper
组合适合语义解码，不适合作为 wire-preserving round-trip；上述 wire 结论来自 message 直接回编码。

#### 共同图级 metadata

两个样本都观察到：

```text
GraphUnit.id.class = 1
GraphUnit.id.type = 3
GraphUnit.which = 11
NodeGraph.id.class = 10000
NodeGraph.id.type = 20002
NodeGraph.id.kind = 21001
NodeGraph.entrySlotIndex = 1
accessories = []
gameVersion = "6.7.0"
```

`GraphUnit` ID 与内部 `NodeGraph` ID 在各自文件内一致。`id.type=3` 与客户端图候选一致，
`which=11` 与 skill 图候选一致。`gameVersion` 只记录为样本字段值；它是否参与兼容或运行行为仍待验证。

#### 字面量版本

`播放限时特效.gia` 只有两个节点：

1. `Node Graph Begins`：node index `1`，shell `200042`，kernel `2001`，
   `contextDeclaration={ kind: 6, index: 0 }`；OutFlow `0` 连接节点 2 InFlow `0`。
2. `Play Timed Effects`：node index `2`，shell `200038`，kernel `2000`。

`Play Timed Effects` 的数据 pin 为：

| `i1.index` | `i2.index` | `ClientVarType` 数值 | 样本值 |
|---:|---:|---:|---|
| 0 | 4 | 18 | config ID `27` |
| 1 | 1 | 11 | vector `[1,2,3]` |
| 2 | 2 | 11 | vector `[10,20,30]` |
| 3 | 3 | 7 | float `1.25` |
| 4 | 0 | 3 | hidden int `0`，`alreadySetVal=false` |
| 5 | 5 | 5 | bool/enum `0`，`alreadySetVal=true` |

另有一个 `kind=5` client binding pin：

```text
i1/i2 = { kind: 5, index: 0 }
type = 3
value = int 0, alreadySetVal=false
clientExecNode = { kind: 5, index: 1, nodeId.id: 200038 }
```

不能把 hidden int pin 4 直接命名为 opcode。样本同时在
`clientExecNode.nodeId.id=200038` 中明确记录 shell 身份；两者具体运行语义仍待游戏证据。

与上游 `utils/node_data/data.json` 的样本级对账一致：`Node Graph Begins` 为 shell
`200042`/kernel `2001`，`Play Timed FX` 为 shell `200038`/kernel `2000`，公开 pin
类型为 Cfg/Vec/Vec/Flt/Bol，中间存在 hidden Int pin。真实样本还证明不能假设客户端节点所有
`i1/i2` index 相同：config pin 为 `0→4`，hidden int pin 为 `4→0`。后续实现应以物理 pin
adapter 表达该差异，而不是用公开参数顺序猜测。

#### “变量版本”的范围

`播放限时特效-变量版本.gia` 的：

```text
innerGraph.graphValues = []
```

它使用节点链，而不是 GraphVariable metadata：Get Self Entity（shell `200033`/kernel
`1013`）、Get Custom Variable<bool>（`200016`/`40`）、Set Local Variable<bool>
（`200081`/`2000`）、Get Local Variable<vec|bool>（`200082`/`1036`）、Get Custom
Variable<float>（`200016`/`42`）和 Play Timed Effects（`200038`/`2000`）。执行流为：

```text
1 (Graph Start) → 6 (Set Local Variable<bool>) → 8 (Play Timed Effects)
```

数据流为：

```text
5.0 (Get Self) → 3.0 (Get Custom Variable<bool> target)
3.0 → 6.1 (Set Local Variable<bool> value)
4.0 (Get Local vec) → 8.2 (rotation)
9.0 (Get Custom Variable<float>) → 8.3 (scale)
10.0 (Get Local bool) → 8.5 (play default sfx)
5.0 (Get Self) → 9.0 (Get Custom Variable<float> target)
```

样本中的 custom/local variable 名称分别为 `自定义变量` 和 `布局变量`。该文件只为客户端
custom/local variable 节点及 Variant identity 提供候选证据；它不证明 `g.client({ variables })`
或客户端 `graphValues` 编码，因而不扩大首批 Client Graph variables 范围。

#### 工具和证据边界

当前 `tests/composite/gia-inspect.ts` 对这两个客户端图输出 `which: undefined`、`nodes: 0`，
而 schema 解码明确得到 `which=11` 和实际节点。这是 inspect 工具按服务器/旧结构取字段的已知限制，
不能据此判断样本为空；WP0 不修改该工具。

本节证明两个真实文件的结构与 wire 可由当前 schema 无损读取，并校正了首个 skill 图的
metadata、identity 和 pin 候选。它不证明 gsts 已能生成客户端图，不证明编辑器导入或回导行为，
不证明特效/变量节点游戏行为，也不授权注入。

### 10.4 WP1 materializer 编辑器与游戏验证

2026-07-17，vendor worktree 的 `client_legacy.ts` 从结构化参数物化了与字面量参考样本逐字节一致的
standalone GIA，并复制为：

```text
Beyond_Local_Export/gsts-WP1-client-materialized.gia
```

导入前文件为 585 bytes，SHA-256 为
`0470fa9acc2d5ca4b16d6bc6ff735266abbece97a73032ee9fda1d6e641cc0cb`。用户确认：

1. 客户端 skill 图编辑器导入成功；
2. `Node Graph Begins → Play Timed Effects` 的节点、连线和参数显示正确；
3. 未做无关编辑后重新导出成功；
4. 游戏中实际触发并观察到预期特效行为。

回导文件仍使用上述文件名。只读对拍观察到回导文件为 599 bytes，SHA-256 为
`9140e166840e8739bfc15f451dca6842cc781c266dae42ca1e1b94acd2220deb`。schema 语义 diff 只有：

```text
graph.id.id:                  1082130433 → 1082130435
graph.name:                   新建角色技能节点图 → 新建角色技能节点图_2
inner graph.id.id:            1082130433 → 1082130435
inner graph.name:             新建角色技能节点图 → 新建角色技能节点图_2
filePath:                     编辑器按回导文件名和新时间戳重写
```

`which=11`、`gameVersion="6.7.0"`、两个节点、shell/kernel identity、物理 pin、hidden pin、
client binding、执行连接和参数值均无语义差异。将上述 5 个图身份/导出元数据字段归一化后，导入前与
回导后的 protobuf payload 均为 561 bytes 且逐字节一致。

这构成首个字面量 `Play Timed Effects` client skill 图的自动编码、编辑器导入、回导结构/wire
对拍和游戏行为闭环。范围只覆盖该样本，不证明其他客户端节点、Variant、变量、分支、signal、
`g.client()` 或生产 Stage 3 已受支持。此次只复制 standalone GIA，没有注入或操作地图图 ID。

### 10.5 Double Branch 材料化与游戏验证（已完成）

2026-07-17，通过项目稳定 vendor adapter 直接构造并生成了两份 Double Branch 候选 fixture，
使用已验证的 Play Timed Effects 承载两个分支输出。两份文件为：

```text
gsts-客户端双分支-候选-条件是.gia   graph ID: 1082130439
gsts-客户端双分支-候选-条件否.gia   graph ID: 1082130440
```

图结构：

```text
Node Graph Begins
→ Double Branch
   ├─ OutFlow shell 0 / kernel 1 → Play Timed Effects A，位置 [10, 0, 0]
   └─ OutFlow shell 1 / kernel 2 → Play Timed Effects B，位置 [-10, 0, 0]
```

两份文件均通过自动检查：容器头校验、protobuf message 逐字节 round-trip、container 逐字节
round-trip。复制到游戏导出目录后，用户手动导入客户端 skill 图位置，在编辑器中目视确认节点、
条件和两个分支连接正确，重新导出后结构化对拍无意外字段改写，并在游戏中实际触发确认：

- **条件为【是】→ OutFlow shell 0 / kernel 1 → 位置 [10, 0, 0] 播放**
- **条件为【否】→ OutFlow shell 1 / kernel 2 → 位置 [-10, 0, 0] 播放**

这完全校正了第三方 `data.json` 对 Double Branch 的标记 `__todo_set_in_manually`。

并明确：

- shell `200056` / kernel `2000` 为客户端 Double Branch 身份；
- Condition pin 对应 `shell InParam 0 → kernel InParam 1`，类型 `ClientVarType.Boolean_`；
- True OutFlow 对应 `shell OutFlow 0 → kernel OutFlow 1`；
- False OutFlow 对应 `shell OutFlow 1 → kernel OutFlow 2`；
- 存在 kind-5 client binding pin，类型 `ClientVarType.UnknownVar_`，指向 shell `200056`；
- 不包含隐藏 discriminator 或已解释字段之外的其他 pin。

本次生成使用项目稳定 vendor adapter (`src/compiler/gia_vendor.ts`，`client_legacy.ts`)，
不依赖生产 `g.client()`、Stage 1、Stage 3 或完整编译管线。没有注入、没有操作地图或游戏文件覆盖。

已验证的 focused regression：`tests/composite/test-client-double-branch-materializer.ts`。

## 11. WP-B/WP-C 客户端骨架审计与实现（2026-07-19）

> 状态：已验证 / 当前实现
> 来源：当前代码实现 + 自动回归 + 真实客户端 GIA + 用户游戏验证；客户端 GIA 事实沿用本文第 10 节
> 最近校验：2026-07-19
> 适用范围：当前 `g.client()` → Client IR → client GIA 路径

### 11.1 当前职责边界

当前调用链为：

```text
g.client()
→ runtime/client.ts 的 ClientGraphRegistry
→ ClientNode / ClientValueIR
→ gs_to_ir_json_transform/runner.ts
→ ir_to_gia_transform/index.ts 的 client dispatch
→ client_ir_to_gia.ts
→ gia_vendor.ts → vendor client_legacy.ts → GIA
```

当前代码事实：

- `runtime/client.ts` 同时承担公共 API、registry、语义节点记录和值转换；本轮保留该入口以避免重写服务器 runtime，但 Stage 3 不再依赖其 GIA 细节。
- `IR.d.ts` 已用 `literal`、`conn`、`list` discriminant 区分三类客户端值；`list.encoding` 区分 direct-list 与 assembly-list。更严格的按 `ValueType` 泛型收紧留作新增节点族工作包。
- `client_ir_to_gia.ts` 负责图级 metadata、客户端节点 adapter、ClientVarType/VarBase、signal/list 特殊布局和边物化；目标地图 signal identity/CPI 仍只来自 `SignalRegistry`，不由 GIA 编码器猜测。
- `__clientNodeType` 是调试用的 materializer 内部字段，不进入 protobuf；它不参与节点 identity，后续可在 adapter registry 完成后移除。
- `signal_registry.ts` 是 signal name/schema/serverId/CPI 的生产边界；地图读取和注入不属于 `clientIrToGia()`。

### 11.2 布局模块复用（本轮完成）

新增 `src/compiler/client_layout.ts` 作为客户端布局适配层。它只把 Client IR 的执行拓扑和数据
连接转换为共享布局引擎可消费的 `IRNode`，然后复用：

```text
client_layout.ts
→ buildExecutionGraph()
→ layoutPositions()
→ client node x/y
```

因此客户端与服务器图共享同一套布局模块、数据消费者布局和执行链布局，不再使用 signal 节点的
硬编码坐标。布局适配层不读取 protobuf pin，也不改变 nodeIndex、ClientVarType、CPI 或连接方向；
这是“复用布局算法、隔离客户端编码”的边界。

### 11.3 本轮 WP-C 范围与不变量

- 保留 `client_ir_to_gia.ts` 作为 Stage 3 client façade，并将布局从编码逻辑中抽离。
- 所有客户端数据边继续编码为 `OutParam → InParam`，控制边继续编码为 `OutFlow → InFlow`。
- signal、direct-list、assembly-list 的现有物理布局和目标地图 signal registry 契约不变。
- 不新增 Fixed、Variant、普通执行节点或查询节点；现有 `get_self_entity`、`query_guid_by_entity`、`assembly_list`、signal 是唯一生产支持范围。
- 不注入、不修改 `user_edit/`、不修改 `src/thirdparty/`，不把真实样本 nodeIndex、地图 ID 或样本值写成隐式特判。

### 11.4 证据分层

- **当前源码事实**：`client_layout.ts` 复用 `buildExecutionGraph()`/`layoutPositions()`；`client_ir_to_gia.ts` 通过 client dispatch 生成 GIA。
- **自动回归事实**：`tests/runtime/test-client-layout.ts`、交接包四个 runtime 回归和
  `tests/composite/test-client-signal-materializer.ts` 已通过；完整三信号回归还会检查 GIA raw
  坐标没有被错误缩放到个位数。
- **真实 GIA 事实**：本文第 10 节记录的两个 signal 参考样本和目标 `.gil` registry；本轮未新增真实 GIA 结论。
- **游戏证据**：用户已确认最新共享布局修复版 `Beyond_Local_Export/gsts-client-full-signal-ts-complete-3signals.gia` 游戏测试通过，证明当前三信号组合的布局、连线和行为可用。
- **待验证**：空列表/动态列表/超过 10 项列表，以及未开放节点族；这些不确定性不影响当前已验证闭环。

## 12. 验证和完成标准

### 11.1 首批证据链

首批典型 API 只有完成以下全部层级，才标记为已支持：

1. TypeScript/生产构建成功；
2. 自动 IR/GIA 结构回归通过；
3. standalone 客户端 `.gia` 生成成功；
4. 用户在正确的客户端 skill 图位置手动导入成功；
5. 节点、参数、数据线和分支目视正确；
6. 用户不做无关编辑后重新导出；
7. 候选与回导 GIA 完成结构化对拍；
8. 在游戏中实际触发图并观察预期行为。

必须分别报告，不得相互替代：

```text
编码成功
自动回归通过
编辑器导入成功
编辑器回导对拍通过
游戏行为验证通过
```

### 11.2 首次结构对拍字段

至少比较：

- GraphUnit class/type/which；
- NodeGraph class/type/kind；
- graph ID 是否保留或被编辑器改写；
- `Node Graph Begins` identity；
- 首批节点 generic/kernel/concrete identity；
- `ClientVarType`；
- 可见 pin 和隐藏 pin；
- hidden/default pin 与 client binding；
- 数据连接；
- Vector Addition 的真实 Fixed/Variant/concrete identity；
- Double Branch 两个 OutFlow；
- `Play Timed Effects` 公开参数到物理 pin 的映射；
- 编辑器新增、删除或规范化的字段；
- `gameVersion` 是否保留、改写或忽略。

涉及 protobuf 字段存在性时，decoded 默认 JSON 不足以证明 wire presence；按需保留 raw wire 或 round-trip 证据。

### 11.3 首次游戏行为

最小游戏验证至少观察：

- `onStart()` 是否实际触发；
- `getSelfEntity()` 是否取得正确客户端自身实体；
- `getEntityPosition()` 是否驱动正确位置；
- `addVector3()` 是否产生可见偏移；
- `doubleBranch` 是否只执行预期一侧；
- `playTimedEffects` 的配置、缩放和默认音效参数是否生效。

## 11.5 Scalar Arithmetic Fixed 系列（2026-07-20）

> 状态：已验证
> 来源：当前代码实现 + 固定第三方客户端节点候选 + 自动回归 + 用户游戏验证；无本轮独立真实 GIA 对拍
> 最近校验：2026-07-20
> 适用范围：当前客户端 `skill` 图生产路径；仅覆盖本轮 12 个节点和该测试产物

本轮新增 12 个客户端 Arithmetic Fixed 节点，排除前两轮 Query 和上一轮 Vector/Arithmetic Fixed
节点：

- 布尔：`And`、`Or`、`Not`、`Xor`；
- 标量函数：`Sin`、`Cos`、`Tan`、`Asin`、`Acos`、`Atan`、`Rad_To_Deg`、`Deg_To_Rad`。

第三方候选数据记录布尔节点 generic `200001..200004`、kernel `1..4`，标量函数 generic
`200094..200099`、`200101..200102`、共享 kernel `35`。标量函数的 pin 0 是 hidden
`EnumItem_`，默认值来自固定候选的 `node_pins_default_vals.json`（1700、1701、1702、1703、1704、
1705、1706、1707）；这些 identity、默认值和 hidden-pin 语义尚未由独立真实 GIA 校正。

当前 API 位于 `src/runtime/client.ts`，focused TS→IR→GIA 回归为
`tests/runtime/test-client-scalar-arithmetic-series.ts`，产物为
`Beyond_Local_Export/gsts-client-scalar-arithmetic-series.gia`。自动回归证明 IR、节点 identity、ClientVarType、hidden pin、数据连接和布局可重现；用户已确认
`Beyond_Local_Export/gsts-client-scalar-arithmetic-series.gia` 游戏测试通过。该游戏证据仅覆盖本轮
12 个节点和该产物。

## 11.6 Query Fixed 系列 v3（2026-07-20）

> 状态：已验证
> 来源：当前代码实现 + 固定第三方客户端节点候选 + 自动回归 + 用户游戏验证；无本轮独立真实 GIA 对拍
> 最近校验：2026-07-20
> 适用范围：当前客户端 `skill` 图生产路径；仅覆盖本轮 10 个节点和该测试产物

本轮新增 10 个 Query Fixed 节点，focused 回归为 `tests/runtime/test-client-query-series-v3.ts`，
覆盖 entity、int、faction、bool 和 entity/int list 输出。新增节点 identity 为：

```text
200026/1004  200028/1006  200029/1007  200077/1035  200078/1034
200090/3000  200091/3001  200093/1037  200103/1038  200107/1046
```

最终产物为 `Beyond_Local_Export/gsts-client-query-series-v3-minimal.gia`，graph ID 为 `1082130464`，
大小 9318 bytes，SHA-256 为 `2cedd56e2809dbfaf43f2acad6af4687c9705c68f8aca0a0a772b4d55c679e69`。
本版统一使用 `信号_全部列表参数测试`，只保留本轮节点相关的 entity/bool/int 列表输出；其余
列表参数使用缺省空值，不创建无关 assembly 节点。`undefined` signal 参数会由客户端 lowering 物化为
对应类型的空 pin，保持 signal 物理 pin/CPI 对齐。自动回归证明 Client IR、节点 identity、列表
输出 pin、连接和布局可生成；用户已确认该产物游戏测试通过。该游戏证据仅覆盖本轮 10 个节点和本产物。

## 12. 注入安全边界

首批仅生成 standalone `.gia`，使用 `--noinject`；不修改 injector。

用户手动：

```text
选择正确客户端 skill 图位置
→ 导入 standalone GIA
→ 检查
→ 重新导出
```

客户端注入应在编码稳定后建立独立工作包：

```text
读取真实地图
→ 只读识别客户端 GraphUnit
→ 列出候选目标
→ 用户确认 map/player/nodeGraphId
→ 备份
→ 注入
→ 回读确认
```

任何注入、覆盖、复制或删除游戏文件前都必须再次获得明确确认。注入成功不等于游戏行为验证成功。

## 13. 版本策略

上游 `data.json` 中的 `GameVersion: 6.2.0` 只作为旧数据快照标签，不作为当前编辑器真值。
两个 2026-07-17 客户端样本内部均观察到：

```text
gameVersion = "6.7.0"
```

这替代了此前“客户端输出暂定 6.6.0”的计划假设，但只证明样本字段值，不证明该字段参与兼容或
运行行为。生产实现确定固定值前仍需结合编辑器回导观察。

规则：

- 不暴露为 `g.client()` 配置；
- 不暴露为首批 `gsts.config.ts` 配置；
- 不用该字段判断客户端节点是否合法；
- 真实回导时记录编辑器是否保留或改写；
- 字段语义在获得行为证据前保持“待验证”；
- 不因同步旧客户端数据将输出回退到 6.2，也不把单次 `6.7.0` 观察推广为多版本兼容规则。

## 14. 预期实施工作包

真实样本校正后，建议按以下工作包执行，每个包开始前重新确认精确 diff：

### WP0：真实样本分析（本轮已完成）

- [x] 解码两个真实 client skill GIA；
- [x] 对比上游数据；
- [x] 固化图级 metadata、典型节点和物理 pin 事实；
- [x] 完成两个样本的逐字节 message round-trip；
- [x] 记录工具限制、证据范围和剩余不确定性。

### WP1：Vendor 客户端兼容补丁（vendor 补丁序列已提交并同步必要项目快照）

- [x] 在 `497d9ec` 上创建独立 `compat/genshin-ts-client-legacy-schema` worktree；
- [x] 增加不依赖已删除旧 node-data 文件的最小 client skill graph materializer；
- [x] 固化 Graph Start、Play Timed Effects、物理 pin、hidden pin 和 client binding；
- [x] 保留并回归 Composite field-101；
- [x] 两个 WP0 真实样本 message/container 逐字节 round-trip；
- [x] 最小 client skill graph focused test；
- [x] 用户编辑器导入并确认节点、连线和参数；
- [x] 编辑器回导语义对拍，归一化身份元数据后 payload 逐字节一致；
- [x] 用户确认游戏中实际触发并观察到预期特效；
- [x] 审阅 vendor diff；
- [x] 形成功能提交 `5e05133`；
- [x] 形成类型检查边界修复提交 `4033eaf`，消除旧 DSL fixture 的 `TS1011`；
- [x] 确认 WP1 新文件 focused TypeScript 检查通过；vendor 根 `tsconfig` 仍有 55 个与本工作包
  无关的历史基线错误，不宣称全量 `tsc` 通过；
- [x] 从审核头 `4033eaf` 同步必要项目快照；
- [x] 增加项目稳定 adapter 和 focused tests。

### WP1-Sync：项目快照同步与稳定 adapter（已完成）

本轮未等待新的拓扑 fixture，先完成已有证据覆盖的项目侧同步。实际范围为：

1. 从 vendor worktree `/home/h/worktrees/gia-vendor-client-legacy` 识别并同步 WP1 必要文件，
   来源头固定为 `4033eaf`；
2. 不整目录覆盖项目 vendor，不迁移新 AssetBundle schema，不复制失效的完整 legacy encoder；
3. 在 `src/compiler/gia_vendor.ts` 暴露项目稳定入口，项目其他代码不得 deep-import vendor 路径；
4. 增加项目级 focused tests，覆盖 field-101、两个 WP0 样本 wire round-trip，以及已验证的
   `Node Graph Begins → Play Timed Effects` materializer；
5. 不增加 `g.client()`，不修改运行时 registry、Stage 1 或生产 Stage 3 分发；
6. 更新本文的同步文件清单、项目验证结果和未运行项。

实施前已复核 genshin-ts、vendor worktree 和 vendor 主工作树状态。实际同步文件为：

```text
src/thirdparty/.../gia_gen/client_legacy.ts
src/thirdparty/.../gia_gen/index.ts
src/compiler/gia_vendor.ts
tests/composite/test-client-legacy-materializer.ts
tests/composite/test-client-real-gia-roundtrip.ts
```

`client_legacy.ts` 与 `4033eaf` 内容一致，只有项目规范要求的相对导入 `.ts` → `.js` 归一化；
`gia_gen/index.ts` 只增加必要导出。没有同步 vendor `tsconfig.json`，没有修改 protobuf schema 或生成
类型，也没有复制失效的完整 legacy encoder。

本轮项目验证结果：

```text
npm run build                                                    PASS
npx tsx tests/composite/test-client-legacy-materializer.ts        PASS
npx tsx tests/composite/test-client-real-gia-roundtrip.ts <两样本> PASS
npx tsx tests/composite/test-composite-bool-input-gia.ts          PASS
git diff --check                                                  PASS
vendor 来源归一化 diff 与 protobuf 未修改检查                    PASS
```

`tests/composite/test-client-real-gia-roundtrip.ts` 已固定两个 WP0 样本的 SHA-256、大小、图身份和逐字节
message/container round-trip 契约；本轮使用原始只读样本运行通过。`npm test` 与 `npm run gen` 未运行：
本轮 focused test 和构建已覆盖改动层，且没有修改定义来源或生成规则。自动回归不升级为新的编辑器或
游戏证据；本轮没有注入、复制或修改游戏文件，也没有提交项目 commit。

### WP2：定义生成与覆盖报告

- 增加客户端结构化数据 adapter；
- 建立全量识别、对账、阻塞状态和 allowlist；
- 生成首批英文/中文静态 API；
- 保证 `npm run gen` 无外部绝对路径依赖。

### WP3：运行时和 Client IR

- 渐进抽取 `GraphRecordCore`；
- 增加 `ClientGraphRegistry`；
- 增加 `g.client({ type: 'skill', id }).onStart()`；
- 增加 client value ownership；
- 生成 `ClientIRDocument`；
- 拒绝同文件混端和多 client 图。

### WP4：Stage 1 客户端上下文

- 识别 `onStart()` 客户端回调；
- 支持首批 `if/else`；
- 拒绝未审计服务器 lowering 泄漏；
- 增加端隔离诊断。

### WP5：Stage 3 客户端 lowering

- 显式 server/client 分发；
- client graph metadata；
- client identity 和 pin materializer；
- `ClientVarType`；
- hidden/default adapter；
- 首批典型节点和分支。

### WP6：首批端到端验证

- 生成 standalone 客户端 GIA；
- 用户手动导入和回导；
- 结构化 diff；
- 修正并固化回归；
- 用户游戏行为验证。

### WP7：信号专项

- 最小真实 `sendSignalToServerNodeGraph` 样本；
- complex definition/动态参数研究；
- 客户端与服务器参数契约；
- 回导与游戏通信验证。

#### 已完成：目标地图已有信号 materializer v2（2026-07-19）

当前实现和回归入口：

```text
tests/composite/test-client-signal-materializer.ts
```

目标地图信号资源通过项目现有的 `readRegisteredSignalsFromGil()` 从目标 `.gil` 读取；参考客户端
`.gia` 只用于校验 `ClientSignal(kind=6)` 的信号名 pin，不再复制参考文件的 SignalDef
accessories。生成图的当前契约是：

```text
accessories = []
root.graph.relatedIds = 目标地图已有的 sendServer ID
sendSignalToServerNodeGraph.genericId.nodeId = 同一 sendServer ID
signal name = ClientExec pin(kind=6) 的 bString
```

已从 2026-07-18 目标地图的注册资源读取并测试三个信号：

```text
信号_1                  → sendServerId 1610612740，5 个参数
信号_全部列表参数测试    → sendServerId 1610612746，9 个列表参数
信号_全部参数测试        → sendServerId 1610612743，9 个标量参数
```

materializer 在内存中覆盖三个信号的独立样本，并只将组合图输出到游戏导出目录：

```text
Node Graph Begins → 信号_1 → 信号_全部列表参数测试 → 信号_全部参数测试
```

组合候选文件：

```text
Beyond_Local_Export/gsts测试信号_v2_三个信号顺序发送_带参数.gia
```

该文件通过 protobuf message/container round-trip、GIA header 检查、`accessories=[]`、
节点顺序、`relatedIds`、信号名 pin 和参数数量回归；用户已确认游戏测试通过。自动回归和游戏
核验只证明目标地图已有信号的当前样本，不证明任意地图、任意客户端信号或全部特殊参数的编码。

2026-07-19 新增真实参考样本：`Beyond_Local_Export/user_edit/客户端/信号-参数-完整.gia`，
SHA-256 为 `13543f2453b48ea24c2068865858ce22b0ed34ebbe80e97f5aaf42d9701ed218`，文件大小
2954 bytes。使用 `npx tsx tools/decode-gia.ts` 和 `npx tsx tools/decode-gil-raw.ts` 解码/扫描后，
确认 `向服务器节点图发送信号` 节点（serverId `1610612743`、concreteId `2000`）的 9 个标量
参数均为物理 `InParam[0..8]`，`compositePinIndex=137..145`。参考值的 VarBase oneof 契约为：
`int→bInt`、`float→bFloat`、`vec3→bVector`、`guid/prefab_id/config_id→bId`、
`bool→bEnum`、`entity→alreadySetVal=false 且无具体值`、`str→bString`；其 `itemType.type_client.type`
分别与客户端参数类型一致，信号名仍是 `ClientExecNode(kind=6)`。

当前 `tests/composite/test-client-signal-materializer.ts` 已按该样本锁定上述字段、值、CPI 和
message/container round-trip；`npx tsx tests/composite/test-client-signal-materializer.ts` 已通过。
因此当前实现已覆盖本样本的完整标量参数获取/编码（自动回归证据）。列表/容器随后通过独立真实
参考完成逐类型对照，并在组合候选中完成自动结构验证和用户游戏核验；这些结论仍只适用于当前目标
地图已有信号和本文记录的参数族，不自动推广到任意客户端节点。

#### 三信号组合图补齐 entity/GUID 数据源（2026-07-19）

在上一轮组合图基础上，新增候选文件：

```text
Beyond_Local_Export/gsts测试信号_v2_三个信号顺序发送_带参数_实体GUID.gia
```

第三个“信号_全部参数测试”节点的参数连接为：

```text
get_self_entity（generic=200033, concrete=1013, OutParam[0], Entity）
  ├─→ sendServer 参数_6（Entity）
  └─→ query_guid_by_entity（generic=200027, concrete=1005, InParam[0]）
        └─→ sendServer 参数_4（GUID）
```

辅助节点的实体 pin 使用真实参考中的 `class=IdBase`、`bId.val=0` 类型占位；信号节点本身的
Entity 参数保留 `class=Unknown`、`alreadySetVal=false`，随后由 `connects` 提供实际值。focused
回归同时检查节点 ID、类型、三条数据连线、三信号执行顺序和 protobuf/container round-trip。
该文件已通过自动结构验证，并由用户完成编辑器/游戏行为核验。

#### 完整列表参数参考（2026-07-19）

新增真实参考样本：`Beyond_Local_Export/user_edit/客户端/信号-参数-完整-列表.gia`，大小
11308 bytes，SHA-256 为 `7f7da67532054a407fa848de8b83668befb0eed6bb3db8ddca00a53e6add9304`。
该样本直接观察到三类列表参数未连线、仅携带数组值，以及六类列表参数通过 `assembly_list` 连线；
结合前面已验证的具体类型节点规律，最终生产候选统一采用“具体类型值 → typed `assembly_list` →
信号列表 pin”的路径。类型和节点规律为：

- 所有列表 signal pin 使用 `ArrayBase + bArray.entries`，列表 `itemType` 使用对应
  `ClientVarType.*List_`；
- `assembly_list` 使用 generic `200049` 和 typed concrete，元素位于 `InParam[1..10]`，列表从
  `OutParam[0]` 输出；本轮最终候选的 concrete 为 `config=568`、`prefab=569`、`entity=1025`、
  `guid=1043`、`bool=1027`、`vec3=1030`、`str=1029`、`float=173`、`int=1026`；
- `entity_list` 的元素来源为 `get_self_entity`，`guid_list` 的元素来源为
  `query_guid_by_entity`；
- 列表发送 pin 仍保留 `ArrayBase`，数组元素使用对应标量 `ClientVarType`，而不是列表类型。

`tests/composite/test-client-signal-materializer.ts` 已按该样本补齐 assembly 节点、元素类型、
ConcreteBase 包装、列表连线和 protobuf/container round-trip。新候选仍只输出一个组合文件：
`Beyond_Local_Export/gsts测试信号_v2_三个信号顺序发送_带参数_实体GUID.gia`。当前证据为真实 GIA
结构对照和自动回归；随后生成的组合候选已由用户完成编辑器/游戏核验。

随后根据参考文件中故意未连线的三个列表参数，补齐了过拟合遗漏：`config_id_list`、
`prefab_id_list`、`float_list` 也统一使用具体类型值 → 对应 typed `assembly_list` → 信号列表
pin 的路径。vendor 节点 ID 表提供的 concrete 分别为 `568`、`569`、`173`。当前候选的 9 种
列表参数均有 assembly 输出连线，并按参考样本补齐了 assembly 的数量和实际元素值：`str_list` 为一个
`测试` 字符串，`bool_list` 为两个元素 `false/true`，`vec3_list` 为一个 `(3,0,2)` 向量；
未使用槽位保留对应类型的默认值。该候选已通过自动结构验证，并已由用户确认游戏测试通过。

### TS → IR → GIA 生产契约（当前扩展基线）

本节把真实 materializer 和当前生产路径已确认的客户端信号规律固化为后续节点/API 可复用的契约。
它描述当前 `g.client()`/Client IR/Stage 3 的输入和输出边界；新增节点族必须沿此边界扩展，不得绕过
语义 IR 直接拼接 GIA。

#### 1. 生产 IR 应表达的语义节点

建议 Client IR 保留普通数据连接，而不是让 signal materializer 读取字符串或猜测节点：

```text
get_self_entity() -> entity
query_guid_by_entity(entity) -> guid
assembly_list<T>(count, values[0..n-1]) -> T[]
send_signal_to_server(signalName, params[0..n-1])
```

列表必须在 IR 中保留元素类型和元素顺序；`assembly_list` 的 count 由元素数生成，不能由 GIA
编码器根据默认槽位反推。`entity`/`guid` 数据源必须是普通 IR `conn`，不能写成信号参数的
`alreadySetVal` 字面量替代品。

#### 2. 客户端类型与 GIA 类型映射

| TS/IR 类型 | 信号 pin `ClientVarType` | 列表 assembly concrete | 元素 `ClientVarType` |
|---|---:|---:|---:|
| `float_list` | 8 | 173 | 7 |
| `config_id_list` | 20 | 568 | 18 |
| `prefab_id_list` | 21 | 569 | 19 |
| `entity_list` | 2 | 1025 | 1 |
| `guid_list` | 15 | 1043 | 14 |
| `bool_list` | 6 | 1027 | 5 |
| `vec3_list` | 12 | 1030 | 11 |
| `str_list` | 10 | 1029 | 9 |
| `int_list` | 4 | 1026 | 3 |

列表 signal pin 的 `value` 使用 `ArrayBase + bArray.entries`，`itemType.type_client.type`
使用列表类型；assembly 元素 pin 使用标量类型，不能把列表类型写进元素槽位。

#### 3. assembly_list 物理布局

- generic node：`200049`；concrete 使用上表 typed ID；
- `InParam[0]`：Int 元素数量，值为实际元素数；
- `InParam[1..10]`：元素槽位，前 `count` 个槽位写入实际元素；
- 元素 pin 使用 `ConcreteBase(class=10000)`，`bConcreteValue.indexOfConcrete` 使用元素类型
  的 concrete index；
- `OutParam[0]`：`ConcreteBase` 包裹的空 `ArrayBase` 类型输出；
- assembly `OutParam[0]` 必须连接到目标 signal 的对应 `InParam`；
- 未使用槽位保留同类型默认值，但不能增加 count。

本轮已观察到的值规律：`str_list=['测试']`、`bool_list=[false,true]`、
`vec3_list=[(3,0,2)]`。这些是参考/候选样本值，不应硬编码进生产 API；生产 IR 应来自 TS
表达式或字面量。

#### 4. 标量与实体/GUID 连接

普通标量 signal 参数直接使用客户端 VarBase oneof：`int→bInt`、`float→bFloat`、
`vec3→bVector`、`guid/prefab_id/config_id→bId`、`bool→bEnum`、`str→bString`。
实体参数使用 `class=Unknown`、`alreadySetVal=false` 的 typed placeholder，并通过连接提供值。

已验证的实体/GUID 数据源为：

```text
get_self_entity generic=200033 concrete=1013 OutParam[0]
  ├─→ entity signal pin
  └─→ query_guid_by_entity generic=200027 concrete=1005 InParam[0]
        └─→ guid signal pin
```

#### 5. signal 节点与图级元数据

- 当前目标地图已有信号使用 `accessories=[]`；定义/identity 来自目标 `.gil` 的
  `readRegisteredSignalsFromGil()`，不能从参考 GIA 复制 SignalDef accessories；
- root `relatedIds` 列出实际使用的 sendServer ID；
- signal node `genericId.nodeId` 使用同一 sendServer ID，`concreteId.nodeId=2000`；
- signal name 使用 `ClientExecNode(kind=6,index=1)` 的 `bString`；
- `signalVersion=1`；
- 参数物理 pin index 是参数序号 `0..n-1`，CPI 由目标 signal definition 的 pinIndex 提供，
  不能对所有信号写死同一 CPI（本轮三个信号分别为 `65..79`、`176..184`、`137..145`）。

#### 6. 下一步生产实现拆分

1. **Client runtime/Stage 1**：把 `g.client({ type: 'skill', id }).onStart()` 回调产出 Client IR，
   建立 signal registry 引用、类型化值和普通数据 conn；
2. **Client Stage 3 adapter**：复用当前 `assembly_list` typed identity 与 special-arg count/element
   布局，但改为客户端 `ClientVarType`/VarBase 编码，不复用服务器 `VarType`；
3. **Signal materializer**：把 `.gia` fixture 中的手工值构造收敛为生产 `buildClientSignalNode`，
   从 registry 解析 sendServer ID、参数 CPI 和 concrete kernel；
4. **数据源 lowering**：先支持 `get_self_entity`、`query_guid_by_entity`，再扩展其它客户端数据源；
5. **回归门禁**：先复现当前组合图的 3 个信号、9 个列表、entity/GUID 连接和 round-trip，再接入
   TS 入口；用户编辑器/游戏核验必须继续单独记录。

#### 7. 当前禁止的推广

- 不把 `tests/composite/test-client-signal-materializer.ts` 的手工构造函数当成生产 API；
- 不把目标地图 signal ID 推广为任意地图固定 ID；
- 不复制参考 GIA 的 SignalDef accessories 到当前 `accessories=[]` 方案；
- 不把自动回归、GIA 输出或注入成功等同于游戏行为通过；
- 不在没有新真实 GIA 证据时扩大到未覆盖的客户端节点族。

### WP8：按节点族扩大覆盖

- Fixed；
- Variant；
- enum；
- kernel 执行节点；
- 异常节点；
- 持续覆盖报告与代表性游戏验证。

## 15. 当前最小生产闭环（TS → Client IR → GIA）

> 状态：已验证 / 当前实现
> 来源：当前代码实现 + 自动回归 + 真实 GIA 对照 + 用户游戏内验证
> 最近校验：2026-07-19
> 适用范围：当前客户端 skill 图生产路径；不推广到未取样客户端节点族、任意地图 signal 或客户端注入

当前已完成的最小生产闭环是：

```text
TS 测试代码
→ g.client({ type: 'skill', id }).onStart((f) => ...)
→ ClientGraphRegistry
→ ClientIRDocument
→ clientIrToGia()
→ 客户端 skill GIA
→ 用户导入游戏目录并完成游戏测试
```

当前 TS 回归入口：

```text
tests/runtime/test-client-full-signal-ir-to-gia.ts
```

当前 TS 生成并经用户测试的产物：

```text
Beyond_Local_Export/gsts-client-full-signal-ts-complete-3signals.gia
```

该回归由 TS 语法表达完整输入，覆盖：

- 3 个目标地图已有 signal，按顺序执行；
- signal 参数数量 `5 / 9 / 9`；
- 标量 `int/float/vec3/guid/bool/entity/prefab_id/config_id/str`；
- `get_self_entity` → signal entity 参数；
- `get_self_entity` → `query_guid_by_entity` → signal GUID 参数；
- 9 类列表参数的 typed `assembly_list`；
- `bool_list` 多元素和 `vec3_list` 多元素；
- signal 目标 `InParam` 数据边与 signal 间控制流。

当前验证结果必须分层记录：

- **TS→IR→GIA 自动回归**：`npm run build`、`npx tsx tests/runtime/test-client-full-signal-ir-to-gia.ts` 等 focused tests 通过；
- **真实 GIA 对照**：与 `Beyond_Local_Export/user_edit/客户端/信号-参数-完整-列表.gia` 的列表类型、assembly concrete、参数拓扑和 entity/GUID 规律对照；
- **游戏验证**：用户确认最新 TS 生成版本大体测试通过，并在补充 entity 连接和多元素 bool/vec3 列表后完成最新测试通过；
- **未覆盖**：除本文列出的 signal/list/data-source 路径外的客户端节点、跨地图 signal registry、客户端 Composite、Graph variables、注入和多版本兼容。

该闭环证明当前支持范围内的生产入口和客户端架构骨架已经存在。后续新增客户端知识必须沿本文的 runtime/IR、Stage 3 adapter、共享布局、真实 GIA、自动回归和游戏验证分层记录，不得把当前闭环推广为全量客户端节点支持。

## 15.1 Vector/Arithmetic Fixed 系列（2026-07-19）

> 状态：已验证
> 来源：第三方节点候选 + 当前代码实现 + 自动回归 + 用户游戏验证
> 最近校验：2026-07-19
> 适用范围：当前客户端 `skill` 图的本轮 10 个 Vector/Arithmetic 节点；不推广到未测试的客户端节点

本轮排除了前两轮已经真实测试通过的客户端查询节点，新增一个独立的 Fixed 数据流系列。测试入口为：

```text
tests/runtime/test-client-vector-series.ts
```

用户 API 和当前 adapter 支持以下节点：

| 用户 API | 第三方候选 generic/concrete identity |
|---|---:|
| `dotVector3` | `200063 / 131` |
| `crossVector3` | `200064 / 132` |
| `splitVector3` | `200065 / 133` |
| `scaleVector3` | `200066 / 134` |
| `angleBetweenVector3` | `200067 / 135` |
| `rotateVector3` | `200068 / 136` |
| `vector3Length` | `200069 / 137` |
| `createVector3` | `200070 / 1024` |
| `normalizeVector3` | `200100 / 138` |
| `directionVectorToRotation` | `200073 / 139` |

当前实现位于 `src/runtime/client.ts` 和 `src/compiler/client_ir_to_gia.ts`。运行时记录 literal/connection
输入，`splitVector3` 暴露三个独立 float 输出；Stage 3 写入客户端 `ClientVarType`、Fixed identity、物理
输入/输出 pin 和数据边。测试图使用明确的向量/标量值，并把每个新增节点的实际输出承载到已有 signal
参数中；`getSelfEntity()` 仅作为 signal 的必要 Entity 输入来源，不作为本轮新增查询节点测试对象。

本轮自动验证：

```bash
npm run build
npx tsx tests/runtime/test-client-vector-series.ts
NODE_OPTIONS='--no-deprecation' npx tsx tools/decode-gia.ts --check-header --compact \
  Beyond_Local_Export/gsts-client-vector-series.gia
git diff --check
```

产物为：

```text
Beyond_Local_Export/gsts-client-vector-series.gia
SHA-256: f2f682a87ddc4fcf081e90744b5b8be1347f8f7467b57e9f6e4b616a2994ba1f
```

自动证据证明 TS→Client IR→GIA、节点 identity、物理 pin、数据连接、布局坐标和 GIA header 可复现。
用户随后确认该产物测试通过，构成本轮 Vector/Arithmetic 系列的编辑器/游戏行为证据。该游戏结论只适用于
上述产物和这 10 个节点，不替代未测试节点的真实 GIA 或游戏验证，也不表示客户端 Arithmetic 全量开放。

## 16. 客户端架构骨架（当前已完成，后续扩展基线）

以下两个工作包已完成，后续新增客户端节点必须在此骨架上扩展，不复制布局算法或绕过 adapter 边界：

### WP-B：当前实现审计

目标是绘制并确认真实职责边界：

```text
g.client()
→ ClientGraphRegistry / runtime client API
→ ClientNodeRecord / ClientValueIR
→ ClientIRDocument
→ irToGia() client dispatch
→ clientIrToGia()
→ vendor client graph materializer
```

审计至少覆盖：公共 API、runtime registry、IR builder、signal registry、列表语义、值编码、节点 identity、物理 pin、数据边、控制流、GIA graph metadata，以及测试 fixture 与生产路径的边界。输出应标出当前代码事实、待抽取 seam、重复逻辑、临时字段和不应推广的样本特判。

### WP-C：客户端骨架设计与保行为重构

目标是形成后续客户端节点/API 的稳定扩展点：

```text
ClientGraphContext / Registry
ClientNodeRecord / ClientValue
ClientIRBuilder
ClientNodeAdapterRegistry
ClientSignalAdapter
ClientListAdapter
ClientValueEncoder
ClientDataFlowMaterializer
ClientControlFlowMaterializer
ClientGraphMaterializer
```

重构约束：

- 先保留当前 TS 生成 GIA 的结构和游戏已验证行为，再拆分职责；
- 用户语义层不得直接暴露 shell/concrete/CPI/protobuf VarBase；
- Client IR 表达语义值、literal/connection、列表 encoding 和边，不直接复制最终 GIA pin；
- GIA identity、ClientVarType、VarBase、ConcreteBase、物理 pin 和 hidden/default 只在 Stage 3 adapter 层处理；
- 数据流固定为 `OutParam → InParam`，控制流固定为 `OutFlow → InFlow`；
- signal、list、普通客户端节点共享连接物化能力，不各自重复写 wire；
- 真实 GIA 样本用于确认规律，不把 nodeIndex、样本值、目标地图 ID 写成生产隐式特判；
- 骨架重构期间不执行注入，不修改 `user_edit`，不手改 `src/thirdparty/`。

WP-B/WP-C 的历史执行记录保留在：
`/tmp/genshin-ts-handoff-2026-07-19-client-architecture-skeleton.md`；当前权威行为以本文、`client-gia-encoding.md`、源码和 focused tests 为准。

## 17. Phase 0 冻结状态

截至 2026-07-19：

- 两份真实 client skill GIA 已完成文件内 ID 配对、语义解码、上游候选对账和逐字节 wire round-trip；
- 两份样本均为 `gameVersion="6.7.0"`，原 `6.6.0` 计划假设已撤销；
- “变量版本”明确为节点链且 `graphValues=[]`，不扩大 Client Graph variables 范围；
- 当前生产 TS→Client IR→GIA signal/list/data-source 路径、共享布局和最新三信号产物已存在并经用户游戏验证；
- `g.client()` 当前只覆盖本计划记录的 skill signal/list/data-source 最小闭环，不宣称全量客户端节点支持；
- 客户端路径已完成 WP-B/WP-C 保行为骨架化；后续按本文框架扩展节点族；
- 只使用已审查并获用户授权的 `4033eaf` 最小 vendor 客户端快照；
- 不执行注入或游戏文件操作。

WP0 已收口。WP1 已获授权并在独立 vendor worktree 实现最小 legacy client materializer：

```text
branch:   compat/genshin-ts-client-legacy-schema
base:     497d9ec940c6e13678e3997e6e45f7d5d6caea96
commits:  5e05133  feat: materialize legacy client skill graphs
          4033eaf  chore: exclude legacy DSL fixture from typecheck
worktree: /home/h/worktrees/gia-vendor-client-legacy
```

当前新增 `utils/gia_gen/client_legacy.ts` 及两个 focused test，并从 `utils/gia_gen/index.ts`
导出；field-101、两个 WP0 样本逐字节 round-trip 和最小 skill graph 字段回归均通过。用户已完成首个
字面量样本的编辑器导入、回导和游戏验证；归一化编辑器重写的图 ID、图名和 `filePath` 后，回导
payload 与导入前逐字节一致。该证据仍只覆盖此样本。vendor 功能补丁为 `5e05133`，审核后的分支头为
`4033eaf`。WP1-Sync 已将必要的 `client_legacy.ts` 和导出同步到 genshin-ts，并通过
`src/compiler/gia_vendor.ts` 暴露稳定入口；项目构建、field-101 和最小 client skill materializer
focused 回归均通过，项目级真实样本 round-trip 也使用两份原始 WP0 样本逐字节通过。

2026-07-17 新增 Double Branch focused materializer 回归
`tests/composite/test-client-double-branch-materializer.ts`，覆盖 shell `200056`/kernel
`2000`、True/False OutFlow 物理 index、condition pin 和 protobuf wire round-trip。该回归对应的
两份候选 GIA 已由用户在游戏中验证 True 和 False 分支行为。运行时、Stage 1 和生产 Stage 3 仍未
修改；当前 `g.client()` 已在本文冻结的 skill signal/list/data-source 范围内作为生产入口使用，尚未开放的节点族仍不公开。

2026-07-19，客户端已有地图信号专项新增 `tests/composite/test-client-signal-materializer.ts`。
该回归读取目标地图 `1073741848.gil` 的三个已注册信号，验证 `accessories=[]`、目标地图
`sendServerId`、ClientSignal 名称 pin、标量/列表参数 pin、entity/GUID 数据源、9 种列表
assembly、顺序执行链和 protobuf/container round-trip。默认不写出 GIA；使用 `--output` 时只输出
组合候选，避免在游戏导出目录生成 standalone 参数样本。最终组合候选
`Beyond_Local_Export/gsts测试信号_v2_三个信号顺序发送_带参数_实体GUID.gia`（最终自动回归产物
SHA-256：`30e1fca4f97047559c990ecb8a452aea4b126957bbac5aa965cd65f3417e94a4`）已由用户确认
编辑器/游戏测试通过。该证据只覆盖目标地图已有信号和本节列出的参数族；当前 TS→Client IR→GIA signal lowering、共享布局和对应游戏行为已由用户验证，但不等于全量客户端节点已开放。后续按本文已完成的 WP-B/WP-C 骨架继续扩展，并为每个新节点族补齐真实 GIA、自动回归和游戏证据。
