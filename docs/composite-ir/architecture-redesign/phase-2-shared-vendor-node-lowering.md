# Phase 2：共享 Vendor Ordinary-Node Lowering

> 状态：待执行
> 来源：目标架构设计；具体策略等待 Phase 0 实验
> 最近校验：2026-07-11
> 适用范围：普通系统节点；不包含 composite synthetic call/capture

## 目标

建立 root/impl 共用的 ordinary node factory，以 vendor `Node` 作为 pin schema 和 concrete wrapper 的主要物化器。

## 首个 vertical slice

`set_node_graph_variable`：

- float literal `额外压力=0`；
- vec3 connection `F/J/v/w`；
- bool trigger 参数；
- root 与 impl。

不得按物理变量名编码，节点族规则必须通用。

## P2-W1 当前结果：standalone vendor Graph metadata observation

状态：部分完成 / 观察契约已通过；impl embedding 仍待验证

新增观察测试：`tests/composite/test-stage3-vendor-graph-metadata.ts`

已验证：

- standalone `Graph.encode()` 能生成普通 setter NodeGraph；
- float setter 的 generic/concrete identity 和 `InParam[1]` concrete wrapper 与既有 vendor/真实 GIA 证据一致；
- standalone graph 的 `graphValues`、`compositePins`、`affiliations` 为空；
- 当前 CompositeDef impl wrapper 的 `graphValues`、`affiliations` 与 standalone vendor graph 的空字段一致；`compositePins` 是独立 boundary overlay，不应与 standalone 空列表直接比较；
- 当前 impl wrapper 保留 ordinary node identity，但 ordinary pin 编码仍为 handwritten；
- `Node#setPos()` 的编码包含 vendor 像素缩放和随机 shaking，因此不能直接视为 impl layout 坐标契约。

仍待验证：

- 当前 fixture 已覆盖多个 ordinary nodes、float data edge、nodeIndex remap 和 flow pin 扫描；Graph graph-id/name wrapper、分支 flow 和完整 position 映射仍未覆盖；
- `compositePins` boundary overlay 已单独观察，不作为 ordinary vendor metadata 的一部分；
- 该结果不能授权切换 production lowering 或删除 handwritten impl backend。

验证命令：

```bash
npm run build                                      # PASS
npx tsx tests/composite/experiment-vendor-graph-connect-float.ts # PASS
npx tsx tests/composite/test-stage3-vendor-graph-metadata.ts     # PASS
git diff --check                                   # PASS
```

## 工作项

### 2.1 提取共享 value adapter

把 root 内部 `setArgValue`、`setLiteralArgValue`、enum handling 组合为可从 ordinary factory 调用的接口。错误信息保留
node id/type/pin/arg。

### 2.2 建立 ordinary factory

输入 resolved identity/inputs，输出 vendor `Node` + pending edges。对 literal 调 `Pin.setVal()`；对 connection 保留
vendor 创建的 pin，不创建新 pin。

### 2.3 集中 normalization

把 `filterUnkPins`、name pin、hidden pin 等按证据迁入统一 adapter。首个切片只迁移 setter 所需规则，不同时重构
signals/list/dict。

### 2.4 Impl feature gate

迁移期允许按 ordinary node family 切换：

```text
shared vendor lowering supported → 新路径
otherwise → legacy buildImplNodePins
```

Gate 必须可枚举，测试中断言 setter 已走新路径；禁止 catch 后静默 fallback。

### 2.5 编码后契约

对新路径输出执行 runtime assertion：

- resolved concrete ID 等于 encoded concrete ID；
- 每个 resolved physical input 找到 vendor pin；
- pin type 与 resolved type 兼容；
- ordinary pin 不携带 compositePinIndex。

## 实现文件草案

```text
src/compiler/ir_to_gia_transform/resolved_graph.ts
src/compiler/ir_to_gia_transform/ordinary_node.ts
src/compiler/ir_to_gia_transform/vendor_normalization.ts
```

先新增共享模块，不先移动整个 `composite.ts`。

## 验证

- Phase 0 parity test 从失败转成功；
- `额外压力` 与真实 n[4] 逐字段对比；
- vec3 setters 逐字段检查；
- root output fixture 不发生意外变化；
- bool、nested、capture、local/custom focused tests；
- 生成物理 GIA但不注入。

## 退出条件

- [ ] setter family root/impl 共用 factory；
- [ ] float setter encoded concrete `324`；
- [ ] `InParam[1]` 与真实 concrete float 同构；
- [ ] vec3 connection 保留 vendor target schema；
- [ ] literal/connection parity 通过；
- [ ] `buildImplNodePins()` 不再为 setter 手写 ordinary pins；
- [ ] 已有迁移不变量通过；
- [ ] 未经确认未注入。

## 后续推广顺序

1. graph variable getter；
2. custom variable getter/setter；
3. local variable getter/setter；
4. DTC；
5. arithmetic/comparison；
6. list/dict 和特殊 ID 类型。

每族都重复“观察 fixture → vendor experiment → gate → parity → 删除 legacy branch”。
