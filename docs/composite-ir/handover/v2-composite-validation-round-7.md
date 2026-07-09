# V2 复合节点验证交接文档 · 第七轮

> 状态：进行中 / 当前实现 / 历史记录
> 来源：当前代码实现 + 普通 gsts 编译链路自动验证 + 架构审计
> 最近校验：2026-07-08
> 适用范围：复合节点系统节点复用审计、Phase 1 类型映射统一、all-types collections/list smoke 自动验证

> **整体推进入口**：[../../architecture/composite/system-node-reuse-audit.md](../../architecture/composite/system-node-reuse-audit.md)
> **上一轮入口**：[v2-composite-validation-round-6.md](v2-composite-validation-round-6.md)
> **当前 Stage 3 GIA 编码文档**：[../../architecture/composite/gia-encoding.md](../../architecture/composite/gia-encoding.md)
> **当前测试矩阵文档**：[../../architecture/composite/testing.md](../../architecture/composite/testing.md)

---

## 一、本轮目标

用户明确要求：不要把第六轮 collections 暴露的问题当作几个 list 类型 bug 做止血，而是从文档开始，系统性推进“复合节点是否复用普通系统节点”的架构整理。

本轮因此分两步推进：

1. 建立整体推进文档，把 round-6 升级为系统节点复用审计入口。
2. 开始 Phase 1：抽出共享类型映射，让普通主图路径和 composite impl 路径不再各自维护基础类型映射。

---

## 二、本轮新增/修改文件

新增文档：

```text
docs/architecture/composite/system-node-reuse-audit.md
```

更新文档导航/上下文：

```text
docs/documentation-map.md
docs/architecture/composite/gia-encoding.md
docs/architecture/composite/testing.md
docs/composite-ir/handover/README.md
```

新增代码模块：

```text
src/compiler/ir_to_gia_transform/vartype_map.ts
```

修改代码：

```text
src/compiler/ir_to_gia_transform/composite.ts
src/compiler/ir_to_gia_transform/pins.ts
src/compiler/ir_to_gia_transform/node_id.ts
src/compiler/ir_to_gia_transform/index.ts
scripts/generate-composite-node-gia-tests.ts
tests/composite/v2/all-types/assert-list-type-ops-smoke.ts
```

生成器重新生成后有变更：

```text
tests/composite/v2/all-types/generated/_report.json
```

注意：本轮尚未提交。工作区仍有既有未跟踪目录：

```text
.agents
```

不要误提交或删除它，除非用户明确要求。

---

## 三、文档层完成情况

### 3.1 新整体入口

新增：

```text
docs/architecture/composite/system-node-reuse-audit.md
```

它现在是复合节点“系统节点复用”工作的整体推进入口，覆盖：

- round-6 为什么不是单点 list bug；
- API / IR / GIA 编码三层复用现状；
- 普通主图 Stage 3 路径 vs composite impl Stage 3 路径；
- 已复用与未复用能力表；
- 类型映射、节点 ID、pin 编码、特殊节点处理分叉；
- Phase 0~4 路线；
- 复用率/差距度量表；
- L0~L6 测试矩阵；
- 当前进度快照和下一步建议。

### 3.2 导航接入

已接入：

- `docs/documentation-map.md` 新增“审计复合节点是否复用普通系统节点”入口。
- `docs/architecture/composite/gia-encoding.md` 新增第 0 节，说明当前 composite impl 不是普通节点编码路径的完整复用。
- `docs/architecture/composite/testing.md` 新增“系统节点复用测试矩阵”。
- `docs/composite-ir/handover/README.md` 把 v2-r6 标为架构审计触发点，而不是单纯 list 类型修复入口。

---

## 四、Phase 1 类型映射统一进展

### 4.1 新增共享模块

新增：

```text
src/compiler/ir_to_gia_transform/vartype_map.ts
```

当前提供：

```ts
irTypeToVarType(type)
irTypeToVarBaseClass(type)
irTypeToVendorBaseTag(type)
irTypeToNodeSuffix(type)
irScalarTypeToNodeType(type)
irTypeToNodeType(type)
isListType(type)
listElementType(type)
```

覆盖 scalar/list 类型：

```text
bool/int/float/str/vec3/guid/entity/prefab_id/config_id/faction
bool_list/int_list/float_list/str_list/vec3_list/guid_list/entity_list/prefab_id_list/config_id_list/faction_list
```

关键修复来自共享映射，不是在 `composite.ts` 中局部补丁：

| IR 类型 | VarType |
|---|---:|
| `vec3_list` | `VectorList = 15` |
| `config_id_list` | `ConfigurationList = 22` |
| `prefab_id_list` | `PrefabList = 23` |
| `faction_list` | `FactionList = 24` |

### 4.2 已接入位置

`composite.ts`：

- `argVarType` 委托到 `irTypeToVarType`；
- `argVarBaseClass` 委托到 `irTypeToVarBaseClass`；
- `typeIdFromValueType` 委托到 `irTypeToVarType`；
- `typeClassFromValueType` 委托到 `irTypeToVarBaseClass`；
- `get_node_graph_variable` 的变量类型 suffix 推断委托到 `irTypeToNodeSuffix`。

`pins.ts`：

- 删除本地 `BaseTag` / `toVendorBaseTag`；
- `setLiteralArgValue` 改用 `irTypeToVendorBaseTag`。

`node_id.ts`：

- `suffixFromValueType` 改用 `irTypeToNodeSuffix`。

`index.ts`：

- `baseNodeType` 改用 `irScalarTypeToNodeType`；
- `valueTypeToNodeType` 改用 `irTypeToNodeType`；
- `compositeTypeToBaseTag` 改用 `irTypeToVendorBaseTag`。

### 4.3 顺手修复的 build 问题

`npm run build` 初次失败在既有新增脚本：

```text
scripts/generate-composite-node-gia-tests.ts
```

错误原因：`PROFILE_METHODS[profileName]` 用 string 索引没有类型保护。

已修复为：

```ts
type ProfileName = keyof typeof PROFILE_METHODS
function isProfileName(name: string): name is ProfileName
```

---

## 五、自动验证结果

### 5.1 Build

```bash
npm run build
```

结果：通过。

### 5.2 list-type smoke 生成

```bash
node bin/gsts.mjs tests/composite/v2/all-types/list-type-ops-smoke.ts || true
```

生成成功：

```text
dist/tests/composite/v2/all-types/list-type-ops-smoke.gia
```

命令末尾报：

```text
Beyond_Local_Save_Level not found: /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/100431567/Beyond_Local_Save_Level
```

这是当前环境缺少游戏保存路径导致的复制/注入阶段错误；`.gia` 已生成，不影响本轮编译验证。

### 5.3 list pin 类型断言

```bash
npx tsx tests/composite/v2/all-types/assert-list-type-ops-smoke.ts \
  dist/tests/composite/v2/all-types/list-type-ops-smoke.gia
```

结果：

```text
Composite list type pin smoke passed. Checked pins: 100
```

本轮还修正了断言脚本的已知粗糙点：`searchListAndReturnValueId(...)` 返回 `int_list`，所以后续 `getListLength(ids)` 应消费 `IntegerList = 8`，不应按外层 case 类型断言。

### 5.4 collections 重新生成与编译

```bash
npx tsx scripts/generate-composite-node-gia-tests.ts collections
node bin/gsts.mjs tests/composite/v2/all-types/generated/collections.literal.ts || true
node bin/gsts.mjs tests/composite/v2/all-types/generated/collections.wire.ts || true
```

生成成功：

```text
dist/tests/composite/v2/all-types/generated/collections.literal.gia
dist/tests/composite/v2/all-types/generated/collections.wire.gia
```

同样只在最后复制/注入阶段报 `Beyond_Local_Save_Level not found`。

### 5.5 diff check

```bash
git diff --check
```

结果：无输出，通过。

---

## 六、当前未完成事项

### 6.1 Phase 1 还没完全收口

当前 `composite.ts` 仍保留 wrapper 函数：

```ts
argVarType(...)
argVarBaseClass(...)
typeIdFromValueType(...)
typeClassFromValueType(...)
```

这些已经委托到共享模块，但还没有完全删除。下一步建议把调用点直接替换为：

```ts
irTypeToVarType(...)
irTypeToVarBaseClass(...)
```

目标：`composite.ts` 不再定义自己的类型映射函数。

### 6.2 缺少 L0 类型映射断言

下一步建议新增：

```text
tests/composite/v2/all-types/assert-vartype-map.ts
```

断言所有 scalar/list 类型的：

- VarType；
- VarBase_Class；
- vendor base tag；
- node suffix；
- list element type。

这样类型映射不再依赖 `collections` 这种大集成测试间接发现问题。

### 6.3 L1 普通主图 vs composite impl 对照测试尚未开始

建议 Phase 1 收口后开始 L1：

```text
tests/composite/v2/all-types/compare-system-node-reuse.ts
```

先覆盖三类：

- `assemblyList/getListLength`；
- `concatenateList`；
- `addition/equal`。

比较维度：

- node ID；
- InParam pin type；
- OutParam pin type；
- literal value；
- data connects；
- exec connects。

---

## 七、建议下一轮顺序

1. 新增 `assert-vartype-map.ts`，让 Phase 1 类型映射有 L0 自动断言。
2. 删除 `composite.ts` 中的类型映射 wrapper，调用点直接使用 `vartype_map.ts`。
3. 重新运行：

```bash
npm run build
npx tsx tests/composite/v2/all-types/assert-vartype-map.ts
node bin/gsts.mjs tests/composite/v2/all-types/list-type-ops-smoke.ts || true
npx tsx tests/composite/v2/all-types/assert-list-type-ops-smoke.ts \
  dist/tests/composite/v2/all-types/list-type-ops-smoke.gia
```

4. 开始设计 L1 普通主图 vs composite impl 对照测试。
5. L1 能稳定跑后，再进入 Phase 2：统一 `resolveImplNodeId` 与普通路径 `resolveGiaNodeId` 的推断逻辑。

---

## 八、给下一位助手的一句话

> round-7 已把 round-6 的 list 类型问题升级为“系统节点复用审计”，新增 `system-node-reuse-audit.md` 作为总入口，并开始 Phase 1 类型映射统一：新增 `vartype_map.ts`，让 `composite.ts/pins.ts/node_id.ts/index.ts` 复用共享映射。`npm run build` 通过，`list-type-ops-smoke` 生成成功，`assert-list-type-ops-smoke` 通过 100 个 pin 检查，collections literal/wire 可生成 `.gia`。下一轮先补 L0 `assert-vartype-map.ts`，再删除 `composite.ts` 的类型映射 wrapper，然后开始 L1 普通主图 vs composite impl 对照测试。
