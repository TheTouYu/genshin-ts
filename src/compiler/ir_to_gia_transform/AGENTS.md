# `src/compiler/ir_to_gia_transform/`：Stage 3 IR → GIA

## 适用范围

这里将 `IRDocument` 编码为 `.gia`。它消费 `src/runtime/IR.d.ts`，通过
`src/compiler/gia_vendor.ts` 使用 vendor 的 `Graph`、`Node`、`Pin` 与 protobuf 包装能力。

## 关键文件

- 普通节点/引脚：`ordinary_node_factory.ts`、`ordinary_graph_materializer.ts`、`pins.ts`、`mappings.ts`。
- Composite：`composite.ts`、`lower_composite_call.ts`、`build_composite_pins.ts`、`build_composite_definition.ts`、`build_composite_layout.ts`。
- 边界适配：`pin_hole_adapter.ts`、`special_arg_adapter.ts`、`normalize_capture.ts`。
- 信号：`build_signal_definition.ts`。
- 布局/优化：`layout.ts`、`optimize_timer_dispatch.ts`、`node_id.ts`。
- 入口：`index.ts`、`runner.ts`、`stage3_backend.ts`。

## 修改前

- 先确认问题在类型解析、ordinary node lowering、Composite 边界、布局、优化还是 protobuf 物化层。
- 涉及 Composite、GIA、真实样本、布局、地图或注入时，先按 Composite/GIA 文档导航读取最小必要资料；不要用历史 handover 代替当前源码和测试。
- 真实 GIA 结论必须有样本路径、命令、观察字段和适用范围；vendor 行为或 decode 默认值不能单独证明真实 wire presence 或游戏行为。

## 修改规则

- 保持为 `IR.d.ts` 的纯消费者；不要为了类型解析导入 `src/definitions/`。
- 通过 `gia_vendor.ts` 使用 vendor API；不要直接改 `src/thirdparty/`，也不要手写 protobuf 字节。
- 保持 root 与 Composite impl 的 ordinary-node 类型决策、pin schema 和连接语义一致；
  Composite 特殊逻辑仅限 definition、synthetic call、capture、`compositePins` 和边界布局。
- `__composite_call__` 的 OutParam 输出连接到普通节点时，必须绕过 ordinary data-edge pin materializer，使用复合 OutParam overlay 建立连接；新增或修改该路径必须有 timer/Composite focused GIA 回归。
- pin-hole / hidden-pin 节点：IR 参数序与物理 InParam 不一致时，必须走共享 remap
  （`pin_hole_adapter.ts`）。凡同时触及 capture 与 pin-hole，vendor/legacy 过滤物理 pin 与
  `compositePins.innerPinIndex` 必须用同一物理脚位；只 remap 一侧会出现“主图正常、复合丢参”。
- capture 输入被当前复合 `compositePins` 直接指向（边界路由）时，必须保留类型化物理 InParam pin，
  并独立生成该节点的 OutParam；「普通 capture 输入跳过物理 pin」的规则不适用于这种边界路由场景。
  `data_type_conversion_*` 用 ConcreteBase/EnumBase oneof 包裹；普通数据节点（如列表反射
  `get_corresponding_value_from_list` 的 index capture）用普通 VarBase 值 pin。legacy 后端
  `buildImplNodePins` 的 `unconfiguredVariant` 门必须把 `ordinaryConcreteNid` 一并纳入判定，
  与 vendor 后端对齐，否则已解析 concrete 变体的边界 capture 会被误判为「未配置 Variant」而整体跳过。
  回归：`tests/composite/test-stage3-bool-boundary-dtc-physical-pins.ts`、
  `tests/composite/test-stage3-list-boundary-capture-physical-pin.ts`。
- special-arg 节点（signal / assembly / multiple_branches）：字面量布局与 IR→physical remap
  必须走共享 `special_arg_adapter.ts`（P5-W10）。root `applySpecialArgs`、factory 与
  composite vendor/legacy 不得再各写一套 count@0 / ClientExec name / case-list 逻辑。
- 信号 send/monitor：编码后必须经 `build_signal_definition.ts` 写出 SignalDef(which=14)+
  监听信号 CompositeDef，并把占位 300000/300001 修成内置 SysGraph id（1610612738/1610612739）
  与 compositePinIndex；否则编辑器加载时看不到参数脚位（注入 remap 不能替代这一步）。
- 信号 ParameterFlow 类型与普通 CompositeDef 不同（真实 GIA）：`entity` 用 class=Unknown(0)
  type1=Entity(1)；任意 `*_list` 用 class=ArrayBase(10002) 且 type1=type2=StringList(11)
  （列表元素区分在物理 pin / 接线值，不在 ParameterFlow type1）。勿把 entity 写成 IdBase(1)，
  也勿把 list 的 type1 写成元素标量类型。
- 改动 capture、nested composite、多 inflow/outflow、sparse input、layout 或 graph metadata 时，
  先建立 focused 回归，不能顺手扩大行为范围。
- 真实 GIA、自动回归、生成候选、注入和游戏编辑器验证必须分别记录。

## 验证

- 运行最小 Stage 3 / composite 回归；生产 TypeScript 改动后运行 `npm run build` 和 `git diff --check`。
- Composite 输出到普通节点的修复，除自动 GIA 生成外，还要分别记录 GIA 导入和用户游戏内验证结果；不能以编译或注入成功替代游戏验证。
- 共享 Composite 行为变动时，补跑 nested、capture、sparse、root/impl parity 等受影响回归；未运行项明确说明。

## 不要做

- 不要猜测 mapId、nodeGraphId、游戏状态或真实 GIA 规律。
- 不要展开 nested composite、破坏 capture 路由，或未经确认注入/覆盖游戏文件。
