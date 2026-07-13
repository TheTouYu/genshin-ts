# `src/compiler/ir_to_gia_transform/`：Stage 3 IR → GIA

## 适用范围

这里将 `IRDocument` 编码为 `.gia`。它消费 `src/runtime/IR.d.ts`，通过
`src/compiler/gia_vendor.ts` 使用 vendor 的 `Graph`、`Node`、`Pin` 与 protobuf 包装能力。

## 修改前

- 先确认问题在类型解析、ordinary node lowering、Composite 边界、布局、优化还是 protobuf 物化层。
- 涉及 Composite、GIA、真实样本、布局、地图或注入时，先按 Composite/GIA 文档导航读取最小必要资料；不要用历史 handover 代替当前源码和测试。
- 真实 GIA 结论必须有样本路径、命令、观察字段和适用范围；vendor 行为或 decode 默认值不能单独证明真实 wire presence 或游戏行为。

## 修改规则

- 保持为 `IR.d.ts` 的纯消费者；不要为了类型解析导入 `src/definitions/`。
- 通过 `gia_vendor.ts` 使用 vendor API；不要直接改 `src/thirdparty/`，也不要手写 protobuf 字节。
- 保持 root 与 Composite impl 的 ordinary-node 类型决策、pin schema 和连接语义一致；
  Composite 特殊逻辑仅限 definition、synthetic call、capture、`compositePins` 和边界布局。
- 改动 capture、nested composite、多 inflow/outflow、sparse input、layout 或 graph metadata 时，
  先建立 focused 回归，不能顺手扩大行为范围。
- 真实 GIA、自动回归、生成候选、注入和游戏编辑器验证必须分别记录。

## 验证

- 运行最小 Stage 3 / composite 回归；生产 TypeScript 改动后运行 `npm run build` 和 `git diff --check`。
- 共享 Composite 行为变动时，补跑 nested、capture、sparse、root/impl parity 等受影响回归；未运行项明确说明。

## 不要做

- 不要猜测 mapId、nodeGraphId、游戏状态或真实 GIA 规律。
- 不要展开 nested composite、破坏 capture 路由，或未经确认注入/覆盖游戏文件。
