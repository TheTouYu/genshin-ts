# T04 · 六组重复主题归一 + 打通「CLI 通道 ↔ 插件技能通道」

**What to build**：同一知识不再写六遍；两套"外部 Lua 脚本"体系互相知道对方存在。

- Blocked by：无
- Status：✅ 2026-10-17

## 六组重复（行号见侦察报告）
① 节点预算 2000（5 技能 6 处）② 编辑器重载后保存/写回后变更消失（6 处）③ 模板/实例（4 处）④ **外部 Lua（插件技能 ↔ 仓库 `assets:scripts`，两套体系互不引用）** ⑤ 三层联动（root4 f8/root8 f7/root5 f7）⑥ 写回安全门

## 验收
- [x] 每组指定**唯一权威处**（建议：②⑥→`genshin-ts-asset-operations`；①→`dsl-nodegraph-development`；⑤→`genshin-ts-asset-operations`），其余位置改成一行引用
- [x] ④ 双向补引用：仓库侧技能写明"插件/模拟器通道也讲外部 Lua，字段与优先级见 …"；插件技能侧**只在我们 fork 里**补一句指向仓库 CLI（不扩生态）
- [x] 验收：`grep -c` 每组关键词在"权威处"≥1、在"引用处"是链接/指针而非正文
