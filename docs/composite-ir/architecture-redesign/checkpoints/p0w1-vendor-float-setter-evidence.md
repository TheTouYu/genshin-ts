# P0-W1 Vendor Node(324) Float Literal 实验证据

> 状态：已验证
> 来源：vendor Node+encode round-trip + 真实 GIA decode 对照
> 最近校验：2026-07-12
> 适用范围：Set_Node_Graph_Variable float literal (323→324)

## 真实 GIA 基线

文件：`复杂gia/物理运动.gia`，复合 `更新v、w` impl n[4]
变量名：`额外压力`，值：float `0`

```text
n=4 gid=323 cid=324
  InParam[0] type=6 alreadySetVal=true class=5 rawStr=额外压力   conns=[]
  InParam[1] type=5 alreadySetVal=true class=10000 bConcreteIdx=1 bFloat.val=0  conns=[]
  InParam[2] type=4 alreadySetVal=true class=6 bEnum=0          conns=[]
```

## Vendor Node(324) 输出

```ts
const node = new Node(0, 'server', 324)
node.setVal(0, '额外压力')
node.setVal(1, 0)
node.setVal(2, false)
node.encode(opt)
```

```text
generic_id=323 concrete_id=324
  InParam[0] type=6 alreadySetVal=true class=5 rawStr=额外压力
  InParam[1] type=5 alreadySetVal=true class=10000 bConcreteIdx=1 bFloat.val=0
  InParam[2] type=4 alreadySetVal=true class=6 bEnum=0
```

## Vendor Node(323) 无 concrete ID

```ts
const node = new Node(1, 'server', undefined, 323)
// 无法调用 setVal — 无 setConcrete 时不初始化 pins
```

```text
generic_id=323 concrete_id=undefined
```

## 实验环境

```bash
npx tsx tests/composite/experiment-vendor-set-node-graph-variable.ts
```

## 结论

1. **Vendor `new Node(0, 'server', 324)` 逐字段匹配真实 setter** — concrete ID、bConcreteValue、indexOfConcrete、bFloat.val 和 bEnum 均一致。
2. **Generic-only `Node(323)` 不生成 concrete ID，也无法设置值** — 必须先用 concrete ID 构造或调用 `setConcrete()`。
3. **当前 impl 差异的根因**：impl 编码器未使用 concrete variant ID（324），导致无 concrete ID 且 float 值作为裸 `bFloat.val` 而非 `bConcreteValue` 包裹输出。

## 未覆盖

- int/bool/str/vec3/entity/guid 等其它类型的 concrete variant 未验证
- `Graph.connect()` 的实验未在 P0-W1 范围内
- 嵌套 composite 的 impl node ID remap 未验证
