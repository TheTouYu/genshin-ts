# V2 复合节点验证交接文档 · 第六轮

> 状态：待修复 / 已复现 / 历史记录
> 来源：当前代码实现 + 普通 gsts 编译链路自动验证 + 用户游戏内导入反馈
> 最近校验：2026-07-08
> 适用范围：v2 all-types 自动生成复合覆盖、composite impl 数据结构类型编码、列表类型 TDD 冒烟测试

> **必须先读的工作细节**：[layout-working-rules.md](layout-working-rules.md)
> **上一轮入口**：[v2-composite-validation-round-5.md](v2-composite-validation-round-5.md)
> **当前复合节点 API**：[../../architecture/composite/dsl-api.md](../../architecture/composite/dsl-api.md)
> **当前 Stage 3 GIA 编码文档**：[../../architecture/composite/gia-encoding.md](../../architecture/composite/gia-encoding.md)

---

## 一、本轮目标

本轮从 `all-types/` 方向开始，目标不是手写少量类型参数 case，而是参考普通节点自动生成测试的思路，把普通 `f.*` 节点 API 包进 `g.defineComposite(... build ...)`，验证复合节点 impl 理论上能承载普通节点能力组合。

本轮推进了两条线：

1. 新增复合节点自动生成测试脚本。
2. 通过 generated collections case 暴露并核验了 composite impl 中数据结构/list 参数类型编码错误。

---

## 二、本轮新增/修改文件

新增生成器：

```text
scripts/generate-composite-node-gia-tests.ts
```

新增生成目录：

```text
tests/composite/v2/all-types/generated/
```

当前生成文件：

```text
tests/composite/v2/all-types/generated/core.literal.ts
tests/composite/v2/all-types/generated/core.wire.ts
tests/composite/v2/all-types/generated/collections.literal.ts
tests/composite/v2/all-types/generated/collections.wire.ts
tests/composite/v2/all-types/generated/_report.json
```

新增 TDD/冒烟复现文件：

```text
tests/composite/v2/all-types/data-structure-type-smoke.ts
tests/composite/v2/all-types/list-type-ops-smoke.ts
tests/composite/v2/all-types/assert-list-type-ops-smoke.ts
```

注意：本轮未提交。当前这些文件仍是工作区新增文件，下一轮应先检查 `git status --short`。

---

## 三、已通过的部分

### 3.1 core 自动生成复合覆盖

生成器当前支持 profile：

```bash
npx tsx scripts/generate-composite-node-gia-tests.ts
```

`core` profile 覆盖：

```text
25 methods / 57 cases
```

主要包括：

- 数值运算：`addition/subtraction/multiplication/division/exponentiation/...`
- 比较：`lessThan/greaterThan/...`
- `equal`
- `dataTypeConversion`
- `assemblyList`
- `getListLength`
- `listIterationLoop`
- `printString`
- `finiteLoop`
- `doubleBranch`
- `multipleBranches`

普通编译链路通过：

```bash
node bin/gsts.mjs tests/composite/v2/all-types/generated/core.literal.ts || true
node bin/gsts.mjs tests/composite/v2/all-types/generated/core.wire.ts || true
```

生成：

```text
dist/tests/composite/v2/all-types/generated/core.literal.gia  (id=1073741924)
dist/tests/composite/v2/all-types/generated/core.wire.gia     (id=1073741925)
```

用户反馈：这两个 `.gia` **可以导入打开**。

归档位置：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/v2/all-types/all-types-generated-core-literal-passed.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/v2/all-types/all-types-generated-core-wire-passed.gia
```

---

## 四、暴露的严重问题

### 4.1 collections 自动生成复合覆盖

`collections` profile 覆盖：

```text
23 methods / 89 cases
```

主要包括：

- list：`concatenateList`、`clearList`、`listIncludesThisValue`、`searchListAndReturnValueId`、`getCorrespondingValueFromList`、`insertValueIntoList`、`removeValueFromList`、`modifyValueInList`
- dictionary：`assemblyDictionary`、`setOrAddKeyValuePairsToDictionary`、`queryDictionaryValueByKey`、`removeKeyValuePairsFromDictionaryByKey`、`queryIfDictionaryContainsSpecificKey`、`getListOfKeysFromDictionary`、`queryDictionarySLength`、`clearDictionary`、`createDictionary`、`queryIfDictionaryContainsSpecificValue`、`getListOfValuesFromDictionary`、`sortDictionaryByKey`、`sortDictionaryByValue`
- local variable：`getLocalVariable`、`setLocalVariable`

普通编译链路通过：

```bash
node bin/gsts.mjs tests/composite/v2/all-types/generated/collections.literal.ts || true
node bin/gsts.mjs tests/composite/v2/all-types/generated/collections.wire.ts || true
```

生成：

```text
dist/tests/composite/v2/all-types/generated/collections.literal.gia (id=1073741926)
dist/tests/composite/v2/all-types/generated/collections.wire.gia    (id=1073741927)
```

导出给用户：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/all-types-generated-collections-literal-step1.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/all-types-generated-collections-wire-step1.gia
```

用户反馈：问题严重，几乎全部数据结构操作参数类型错误。不要把 collections 标记为 passed。

---

## 五、核验结论

### 5.1 TS / `.gs.ts` 层正确

例如 generated collections 中：

```ts
f.concatenateList(
  f.assemblyList([3n, 4n, 5n], 'config_id'),
  f.assemblyList([4n, 5n, 6n], 'config_id')
)
```

`.gs.ts` 中仍保留：

```ts
f.assemblyList([3n, 4n, 5n], "config_id")
```

说明 Stage 1 没有把类型字符串改坏。

### 5.2 IR 层正确

`dist/tests/composite/v2/all-types/generated/collections.literal.json` 中，复合 impl 仍有正确 IR 类型：

```text
concatenate_list
  conn ... type:"config_id_list"

assembly_list
  config_id:3
  config_id:4
  config_id:5
```

说明 Stage 2 capture 后类型仍正确。

### 5.3 错在 Stage 3 composite GIA encoding

对比普通主图和 composite impl 的相同结构：

普通主图 `concatenateList(config_id_list, config_id_list)`：

```text
nodeId=100 Concatenate List
InParam[0] pin.type = 22
InParam[1] pin.type = 22
```

复合 impl 中相同结构：

```text
nodeId=100 Concatenate List
InParam[0] pin.type = 0
InParam[1] pin.type = 0
```

这说明普通主图编码路径正确，composite impl 编码路径错误。

---

## 六、TDD 冒烟测试

### 6.1 `list-type-ops-smoke.ts`

文件：

```text
tests/composite/v2/all-types/list-type-ops-smoke.ts
```

覆盖 10 种列表类型：

```text
bool_list
int_list
float_list
str_list
vec3_list
guid_list
entity_list
prefab_id_list
config_id_list
faction_list
```

每种类型在 composite impl 内覆盖：

```text
assemblyList
concatenateList
clearList
getListLength
listIncludesThisValue
searchListAndReturnValueId
getCorrespondingValueFromList
insertValueIntoList
modifyValueInList
removeValueFromList
listIterationLoop
```

生成命令：

```bash
node bin/gsts.mjs tests/composite/v2/all-types/list-type-ops-smoke.ts || true
```

当前可生成：

```text
dist/tests/composite/v2/all-types/list-type-ops-smoke.gia (id=1073741929)
```

### 6.2 `assert-list-type-ops-smoke.ts`

文件：

```text
tests/composite/v2/all-types/assert-list-type-ops-smoke.ts
```

断言命令：

```bash
npx tsx tests/composite/v2/all-types/assert-list-type-ops-smoke.ts \
  dist/tests/composite/v2/all-types/list-type-ops-smoke.gia
```

当前结果：失败，问题已复现。

失败摘要：

```text
Composite list type pin smoke FAILED
Checked pins: 100
```

主要失败：

```text
vec3_list      expected 15, got 0
prefab_id_list expected 23, got 0
config_id_list expected 22, got 0
faction_list   expected 24, got 0
```

另外当前断言脚本还有一个已知粗糙点：

- `searchListAndReturnValueId(...)` 返回 `int_list`，后续 `getListLength(ids)` 的输入应该是 `int_list`。
- 当前断言按外层 case 类型检查所有 list consumer，因此 bool/float/str/guid/entity 等 case 中会出现一些 `expected 原类型 list, got int_list` 的额外失败。
- 下一轮修复断言时，应区分“原始 list consumer”和“search result int_list consumer”。

这个断言粗糙点不影响主问题结论：`vec3_list/prefab_id_list/config_id_list/faction_list` 在 composite impl 中确实编码成 `0`。

---

## 七、疑似根因

目标文件：

```text
src/compiler/ir_to_gia_transform/composite.ts
```

疑似相关函数：

```ts
argVarType(...)
argVarBaseClass(...)
buildConnPin(...)
buildLiteralPin(...)
typeIdFromValueType(...)
typeClassFromValueType(...)
```

当前 `argVarType` 对 list 类型只覆盖了部分元素类型，例如：

```text
int_list
bool_list
float_list
str_list
guid_list
entity_list
```

缺少至少：

```text
vec3_list -> VarType.VectorList = 15
prefab_id_list -> VarType.PrefabList = 23
config_id_list -> VarType.ConfigurationList = 22
faction_list -> VarType.FactionList = 24
```

可参考 protobuf enum：

```text
src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto
```

其中：

```text
VectorList = 15
ConfigurationList = 22
PrefabList = 23
FactionList = 24
```

普通主图路径使用 `src/compiler/ir_to_gia_transform/pins.ts`，该路径更完整；composite impl 使用 `composite.ts` 的独立映射，因此出现分歧。

---

## 八、下一轮建议

下一轮不要继续扩大 generated coverage，先修复 list/data-structure 类型编码。

建议顺序：

1. 改进 `assert-list-type-ops-smoke.ts`：
   - 保留当前失败检测。
   - 把 `searchListAndReturnValueId` 返回的 `int_list` 后续 `getListLength(ids)` 从外层 expected 中排除，或单独断言为 `8`。
2. 修复 `src/compiler/ir_to_gia_transform/composite.ts`：
   - 补齐 `argVarType` 的 list 映射。
   - 检查 `argVarBaseClass`、`typeIdFromValueType`、`typeClassFromValueType` 是否同样缺 list/id 类型映射。
3. 重新运行：

```bash
node bin/gsts.mjs tests/composite/v2/all-types/list-type-ops-smoke.ts || true
npx tsx tests/composite/v2/all-types/assert-list-type-ops-smoke.ts \
  dist/tests/composite/v2/all-types/list-type-ops-smoke.gia
```

4. 再重新生成 collections：

```bash
npx tsx scripts/generate-composite-node-gia-tests.ts collections
node bin/gsts.mjs tests/composite/v2/all-types/generated/collections.literal.ts || true
node bin/gsts.mjs tests/composite/v2/all-types/generated/collections.wire.ts || true
```

5. 自动断言通过后，再导出给用户游戏内测试。

---

## 九、不要忘记的工作区状态

本轮末尾尚未提交。预期新增/修改包括：

```text
scripts/generate-composite-node-gia-tests.ts
tests/composite/v2/all-types/generated/core.literal.ts
tests/composite/v2/all-types/generated/core.wire.ts
tests/composite/v2/all-types/generated/collections.literal.ts
tests/composite/v2/all-types/generated/collections.wire.ts
tests/composite/v2/all-types/generated/_report.json
tests/composite/v2/all-types/data-structure-type-smoke.ts
tests/composite/v2/all-types/list-type-ops-smoke.ts
tests/composite/v2/all-types/assert-list-type-ops-smoke.ts
```

另外工作区有既有未跟踪目录：

```text
.agents
```

不要误提交或删除它，除非用户明确要求。

---

## 十、给下一位助手的一句话

> `all-types` 第六轮已经建立“普通 f.* API 自动包进 composite build”的生成器，并验证 core profile 可导入打开；collections profile 暴露严重问题：composite impl 中多种 list/data-structure 参数 pin.type 错误。当前关键 TDD 是 `tests/composite/v2/all-types/list-type-ops-smoke.ts` + `assert-list-type-ops-smoke.ts`，断言已复现 `vec3_list/config_id_list/prefab_id_list/faction_list` 在 composite impl 中被编码成 `0`。下一轮先修 `src/compiler/ir_to_gia_transform/composite.ts` 的类型映射，再重新跑断言和 collections。
