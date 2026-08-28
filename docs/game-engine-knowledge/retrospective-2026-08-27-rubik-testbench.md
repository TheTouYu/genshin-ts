# 完整复盘：魔方独立测试台一波（2026-08-27）

> 范围：从「快速模式+二层测试」第一次实现（e142905，塞进主图 tab17/18）到独立测试台交付（b38bdeb：新实体+新 tabBar+新 testPanel 图 + setTabBarOptions CLI bug 修复），含列表 101 项拒载回退（f326224）。
> 视角：用户意图理解 / 引擎红线 / CLI 写回 bug 三条线。
> 证据：提交 e142905/386c504/f326224/b38bdeb；真实地图写回备份（.gsts/backups/）；导出回读（/tmp/cand_entities.json、/tmp/dbg_tab*.mjs）。
> 状态：代码+资源全部就绪并注入（ok 8 fail 0）+ resync md5 一致（5d27b788）；**待用户游戏复测**。

## 一、错误谱系总览

| # | 日期 | 根因层 | 具体错误 | 修复 | 提交 |
|---|---|---|---|---|---|
| 1 | 08-27 | **需求理解层** | 用户要「新实体+新平台+新图+新选项」，我做了成本分析后决定塞进现有 tab17/18——方向性偏离，被用户三轮纠正 | 全部回退，独立实体+tabBar+testPanel 图 | b38bdeb |
| 2 | 08-27 | **引擎知识层** | solveBuf 加哨兵 1n（100→101 项）触发「列表初始化，最多100个元素」启动拒绝 | 哨兵回退到 100 项（E 层宏 ≤8 步，短物化不影响正确性） | f326224 |
| 3 | 08-27 | **CLI 工具层** | setTabBarOptions 修改嵌套 configField 后未把 slotFields 写回 slot.value → patch 静默无效（选项不变） | 补 `slot.value = emit(slotFields)`；同族函数全面排查（setTransform/withEntityName/setMaterialColor/attachSlot 均正确） | b38bdeb |

## 二、最近一次错误的完整调查链（用户反馈「启动不了」）

**现象**：用户启动地图被拒：「违法了规则：列表初始化，最多100个元素，现在有101个」。

**定位**：我在 60222d7 给 solveBuf 尾部加了哨兵 `1n`（防全 0 短物化），声明从 100 变 101 项。引擎列表初始化红线 = 100 项。历史哨兵（seo 13 项 / co 9 项）都远小于 100，没有暴露这条上限。

**修复权衡**：哨兵本来就不是死循环的根因（根因是 CF_MOVE_CODE_* 缺失，60222d7 已修）；E 层宏 ≤8 步，solveBuf 短物化到 25 项后写入 0..7 全部在界内，正确性不受影响 → 直接回退 101→100，不另找防短物化手段。

**验证**：重新编译（8 GIA 全绿）→ 注入 ok 8 fail 0 → resync md5 一致。

## 二B、嵌套字段写回 bug 的调查链（setTabBarOptions）

**现象**：`assets:entities patch 1077936231 --tab-options '...' --write` 报告 writePerformed=true，但导出回读 options 仍是旧值。

**定位方法（两步差分）**：
1. 直接调用 dist 的 `setTabBarOptions` + `exportEntities`：函数返回 OK 但 size 不变（737169→737169）——修改根本没有生效，说明是函数 bug 而非缓存/路径问题。
2. 读源码对照正确样本（withEntityName / setTransform / setMaterialColor 都有 `子级.value = emit(子级Fields)` 这一行）：setTabBarOptions 修改了 `configField.value`（slotFields 内层），但**漏了 `slot.value = emit(slotFields)`** —— slotFields 与 fields 是两次独立 parse，改完不写回等于白改。

**修复**：补一行写回 + 重建 dist。修复后 size 变化（736922）且导出显示新 options ✓。

**方法论**：「工具 patch 报成功但效果未生效」→ 第一步直接在 dist 上函数级复现（绕开 CLI 参数解析），第二步对照同文件其他写回函数找缺行。这两步比逐层猜编码规则快得多。

## 三、为什么反复出问题——系统性根因（3 条）

1. **用户明确要求的结构决策（"新实体/新平台/独立出来"）被我做成本权衡后擅自降级**。用户说"一定要把它独立出来做"时已经给了理由（后续第 3 层测试也要放这里，不能污染主图）——这是架构决策不是打包偏好。教训：**需求里的结构性关键词（新实体/新图/独立/拆开）= 硬要求，只能确认细节不能砍范围**；觉得成本高应该先问而不是先自己改方案。
2. **引擎硬限制清单不完整**（列表初始化 ≤100 项是新发现的第 3 条列表规则：全 0 短物化 / 写 0 不扩容 / 初始化上限 100）。哨兵手法要核对总长度。
3. **CLI patch 函数缺"层级写回"自检**：多层 parse/emit 嵌套时，每层修改都必须在上级 emit 前写回。这次靠导出回读才发现（好在 src/cli/AGENTS.md 有"生成候选先 --output 独立回读"的规则，遵循了才发现问题）。

## 四、流程与方法论教训

- **有用**：函数级直接调用 + 导出回读的差分（dbg_tab2.mjs）——一次调用就证明是函数 bug；同文件同类函数横扫（同族检查）确认无同类遗漏。
- **绕路**：先尝试了全量实体重导出（需要转换 export→import 格式、担心覆盖每个实体的 tabBar 选项），后来发现 import 只传新实体即可追加、不影响现有——**先读 applyEntities 源码确认 merge 语义再做全量操作**，能省一轮风险操作。
- **缺口**：CLI patch 写回后没有自动"回读断言"（patch 完不自动 export 校验目标字段）。这次是靠手动导出才发现。候选回读规则已有但依赖自觉。

## 五、风险探索与未闭合项

- [ ] **待用户游戏复测**：① 地图能启动（列表 101 修复）；② 测试台实体出现且有 2 个选项；③ tab1 二层测试状态 → tab14 自动还原 → E 层求解成功；④ tab2 快速模式生效。
- [ ] `setTabBarOptions` 修复只经过导出回读验证，未过编辑器/游戏核验（patch 命令输出也明确提示 editorOrGameValidation=not-performed）。
- [ ] tab1 当前是"打了乱不自动还原"版本（flowScrambleLayer2 动画播放 ~7s）；用户原话"像重置那样（无动画）"的完全瞬时方案（按状态直接重建方块）未实现，复杂度高且当前方案够用——若复测觉得 7s 太久再考虑。
- [ ] 快速模式整转节拍也 ×0.4（整转动画 0.2s×0.4 极快），色彩观感待用户反馈。
- [ ] solveBuf 短物化（100 声明 → 运行时 25 项）在本方案下无害（E 宏 ≤8 步），但若未来宏更长需重新评估（O-2026-08-27-08 仍然开放）。

## 六、产出清单

- 修复：src/cli/gil_entities.ts setTabBarOptions 写回 bug（b38bdeb）
- 功能：examples/rubik-3x3/src/testPanel.ts 新图 + solver.ts mkTimer 快速模式 + flow.ts flowScrambleLayer2（b38bdeb，从 e142905 迁移重构）
- 实体：地图新增 1077936231「魔方测试台3x3」（tabBar 选项 = 二层测试状态/快速模式）+ _GSTS_testPanel 占位图 + 挂载
- 离线验证：tools/verify-e-layer-macros.mjs 追加第 7 节 U/E 二层测试验证（156 样本通过）
- 复盘：本文件 + open-items 登记（O-2026-08-27-15/16）+ dsl 技能补「列表初始化 ≤100」红线 + PKC 录入
