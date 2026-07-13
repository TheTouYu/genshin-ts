# `src/compiler/` 三阶段编译管线

## 适用范围

这里负责 TS → `.gs.ts` → IR JSON → `.gia` 的三阶段编译。进入 Stage 1 或 Stage 3 子目录后，必须继续读取其中的规则。

## 修改前

- 先确认问题属于哪个阶段，以及输入、输出和跨阶段契约；不要通过跨阶段临时耦合绕过问题。
- 影响范围不清时，先用 codebase-memory 定位入口和调用链，再读取实际源码与 focused tests。
- 涉及 Composite、IR 或 GIA 时，先读取最小相关架构文档；真实 GIA 结论不能只依赖 vendor 或自动生成结果。

## 修改规则

- 保持产物后缀和阶段责任：Stage 1 只生成 `.gs.ts`，Stage 2 生成 IR，Stage 3 消费 IR 并生成 `.gia`。
- `gsts_config.ts` 的公开配置字段需要完整中英文 JSDoc，并保持 loader、CLI、模板和测试配置一致。
- 进程间阶段执行应保持隔离，不依赖共享可变状态。
- IR 是唯一的类型化跨阶段交接；修改 IR 形状时检查生产者、消费者、合并逻辑和回归。

## 验证

- 优先运行受影响阶段的最小命令或测试；生产 TypeScript 改动后运行 `npm run build`。
- 修改共享管线时扩大到相关 end-to-end 回归；最后运行 `git diff --check`。

## 不要做

- 不要手改 definitions 或 vendor 文件，不要破坏 `.gs.ts` / `.json` / `.gia` 产物约定。
- 不要把编译成功、GIA 生成成功或注入成功误报为游戏行为验证。
