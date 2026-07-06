# 纯数据复合节点实现关键突破

> 状态：历史记录 / 已解决
> 来源：当前代码实现验证 + 真实 GIA 文件对照
> 最近校验：2026-07-06
> 适用范围：纯数据复合节点修复记录；当前机制说明以 capture-mechanism.md、ir-representation.md 和 gia-encoding.md 为准。

## 背景

纯数据复合（如翻倍/加一）是仅含数据节点（addition 等）无 exec 节点的复合。其 GIA 编码与 exec 复合有多个关键差异，本文记录已验证的所有突破。

## 参考资料

| 文件 | 内容 |
|------|------|
| `user_edit/数据流输入参数合并比对.gia` | 两个纯数据复合：加法(2输入) + 加法-双倍(1输入用2次) |
| `user_edit/two_simple.gia` | 纯数据复合 + exec 复合的完整主图 |
| `user_edit/复杂_exec.gia` | 非终端+终端复合的 DAG |
| `user_edit/复杂2_exec.gia` | terminal-first + non-terminal-second 的链式 |

## 6 个关键突破

### 1. Impl graph 数据节点需要 bConcreteValue 包裹

addition 等数据节点的 impl graph pins 必须用 `ConcreteBase` (class=10000) 包裹：

```json
{
  "class": 10000,
  "alreadySetVal": true,
  "bConcreteValue": {
    "indexOfConcrete": 0,
    "value": {
      "class": 2,           // IntBase
      "alreadySetVal": false, // 占位为 false，字面量为 true
      "itemType": { "classBase": 1, "type_server": { "type": 3, "kind": 0 } },
      "bInt": { "val": 0 }
    }
  }
}
```

涉及函数：`buildLiteralPin`, `buildPlaceholderPin` 中的 `needsConcreteWrapping(nodeType)`。

`needsConcreteWrapping` 需覆盖所有数据计算节点（addition, subtraction, equal, greater_than 等）。

### 2. Impl graph 数据节点需要显式 OutParam pin

addition 等节点的 impl graph 需要额外的 OutParam(kind=4) pin 来暴露计算结果，供 compositePins 的 OutParam 映射使用。

REF 中 addition 节点有 3 个 pins：InParam[0], InParam[1], OutParam[0]。

### 3. compositePins 必须包含 OutParam 映射

纯数据复合的输出需要从 impl 节点的 OutParam 映射到复合的 OutParam：

```
outer=4:0 → node2(4:0)    // 复合输出 ← impl 节点的 OutParam
```

通过读取 capture 的 `outputValues[name].getMetadata()` 获取产生该输出的 impl 节点和 pin 信息。

### 4. 同一输入多次使用的 compositePin 映射

当 `addition(input, input)` 将同一个输入使用两次时，需要**多条 compositePin** 映射同一个 outer pin 到不同的 inner InParam：

```
outer=3:0 → node2(3:0)    // input → InParam[0]
outer=3:0 → node2(3:1)    // 同一个 input → InParam[1]
```

实现方式：在 capture 时给输入值标记 `__captureInputName`，在 `toCompositeDefIR` 时扫描所有 inner node 的 args，为每个匹配的 arg 创建一条 compositePin。

### 5. 主图 connected InParam 的 value 必须为 null

当复合调用的 InParam 来自数据连线（非字面量）时，其 value 应为 `null`：

```json
{ "connects": [{"id":3,"connect":{"kind":4,"index":0}}], "value": null, "type": 3 }
```

在 post-encoding 阶段检测 `pin.connects.length > 0` 的 InParam，设置 `pin.value = null`。

### 6. 捕获时使用无值但带类型的占位符

`createTypedValue('int')` 返回 `new int()`（value=undefined）有两个作用：
- `toIRLiteral()` 返回 `null` → 触发 `buildPlaceholderPin`（从 nodeType 推断类型）
- `readLiteralInt` 返回 `null` → 阻止预计算，确保数据节点被注册到捕获流中

`buildPlaceholderPin` 需根据 nodeType 推断正确的 VarBase class/type。

## 编码规范速查

| 场景 | bConcreteValue | alreadySetVal(内) | value(主图InParam) |
|------|---------------|-------------------|-------------------|
| impl 占位 InParam | ✅ class=10000 | false | — |
| impl 字面量 InParam | ✅ class=10000 | true | — |
| impl OutParam | ✅ class=10000 | false | — |
| 主图 字面量 InParam | ❌ | true | VarBase 结构 |
| 主图 连线 InParam | ❌ | — | **null** |

## 涉及文件

| 文件 | 关键函数/位置 |
|------|-------------|
| `src/runtime/composite_registry.ts` | `toCompositeDefIR()` — compositePins 计算，含多输入+OutParam |
| `src/compiler/ir_to_gia_transform/composite.ts` | `buildImplNodePins()`, `buildPlaceholderPin()`, `buildLiteralPin()`, `needsConcreteWrapping()` |
| `src/compiler/ir_to_gia_transform/index.ts` | `__composite_call__` 节点构建 + post-encoding null 值修正 |
| `src/runtime/core.ts` | `runCompositeCall()` — `__captureInputName` 标记 |
