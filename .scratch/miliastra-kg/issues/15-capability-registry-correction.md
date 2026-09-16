# 15 — 能力登记纠错：「组件新增 🔴」是错的，且 CLI 文档的组件清单已过期

**What to build:** 把我在这轮**错误断言**的能力缺口从所有登记处纠正过来，避免它继续污染后续决策——
「实体通用组件无法新增（`grep addComponent` = 0 命中）」这个结论**是错的**，真正的组件通道是
`assets:static-assemblies` 的 `components:` 配置，且**已支持 7 种组件含选项卡（类型码 17）**。

**Blocked by:** None — 可立即开始（不碰地图，纯文档纠错）。

**Status:** ⬜ 待开工

---

## 错在哪（根因，值得复盘）

| 项 | 我的做法 | 错因 |
|---|---|---|
| 搜命令 | `grep -rn "addComponent\|add-component" src/cli/*.ts` = 0 → 断言 🔴 | **grep 了一个根本不存在的函数名**。真实入口是配置项 `components:`，不是命令名 |
| 没做的检查 | 读 `docs/docs/zh/doc/cli/config.md` | **文档里明写** `components: [{type:'followMotion',...}]`；我一次都没打开过这份 CLI 配置文档 |
| 违反的纪律 | `AGENTS.md`「**官方文档功能=候选可支持面**……禁止以'不支持'直接断言跳过」 | 我把"我没搜到"当成了"不存在" |

**一句话教训**：**「grep 不到」≠「不存在」——先查文档面（`docs/docs/*/doc/cli/`）再查代码面。**

## 实际能力（已核实，作为纠正的依据）

`src/cli/gil_static_assemblies.ts:487 componentSnapshot()` 支持 **7 种**组件：

| `type` | 类型码 | 备注 |
|---|---|---|
| `followMotion` (preset `fullFollow`) | 9 | 有真实 GIL + 自动回归 + 用户游戏验证 |
| `basicMotion` (preset `default`) | 4 | 9B 槽 `080410017203c81f01`；2026-08-13 修正过旧误用 |
| `nameplate` (preset `default`) | 27 | 带 `content` / `range` |
| `textBubble` (preset `default`) | 28 | —— |
| `lightSource` (preset `default`) | 38 | 带 `radius` / `intensity` |
| `hitDetection` (preset `default`) | 12 | —— |
| **`tabBar`** | **17** | 带 `regionName` / `options` / `regionType` / `regionSize` / `regionRadius` / `regionCenter` |

配置位置：`staticAssemblies[].components` 与 `staticPrefabUpdates[].components`（`src/compiler/gsts_config.ts:475/531`）。

## 要纠正的文件

- [ ] `research/千星知识图谱/slices/_CAPABILITY.md` —— D2 节「实体通用组件新增 🔴」改为 ✅（写明配置面与 7 种类型）
- [ ] `docs/knowledge-graph/ATOMIC-RULES.md:197` —— 表格行「实体通用组件新增 | 官方编辑器可加 | `grep addComponent` = 0 | 增强空间」整行重写
- [ ] `docs/knowledge-graph/reproduction/T12-design.md:114` —— C3 行「实体通用组件新增 | 🔴 | 同上（无 `addComponent`）」
- [ ] `docs/knowledge-graph/d/d2a-模型与实体资产.md` —— 检查是否也复述了该错误结论
- [ ] `docs/docs/zh/doc/cli/config.md` + `docs/docs/en/doc/cli/config.md` —— **文档过期**：原文写「当前支持两个保守快照」，
      实际已是 7 种（含 tabBar）。补齐清单与 schema
- [ ] 全库扫一遍，确认无其它地方复述「无 addComponent」

## 验收项

- [ ] 上列文件全部纠正，每处写明**纠正依据**（`src/cli/gil_static_assemblies.ts:487+` 与 `gsts_config.ts:286/330-342`）
- [ ] 纠正后全文 grep `addComponent` → 只应剩「历史上曾错误断言」的复盘说明，不留陈述性错误
- [ ] **纪律回灌**：把「grep 不到 ≠ 不存在；先查 `docs/docs/*/doc/cli/` 再查代码」写进对应技能/AGENTS.md 的**最小规则文件**
- [ ] 复盘记录：为什么这条错误能一路传进 `_CAPABILITY.md` / `ATOMIC-RULES.md` / 设计书**三处**都没被拦住
- [ ] 收轮三件套

## 备注

本票**不动任何地图**，纯文档与登记面纠错，可无条件先做。
它的价值不在"改几个字"，而在**堵住一条会反复复发的误判路径**——错误的能力登记会让后续所有方案绕远路。
