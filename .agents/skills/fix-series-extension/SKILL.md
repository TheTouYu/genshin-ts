# 修复后同族扩展与快速定位（fix-series-extension）

完成一个 bug 修复后，系统性检查同族潜在问题并一次修一组；用代码知识图加速跨文件定位。
当用户说"扩展检查/一次修一系列/别只修一个小问题/加速定位/还有没有同类问题"时使用本技能。

## 核心原则

**单点修复不是终点。** 每个 bug 背后是一条"同类边界"——修复后必须枚举同族风险点，
一次修一组 + 一组回归，而不是只修触发点。

## 流程

### 1. 快速定位（图优先，rg 兜底）

- 确认调用方完整性：`trace_path {function_name, direction: inbound, depth: 2}`——找出共享同一修复
  函数的**所有入口**（如 runCompositeCall / runDetachedCompositeCall 共用 buildCompositeCallArgs）。
- 枚举同模式风险点：先 rg 关键模式（如 `getMetadata(`、`getMetadata()`、无防御解引用），
  再用图查跨文件调用关系。
- 决策矩阵：结构/调用关系 → codebase-memory 图；字面量/错误串/单文件细节 → rg/read。
  图结果必须用 `read` 落回真实源码确认后才改代码（图是加速器不是替代品）。

### 2. 同族扩展检查清单（按 bug 类型选）

- **参数边界类**（本系列：getMetadata 崩溃）：同一 API 的所有参数处理点是否都防御了？
  - 裸值（number/bigint/string）→ 按声明类型包装？
  - 句柄对象（{localVariable, value}）→ 取其 value？
  - null/undefined → null 占位保留声明索引？
  - 所有 getMetadata 直接调用点（ir_builder / composite_registry / collectDataDeps / 高层 API）逐一核对
- **类型推断类**（本系列：dict Ety）：同一类型族的变体选择是否全链路（IR→GIA→pin 编码）？
  - 变体枚举键命名差异（Dict_ 前缀有无）→ 查询兼容两种？
  - conn 的 dict k/v 子字段在每层（registry/connTypeIndex/pin builder）是否传递？
- **编码形态类**：官方 golden 与生产输出的逐字段对照（type/value/ioc/items），
  同一节点族（get/set 图变量、set_or_add、dict 参数）全部覆盖。
- **exec 边完整性类**（本系列：synthetic→ordinary 断链，2026-08-14 #12）：
  - IR 层：implEdges 源必须是真实 node id（无 "undefined"）；connect 对 FlowMarkerRef
    （composite call 返回对象仅 __markerNodeId 无 id）必须用解析后的 sourceId。
  - GIA 层：合成调用节点 OutFlow 有 connects；链尾普通 exec 节点有物理 InFlow pin；
    两个后端都查（vendor overlay 与 legacy-handwritten——#12 实证 legacy 同样缺失）。
  - 日志判据：复合内上游全部有帧、链尾普通节点零帧 = 断链（head 前缀计数 0）；
    修复生效 = 链尾出现帧 + 宿主链恢复 + 定时器写入。

### 3. 一次修一组 + 回归

- 修改按"最小函数 + 同族覆盖"组织；每次修复后跑：新回归（shared+legacy 双后端）+ 相邻回归
  （p5w4 / local-variable / custom-variable / nested-capture / p4w7 / fail-fast）+ 真实项目编译。
- **可靠退出码**：`tsx test.ts && echo PASS || echo FAIL`——禁止用 `grep | tail` 管道判断
  （管道退出码恒为最后一个命令，曾致假阳性 PASS）。
- 报告分层：图查询结论 / 同族清单 / 修复项 / 回归结果 / 未覆盖项（如 client 路径、游戏核验）。

### 4. 未覆盖项显式登记

同族中不做/不能做的（无证据、超范围）显式列出，不静默跳过——如 client_nodes.ts 的同类
getMetadata 点（客户端图，本轮 server 范围外）、需要真实 GIA 证据的断言更新。

## 本技能适用示例

- 修复 callComposite 输入后：检查 buildArgument / composite_registry / collectDataDeps / parseValue
- 修复 dict 类型推断后：检查 conn dict k/v 全链路 + kv 变体查询兼容 + buildConnPin dict 编码
- 修复编码形态后：用官方 golden 逐字段对照同节点族

## 关联技能

- `codebase-memory`：图查询具体用法（索引/搜索/trace/架构）
- `editor-incremental-gia-investigator`：需要真实 GIA 证据时走差分实验
