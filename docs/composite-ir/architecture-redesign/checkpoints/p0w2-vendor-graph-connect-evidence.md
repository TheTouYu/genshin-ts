# P0-W2 Vendor Graph.connect() Float Connection 实验证据

> 状态：已验证
> 来源：vendor Graph.connect + encode/decode round-trip + 真实 GIA decode 对照
> 最近校验：2026-07-12
> 适用范围：Set_Node_Graph_Variable float variant + Addition Float 的 data connection

## 实验设置

```ts
const graph = new Graph('server', 1000, 'experiment-graph-connect', 1000)
const addition = graph.add_node(201)  // Addition__Float (concrete float)
addition.setVal(0, 1.5)
addition.setVal(1, 2.5)
const setter = graph.add_node(324)    // Set_Node_Graph_Variable__Float
setter.setVal(0, '额外压力')
setter.setVal(2, false)
graph.connect(addition, setter, 0, 1) // out[0] → in[1]
```

## 结果

### Connection 编码

```text
InParam[1] type=5 conns=1 alreadySetVal=true bConcreteIdx=1
  connects=[{id: 1, connect: {kind: 4, index: 0}}]
```

- `graph.connect(addition, setter, 0, 1)` → 正确连接到 setter 的 InParam[1]（value pin） ✓
- source pin kind=4 (output), index=0 (Addition 的第一个也是唯一输出) ✓
- 连接不丢失 concrete wrapper（bConcreteValue 表⽰ reflective type） ✓

### Round-trip encode→decode→encode 验证

- 连接在 round-trip 后保留
- concrete ID 保留（324, 201）
- 类型信息保留

### 与真实 GIA 对照

| 特性 | 真实 GIA connected (n=10, cid=334) | Vendor connected (cid=324) |
|---|---|---|
| InParam[1] 有 connection | ✓ | ✓ |
| InParam[1] 有 bConcreteValue | ✓ (empty inner) | ✓ (with default inner from vendor) |
| InParam[1] 无 bFloat value | ✓ (no value on connected pin) | bFloat.val=0 is proto default, not actual wire |
| alreadySetVal=true | ✓ | ✓ |

## 关键结论

1. **`Graph.connect()` 直接适用于 impl graph** — 正确将数据输出连接到目标 InParam。
2. **No hidden-pin remap needed** — Addition 的输出 pin0 直接映射到 OutParam[0]。
3. **Concrete wrapper 正确保留** — bConcreteValue.indexOfConcrete 在连接后仍存在。
4. **Connected pin 不带值 payload** — 与真实 GIA 一致。
5. **`alreadySetVal=true` 在 connected pin 上出现是正常现象** — 真实 GIA 也如此。

## 未覆盖

- Connection 与 literal default value 共存时的行为（Q-003）
- Vec3 等复合类型的 connection（P0-W3）
- Multiple outgoing connections from one output
- composite boundary 中 node index remap 后的 connection 修正
