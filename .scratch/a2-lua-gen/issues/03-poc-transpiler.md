# 03 PoC 转换器原型

## What to build

最小可行原型（`research/a2-lua-gen/poc/`，不进主包不进 src/）：受限 TS 子集 → .lua。范围刻意最小：生命周期函数、变量声明、算术/比较/布尔、if/for/while、print、若干 game API 调用、Tween 一个样例。证明映射设计可落地，不追求 API 全覆盖。

实现方式按 02 票设计定（候选：TypeScript Compiler API 遍历 AST 手写 emit / 现有管线 IR 扩展）。

## Blocked by

02（按设计实现）

## Status

⬜

## 验收项

- [ ] `poc/` 转换器可执行：输入 .ts 样例，输出 .lua（含 ScriptMapping 挂载元信息草案）
- [ ] 至少 2 个样例：①补间动画（game.Tween）②控件树遍历+条件更新（OnUpdate 帧逻辑）
- [ ] 输出 Lua 通过 Lua 语法检查（luac -p 或模拟器 lua-runtime 解析）
- [ ] 样例代码量与手写 Lua 的对比记录（衡量生成器的实际价值）
