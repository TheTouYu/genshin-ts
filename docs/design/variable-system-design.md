# 变量系统 DSL/CLI 设计（P3）

> 状态：设计提案（待评审）｜ 依据：已闭合规律（证据分层见 `docs/game-engine-knowledge/variables.md`
> 与 `~/genshin-ts-evidence/variable-system/notes/manifest.md` v0–v16b，每条均有样本 sha + 字节级比对）
> ｜ 日期：2026-08-29

## 一、背景与目标

变量系统（自定义/图/局部 × server/client）的 **wire 规律已全部闭合**：任何产出都可以
"照规律表逐字节比对"来核验，无需再猜字节。本设计解决的是**把已闭合规律变成好用的工程面**：

1. **DSL 层面**：变量声明/读写的用户接口形状（声明与玩法代码同源、类型安全、节点预算可控）；
2. **命令行层面**：变量资产写回与字节级核验的 CLI 面（规律表驱动的 `verify`、语义化实体目标）；
3. **核验体系**：规律单一事实源 + 自动字节比对，把"照搬规律比对"从手工脚本变成命令/测试。

约束（铁律）：

- **不改变任何已闭合字节形态**——每条规律都是差分实证，回归锁定；改动只允许"我们向编辑器形态对齐"，不允许反向漂移。
- 实体/元件 ID 不硬编码进 DSL（资产定位归注入目标/config，编辑器动态分配的红线不变）。
- 注入与资产写回分层：图注入 ≠ 变量写回 ≠ 游戏行为，报告必须分开。

## 二、证据基线（已闭合规律 → 核验口径）

| 域 | 闭合范围 | 证据 |
| --- | --- | --- |
| 自定义变量（关卡/普通/玩家/角色实体） | 21 类型 entry 编码 + 默认值省略 + vec3 稀疏 | v5–v9，`tests/level_variable_initial_values_test.ts` |
| 图变量 | 默认值全形态（列表/标量/空列表/零 vec3） | v1–v6，`tests/graph_variable_int_list_editor_wire_test.ts` |
| 局部变量 server | Get/Set/拼装列表、cid 变体、ioc 表、E<1016> 身份 | v10–v14，`tests/local_variable_editor_wire_test.ts` |
| 局部变量 client | 21 类型按名字、client ioc 表、clientVarType 码、ClientExec | v15–v16b（10 采样实证 + 项目表交叉核对 10/10） |
| 跨容器类型体系 | 共性与差异（VarType/class/payload/ioc/身份机制） | `docs/game-engine-knowledge/variables.md` |

**核验手段定义**：对任一产出（.gia/.gil），解码后与规律表中的形态规则逐字节比对；不一致即失败并输出字节偏移。规律表 = 已闭合的 hex 常量 + 形态规则（见 C4）。

## 三、现状接缝图

```
玩法代码 (TS DSL)
  ├─ g.server({variables})        → IR graphValues → GIA 自动注入（图变量，全自动）
  ├─ f.get/set 图变量              → 同图运行期读写
  ├─ f.initLocalVariable(type, init) → Stage-1 自动提升 get(empty)+set(init)（局部变量）
  ├─ f.assemblyList(items, type)  → 拼装列表节点（列表值来源）
  └─ 自定义变量：无 DSL 面          → config assets.customVariables / CLI --vars 写回实体容器
配置 (gsts config)
  └─ assets.customVariables       → 资产声明通道（实体变量）
CLI
  ├─ assets:custom-variables --entity <id> --vars ...   → 实体变量写回（4 类实体全支持）
  ├─ assets:level-variables       → 关卡变量写回
  ├─ assets:node-graphs read      → 图/节点只读解析
  └─ 注入（.gia → .gil）          → 图变量随图自动落；自定义变量不随注入
核验
  └─ tests/（hex 常量回归）+ 手工探针（.local/vars-explore/）——规律已闭合但**无 CLI 面**
```

接缝问题：① 自定义变量声明与玩法代码分离（config/CLI 两处）；② 核验只有测试与探针，无
"对真实地图照表比对"的命令；③ 局部变量常量 init 多 1 个 Set 节点（F10）；④ 实体目标只有裸 id。

## 四、DSL 层设计决策

### D1 自定义变量声明通道（声明即注入的边界）

- **现状**：声明在 config（`assets.customVariables`），写回走 CLI `--vars`；玩法代码里不可见。
- **选项**：
  - A（最小）：保持 config+CLI 分离，补类型安全辅助与文档。零管线改动。
  - **B（推荐）**：DSL 提供图无关的实体变量声明块（如 `g.entityVariables({...})` 或复用现有
    `g.server` 的独立声明入口），编译产物 .json 附带 `entityVariables` 清单；CLI 新增
    `assets:custom-variables --from-json <out.json> --entity <id>` 消费。声明与玩法代码同源
    （版本控制/可读性），实体 ID 仍由注入目标提供（不硬编码）。
  - C（全自动）：编译时直接写实体——违反分层红线，不做。
- **推荐理由**：B 只加"声明清单"这一跨阶段契约，编码复用已闭合写入器；改动面 = Stage-1/2
  产出字段 + CLI 消费，不碰字节形态。A 作为 B 未获认可时的回退。
- **验收**：同一实体用 config 声明与用 --from-json 声明产出**逐字节相同** entry。

### D2 局部变量 API 定型（server/client 双面）

- 保留现有类型化 API：`initLocalVariable(type, init?)`（返回 `{localVariable, value}`）、
  `setLocalVariable(lv|name, value)`、server 身份句柄 / client 名字两种语义不变。
- 新增（低优先）：client `initLocalVariable` 可选显式名字参数（调试可读性）；默认仍生成
  `__gsts_local_<type>_<n>`。
- 不做：统一"一个 API 管三类变量"——作用域/生命周期/注入链不同，强统一牺牲类型安全。

### D3 局部变量常量 init 折叠（F10 落地）

- **现状**：`initLocalVariable(type, 常量)` 编译为 `get(empty)+set(init)`——编辑器形态是
  常量直接放 Get 的 R<T> pin（v10 实证）。
- **设计**：Stage-1/3 对**编译期可求值字面量** init 折叠为 Get 初始值（省 1 个 Set 节点）；
  动态值保持 get+set 模式（防重复求值，definitions 注释）。
- **验收**：折叠后 Get 节点与 v10 编辑器样本逐字节一致；动态 init 回归不漂移。

### D4 图变量声明保持全自动

- `g.server({variables})` 不动；归一化（默认字段省略）已在管线内，作为不变量。

## 五、CLI 层设计决策

### C1 规律表驱动核验命令（核心）

- 新增 `gsts variables:verify --gil <file> [--scope assets|graph|local-server|local-client|all]
  [--entity <id>] [--graph <id>]`（只读）：
  - 按 scope 读回容器/节点，与规律表（C4）逐字节比对；
  - 输出 PASS/DIFF 报告：差异条目 + 字节偏移 + 归属规律编号；
  - 用途：注入后 read-back 自动核验、编辑器保存后回归核验、CI。
- **验收**：对 v0–v16b 全部样本运行全 scope 全 PASS；故意改 1 字节 → 对应 DIFF 报出。

### C2 注入/变量写回流程文档化与组合入口

- 保持"图注入 + 变量写回"双链（变量写回失败不回滚图注入），但提供标准组合命令
  `gsts inject --apply-variables <entityVars.json>`（注入后按声明清单自动写回）与文档化流程。
- 验收：组合命令 = 现有两步的字节等价。

### C3 实体目标语义化

- `assets:custom-variables --entity` 支持语义名：`--entity level|character|player --player-index <n>`；
  定位规则 = 已闭合的 defId/容器判定（关卡 10003004、玩家 1000000、角色 1000001、普通按资源 def）。
- 验收：语义定位与裸 id 定位产出同字节。

### C4 规律表单一事实源

- 把已闭合规律集中为 machine-readable 规律表（如 `tests/fixtures/variables-wire-rules.json`：
  每容器/节点的 hex 常量 + 形态规则 + 证据样本 sha），供 `variables:verify` 与回归测试共用；
  `tests/*_editor_wire_test.ts` 的常量改为从表引用（或保持常量+表双锁）。
- 验收：表与现有 hex 常量一致（自动比对脚本），改动表需同步证据。

## 六、核验体系设计（分层）

| 层 | 手段 | 归属 |
| --- | --- | --- |
| L1 回归 | hex 常量 + decode 断言测试（已有，扩展为表驱动） | 模型侧自动 |
| L2 命令 | `variables:verify` 对任意 .gil/.gia 照表比对 | 模型侧/CI |
| L3 注入核验 | 注入 /tmp 副本 → read-back → L2 | 模型侧 |
| L4 游戏核验 | 用户游戏内行为确认（读下标/初始值/跨图共享等） | 用户侧 |

规律闭合 ⇒ L1–L3 全部可自动化；L4 仍由用户执行，模型不代报。

## 七、里程碑与验收

- **M1（P0）**：C4 规律表 + C1 verify 命令 + L1 测试改表驱动。验收：v0–v16b 样本全 PASS。
- **M2（P1）**：D3 常量 init 折叠。验收：v10 样本字节一致 + 预算对比（省节点数）。
- **M3（P1）**：D1 声明清单（--from-json）。验收：与 config 声明字节等价。
- **M4（P2）**：C2 组合命令 + C3 语义目标 + D2 显式名字。验收：等价性 + 文档。

## 八、明确不做

- 统一变量 API 大重构（三容器语义不同，D2 说明）；
- 改变任何已闭合字节形态；
- 编译器直接写资产（D1-C 否决）；
- 图变量 dict / server 局部变量 dict/config/faction 系等**未闭合推断段**进入规律表（标记
  `inferred` 且 verify 默认跳过，样本到位再转 `verified`）。

## 九、风险与开放项

- 规律表与测试双份维护漂移 → C4 要求共用或自动比对；
- client dict 值 pin（MapBase 形式）只经项目表交叉核对，无编辑器样本 → 标 inferred；
- O-2026-08-29-03（indexOfConcrete=0 显式）与 O-29-04（常量 init）随 M2 窗口处理；
- server 局部变量 ioc 9..20 推断段：样本到位后一键转 verified。
