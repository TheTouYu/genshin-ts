# `src/runtime/`：DSL 运行时与 IR 生产

## 适用范围

这里运行编译后的 `.gs.ts`，收集调用记录并生成 IR；同时提供 `g.server`、`f.*`、值类型、变量、Composite 和信号 DSL。

## 修改前

- 先确认改动影响 DSL 表面、值类型、变量、Composite capture、信号、IR 构建还是运行时上下文。
- 涉及 IR 或 Composite 时，检查 Stage 1、Stage 3、现有 focused tests 和对应架构文档；不要只根据单层行为判断影响。

## 修改规则

- `IR.d.ts` 是 Stage 1/2 与 Stage 3 的类型契约。修改它时同步检查所有生产者、消费者、序列化形状和回归。
- 保持每个 `g.server(...)` 的 registry 隔离以及 `gsts.f` 的惰性、按上下文绑定语义。
- 新增值类型时同步更新三组类型映射，并检查 literal、参数、返回值和变量路径。
- 修改 Composite 时保留 nested composite、capture 路由、typed physical pin 和 pin index 契约；
  不要把 Composite 展开成普通节点。
- 运行时可达代码仍要遵守用户 DSL 限制：避免 JSON、Promise、async/await 和未建模副作用。

## 验证

- 运行相关 runtime/composite fixture；跨阶段 IR 行为变动时补跑 Stage 3 focused regression。
- 改动 TypeScript 后运行 `npm run build`；最后运行 `git diff --check`。

## 不要做

- 不要把业务玩法逻辑塞进运行时。
- 不要为了局部输出改变全局 registry、IR 或 capture 语义而缺少回归和证据。
