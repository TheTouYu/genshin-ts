# R20 复盘：CompositeDef bool 参数的 EnumId 元数据缺失

> 状态：已验证
> 来源：真实 GIA 验证 + 当前代码实现 + 游戏内验证
> 最近校验：2026-07-11
> 适用范围：gsts 当前 CompositeDef GIA 输出、游戏编辑器真实导入结果、vendor legacy schema 维护

## 1. 复盘目标

本次问题的表面现象是：复合节点的 bool 参数在游戏编辑器中不能正常显示或选择 `true/false`。复盘目标不是只记录“补了一个字段”，而是固化一条可重复的排查链：

```text
游戏现象
  → 最小真实 GIA A/B
  → IR / decoded JSON 对照
  → protobuf wire-level presence
  → schema 语义确认
  → 编译器输出修复
  → 正向与负向回归
  → 游戏验证
  → vendor 兼容维护
```

核心经验：当 decoded JSON 看起来一致但游戏行为不同，必须优先检查 protobuf 字段是否真实存在，而不能只依赖 defaults 解码后的 JSON。

## 2. 问题边界与最终结论

### 2.1 最终结论

`CompositeDef.ParameterFlow.Type` 缺失 protobuf field 101。该字段的正式语义为：

```proto
message Type {
  oneof type {
    EnumId enumId = 101;
    MapType mapType = 105;
  }

  message EnumId {
    int64 val = 1;
  }
}
```

真实 bool 文件中的 field 101 wire 内容为：

```text
fieldNo: 101
wireType: 2
rawHex: aa06020801
payloadHex: 0801
```

因此 CompositeDef 的 bool input/output 类型必须编码为：

```typescript
{
  class: 6,
  type1: 4,
  type2: 4,
  enumId: { val: 1 },
  valueId: null
}
```

这里有两个不能混淆的值：

- `CompositeDef.inputs[].type.enumId.val = 1`：bool 接口类型的枚举元数据。
- 调用节点 pin 的 `value.bEnum.val`：这一次调用的实际 `false/true` literal。

只修改调用节点的 `bEnum`，不能替代 CompositeDef 类型元数据。

### 2.2 适用范围

当前证据只覆盖 CompositeDef 的 bool 参数。不能据此推断所有枚举、所有普通系统节点 literal 或 signal 参数也需要 `enumId.val=1`。当前实现只在 CompositeDef 参数类型为 `bool` 时写入该字段；int、float、string 等非 bool 类型不携带 `enumId`。

## 3. 证据来源

### 3.1 真实文件

主要参考文件：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/变量/bool.gia
```

游戏验证样本：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/bool-gsts-7-compiler-enum-id.gia
```

物理运动对照文件：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/物理运动.gia
```

真实 bool 文件 payload SHA-256：

```text
03caca5c988a5522dde6236187b1350dfe0830bb5800eeb054a506dbf491eda3
```

### 3.2 解码限制

`decode_gia_file()` 使用 protobuf defaults。对于未被当前 schema 声明的字段，解码后的 JSON 可能无法体现字段缺失；重新编码时该字段会被丢弃。因此：

```text
decoded JSON 相同 ≠ protobuf wire 相同
```

本次真实文件 round-trip 从 851 bytes 变为 846 bytes，丢失的正好是 field 101 的 5 bytes。最终定位依赖 raw wire 扫描，而不是普通 JSON diff。

## 4. 排查过程

### 4.1 最小 A/B

先建立以下候选：

1. 真实游戏可用的 bool CompositeDef 文件。
2. 缺少 field 101 的 schema round-trip 文件。
3. 当前编译器生成的 candidate 文件。
4. 补齐 `enumId.val=1` 后的 candidate 文件。

游戏导入目录测试采用串行清理，避免旧文件的同名、同 ID 或缓存影响判断。

### 4.2 被排除的假设

| 假设 | 实验 | 结果 | 结论 |
|---|---|---|---|
| `type_server.kind=0` 是根因 | 修改 type server kind 并做 wire A/B | 游戏仍异常 | 排除 |
| composite pinIndex 数值错误 | 独立测试 `100 → 61` | 游戏仍异常 | 排除 |
| CompositeDef 与 impl 的 ID 关系错误 | 使用真实共享 ID 复刻 | 定义可见但 bool 控件仍异常 | 排除为根因 |
| 只复制定义、impl 和调用拓扑即可修复 | 完整复制真实结构后 round-trip | 缺 field 101 的文件仍异常 | 排除 |
| 只有调用节点 `bEnum` literal 缺失 | 保留/修改 literal 做对照 | 不能解释 CompositeDef 类型差异 | 排除 |
| outflow 或物理运动布局导致 bool 控件异常 | 对照真实 `user_edit/变量/bool.gia` | 真实 bool 文件 `outflows=[]`，问题仍独立存在 | 排除 |

### 4.3 wire-level 定位

递归扫描真实文件后，唯一关键差异为：

```text
path = Root.accessories[0].compositeDef[0].inner[0].def[0]
       .inputs[0].type[0]
fieldNo = 101
wireType = 2
rawHex = aa06020801
payloadHex = 0801
```

在临时 schema 中加入：

```proto
EnumId enumId = 101;
message EnumId {
  int64 val = 1;
}
```

真实 `bool.gia` round-trip 后完整 payload SHA-256 恢复一致，确认了字段编号、wire 类型和子消息语义。

## 5. 实现变更

### 5.1 vendor schema

同步以下文件：

```text
src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto
src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.ts
```

### 5.2 编译器

文件：

```text
src/compiler/ir_to_gia_transform/composite.ts
```

函数：

```text
compositeParameterType(type)
```

inputs 和 outputs 统一经过该 helper。只有 `type === 'bool'` 时写入：

```typescript
enumId: { val: 1 }
```

普通系统节点 bool literal、signal 参数和无关布局逻辑未改变。

### 5.3 trace 工具

文件：

```text
tests/composite/trace-dataflow.ts
```

现在会从 CompositeDef.inputs 解析复合调用节点的输入类型，真实 bool 输入可以显示为 `Bol`，而不是 `?`。这属于工具显示能力，不等同于游戏验证结论。

## 6. 自动验证

新增/扩展：

```text
tests/composite/test-composite-bool-input-gia.ts
```

覆盖：

- bool input 的 decoded `enumId.val === 1`。
- bool output 的 decoded `enumId.val === 1`。
- raw protobuf 中 field 101 实际存在。
- int input/output 不携带 `enumId`。
- 调用节点 literal 仍由 `bEnum.val` 表达。
- composite pin kind/index 和参数路由未回归。

已通过：

```text
npm run build
npx tsx tests/composite/test-composite-bool-input-gia.ts
npx tsx tests/composite/test-composite-empty-name-input.ts
npx tsx tests/composite/test-composite-sparse-named-input.ts
node bin/gsts.mjs -c gsts.physics-motion.config.ts --noinject
 git diff --check
```

物理运动重新生成后的统计：

```json
{
  "boolParams": 6,
  "withEnumId": 6,
  "invalidNonBool": 0
}
```

## 7. 游戏验证

用户已确认以下生成样本在游戏中修复了 bool 控件：

```text
bool-gsts-7-compiler-enum-id.gia
```

验证结果：复合节点 bool 参数可以正常显示和选择 `true/false`。

游戏导入目录中的临时 `bool-gsts-*` 文件已在验证后清理，避免后续导入覆盖或缓存干扰。

## 8. 测试系统暴露的问题

`npm test` 未完整通过，失败点为已有调试脚本：

```text
tests/composite/_dump-layout-c-ir.ts:19:9
cannot infer list type, please add type annotation
```

这不是本次 bool 修复引入的错误，但说明正式测试扫描范围包含 `_dump-*` 调试脚本。后续应将 debug 脚本与正式 regression/reference 测试隔离，避免一个无关调试文件阻断完整测试。

当前边界：

- 本轮没有修改该无关调试脚本。
- `npm test` 当前不能作为全绿的完整验收信号。
- 针对性 build、CompositeDef wire 回归和物理运动生成均已通过。

## 9. Vendor 来源与维护策略

兼容补丁维护在独立 fork：

```text
repo:   TheTouYu/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack
branch: compat/genshin-ts-legacy-schema
base:   b6ceb52 chore: sync genshin-ts legacy schema baseline
patch:  497d9ec fix: preserve composite enum type metadata
```

genshin-ts 中对应提交：

```text
76478b9 vendor: sync composite enum metadata schema
2356564 fix: encode composite bool enum metadata
```

未来 vendor 更新流程：

1. 更新 fork 的上游基线。
2. 检查新 schema 是否已经正式包含 `CompositeDef.ParameterFlow.Type.field 101`。
3. 检查字段编号、oneof 分支和 `EnumId { val: 1 }` 语义是否一致。
4. 如果已包含，删除本地兼容补丁并保留 wire 回归。
5. 如果未包含，在新的 legacy schema 基线上重放 `497d9ec` 的语义补丁。
6. 运行 schema round-trip、CompositeDef 回归、build、物理运动生成。
7. 如需宣称游戏行为修复，重新执行串行清理后的游戏验证。

不能直接用 fork `dev` 的新 schema 覆盖 genshin-ts 当前 legacy schema；两者消息架构已经发生大规模迁移。

## 10. 可复用排查流程

下次遇到“编辑器显示异常、但 decoded JSON 看起来正常”时，按以下顺序执行：

### Phase A：建立最小差异

- 保留一个真实可用文件和一个真实异常文件。
- 每次只改变一个协议因素。
- 为候选文件使用唯一名称和唯一 ID。
- 游戏目录测试前清理旧样本。

### Phase B：先比较 wire，再比较 JSON

```text
文件大小
→ payload hash
→ raw wire field
→ schema-known / schema-unknown
→ decoded JSON
→ IR
```

必须分别检查“字段值”和“字段 presence”。

### Phase C：优先排查协议层

1. field 是否丢失。
2. oneof 分支是否错误。
3. 类型元数据是否缺失。
4. literal 是否错误。
5. pinIndex 是否错误。
6. ID、relatedIds、拓扑和布局。

### Phase D：记录每个假设

每个实验都记录：

```text
假设 / 单一改动 / 观察结果 / 排除或确认 / 证据文件
```

不要把阶段性推测写成最终结论。

### Phase E：完成五层验证

最终修复至少分别验证：

1. 游戏表现。
2. IR 表示。
3. protobuf schema。
4. raw wire bytes。
5. vendor 来源和可重放策略。

## 11. 后续行动项

| 优先级 | 行动 | 目的 | 状态 |
|---|---|---|---|
| P0 | 将最小 field-presence / round-trip 测试保留为正式回归 | 防止 schema 再次静默丢字段 | 已完成 |
| P0 | 维护 bool input/output 和非 bool negative assertions | 防止 helper 过度泛化 | 已完成 |
| P1 | 将临时 wire 扫描脚本整理为正式 GIA 工具 | 减少重复逆向劳动 | 待完成 |
| P1 | 隔离 `_dump-*`、`_debug-*` 脚本 | 恢复 `npm test` 的可信度 | 待完成 |
| P1 | 建立游戏导入目录清理与 SHA-256 记录脚本 | 降低缓存、ID、同名文件误判 | 待完成 |
| P1 | 建立 vendor schema 更新 playbook | 降低未来重放兼容补丁成本 | 部分完成，本文已记录流程 |
| P2 | 维护 GIA protocol findings 登记表 | 集中记录字段编号、wire bytes 和适用范围 | 待完成 |

## 12. 一句话总结

这次修复的真正成果不是单独补上 `enumId=1`，而是确认了 GIA 问题必须同时在游戏表现、IR、protobuf schema、wire presence 和 vendor 版本五个层次闭环验证；其中任何一层缺失，都可能让“看起来相同”的 JSON 继续生成游戏无法识别的文件。
