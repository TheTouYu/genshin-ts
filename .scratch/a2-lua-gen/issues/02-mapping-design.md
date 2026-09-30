# 02 TS→Lua 映射设计

## What to build

设计文档：genshin-ts 管线如何平行移植到脚本面——TS 强类型写客户端玩法，编译产出 .lua。回答三个核心问题：

1. **管线形态**：复用现有 TS→GS→IR→GIA 的哪一层？（候选：IR→Lua 生成器 vs 全新轻量 TS→Lua 直转；评估与节点图管线共享 DSL 约束/类型面的收益 vs 耦合成本）
2. **入口语法**：客户端脚本的生命周期如何从 TS 语法映射（候选：`g.client({...})` 声明式 vs 直接导出 `onUpdate(dt)` 函数式）
3. **类型面**：.d.ts 形态定义 game/script/控件 API（基于 01 票清单）；三分法如何类型化（game 全局对象 / script this 绑定 / 控件实例类）

## Blocked by

01（API 面清单是类型面设计输入）

## Status

⬜

## 验收项

- [ ] `research/a2-lua-gen/DESIGN.md`：管线形态决策+备选淘汰理由
- [ ] 入口语法设计（含与 `g.server().on()` 心智一致性的论证）
- [ ] 类型面设计草案（.d.ts 片段样例，覆盖 game.Tween/script:GetParam/至少一个控件类）
- [ ] DSL 约束继承表：现有约束（无 Promise/递归等）哪些适用于 Lua 面、哪些需要新增（如 Lua 沙箱裁剪清单）
- [ ] 风险登记：官方 Lua 环境演进风险/GIA script wire 依赖/与节点图能力的边界重叠
