# 19 — 20005 道具节点图创建：补齐"样本缺口"

**What to build:** `assets:node-graphs create --type 20005`（道具节点图）能建出空图并被注入器正确识别。
GAP-03：`20003 状态 / 20004 ClassNode / 20005 ItemNode` 三类**被 fail closed**。

**Blocked by:** 无 —— **可立即开工**（这是四个候选里成本最低的一个）。

**Status:** ⬜ 待开工

---

## 为什么判断是"样本缺口"而非"设计缺口"（三重证据已在位）

| 层面 | 位置 | 现状 |
|---|---|---|
| DSL 类型声明 | `src/runtime/IR.d.ts:37` | `ServerGraphSubType = 'entity' \| 'status' \| 'class' \| 'item'` —— **四种都已声明** |
| 注入类型表 | `src/injector/folder.ts:5-15` | `DEFAULT_GRAPH_TYPE_VALUES` 含 `[20003,2300] [20004,2400] [20005,4300]` |
| CLI 建图 | `src/cli/assets_node_graphs.ts:143` | 注释「未采样自动节点结构的类型：20003 状态 / 20004 ClassNode / 20005 ItemNode → **fail closed**」；`:155` 抛错；`:230-231` 帮助文本不列这三类 |
| 技能类可参照 | 同文件 `:521-526` | 技能类自动节点模式 = `节点图开始 200042/2001 + contextDeclaration f8={1:6}` —— **同族模式可套** |

官方指南 `docs/ui-tutorial/official-guide-concepts.md:6392-6429` 明载四类服务端图（实体/状态/职业/道具）。
按 AGENTS.md「官方文档功能=候选可支持面」，**不得以"不支持"断言跳过**。

## 验收项

- [ ] 先做**最小差分取证**：让用户/编辑器建一张道具节点图，与不建时差分，读出自定义节点结构
      （不静态推断——`editor-incremental-gia-investigator` 技能口径）
- [ ] 把读出的结构落成 `GRAPH_TYPES` 的一项（照技能类 `200042/2001 + f8` 模式）
- [ ] `assets:node-graphs create --type 20005` 能建出空图，回读图类型 = 20005
- [ ] 解除 `:143` 对 20005 的 fail closed（**20003/20004 另建票，不合并**）
- [ ] 帮助文本 `:230-231` 同步
- [ ] 在**夹具副本**上验证整链（建图 → 注入 → 回读），非破坏
- [ ] 收轮三件套

## 备注

三类图的自动节点结构**可能各不相同**，本票只做 20005。若差分发现三者同构，再合并成一票处理 20003/20004。
