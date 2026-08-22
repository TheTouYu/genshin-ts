# `src/compiler/gs_to_ir_json_transform/`：Stage 2 `.gs.ts` → IR JSON

## 适用范围

这里把 Stage 1 生成的 `.gs.ts` 调用记录转换为类型化 IR JSON。它是 TS 语法与 GIA 编码之间的中间层，输入是 `g.server`/`gstsServer*` 的运行时调用记录，输出消费方是 Stage 3。

## 关键文件

- `runner.ts`：转换入口/执行环境。
- `index.ts`：对外导出与管线接线。

## 修改前

- 先确认问题属于 IR 形状、变量/引用解析、Composite/timer 元数据还是执行上下文。
- 修改 IR 输出时同步检查 `src/runtime/IR.d.ts`、Stage 3 消费者和相关 focused tests；不要只在这一层改。

## 修改规则

- 保持阶段隔离：本层只消费 `.gs.ts` 运行时记录并产出 IR，不直接生成 `.gia`。
- IR 字段形状以 `src/runtime/IR.d.ts` 为契约；不要私自增加 Stage 3 不消费的旁路字段。
- timer/Composite 元数据必须完整进入 IR，否则 Stage 1 到 Stage 3 会丢语义。

## 验证

- 运行对应 `.gs.ts` → IR 的 focused 测试；涉及共享 IR 形状时补跑 Stage 3 回归。

## 不要做

- 不要绕过 IR 契约直接向 Stage 3 传递非类型化数据。
- 不要把编译成功当作游戏行为验证。
