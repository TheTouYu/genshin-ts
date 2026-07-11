# P0-W3 Vendor Vec3 Connection 实验证据

> 状态：已验证
> 来源：vendor Graph.connect + schema inspect + encode/decode round-trip + 真实 GIA decode 对照
> 最近校验：2026-07-12
> 适用范围：Set_Node_Graph_Variable Vec variant (cid=334) + 3D Vector Addition 的 data connection

## 关键发现

### Pin schema 对照

| 特性 | Vendor 334 setter | 真实 GIA cid=334 setter | 匹配 |
|---|---|---|---|
| generic_id | 323 | 323 | ✓ |
| concrete_id | 334 | 334 | ✓ |
| InParam[1] iOC/bcIdx | 11 | 11 | ✓ |
| InParam[1] type | Vec (type=12) | Vec (type=12) | ✓ |
| InParam[1] bConcreteValue | 存在 | 存在 | ✓ |
| alreadySetVal | true | true | ✓ |

### connection round-trip

```text
3D Vector Addition (10) OutParam[0] → Setter Vec (334) InParam[1]
  → 连接正确保留 ✓
  → bConcreteValue 有 bConcreteIdx=11 ✓
  → bVector={} (protobuf 默认值, 不表示实际的 wire 负载) ✓
```

## 结论

1. **Vendor Node(334) 的 Vec variant pin schema 与真实 GIA 完全一致**
2. **`Graph.connect(vadd, setter, 0, 1)` 正确处理 Vec3 连接**
3. **indexOfConcrete=11 准确对应 reflectMap 中 Vec 变体的位置**
4. **Connected pin 的行为（bConcreteValue wrapper, 无值负载, alreadySetVal=true）与真实 GIA 一致**

## 协议结论：vendor 优先策略成立

三个实验（P0-W1、P0-W2、P0-W3）共同证明：

```
Vendor Node(id) + setVal() + Graph.connect() → Graph.encode()
```

可以直接生成与真实 GIA 一致的结构，**包括**：
- concrete ID 正确
- bConcreteValue 包裹正确 
- indexOfConcrete 正确
- data connection 正确
- round-trip 正确

当前 impl 差异的根因已明确：
只有 generic ID（323）被使用，缺少 `setConcrete()` 调用。
