# 历史差分复用（History Evidence Reuse）

从既有实验快照与 manifest 结论中找证据，验证新规则、判定"从未出现"、重建字段演变史。
2026-08-08 case6/case7 提炼：pinIndex 分配器矛盾（89 vs 51）靠扫描 96 个历史快照闭合。

## 何时用（与"先查已闭合骨架"的区别）

- 常规新操作：先读模块 references 的已闭合骨架，不需要历史扫描。
- 新观察与历史结论**冲突**（如"删除不释放" vs 本轮回收 51）→ 用历史快照找两边的中间态。
- 需要判定"某号从未被分配"（NEVER SEEN）→ 区分真空闲与墓碑（被整体删除 def 占用的号）。
- 需要重建某 def/字段的完整演变史（何时加、何时删、删的方式）→ 时间线扫描。
- 需要把局部结论放到更大样本集验证（如分配器规律 2 样本 → 4 样本）→ 全快照出现史。

## 资产地图（connection-v1 实验）

- **结论索引**：`notes/manifest.md`——顶部恢复块 = 当前状态/下一轮；各 case 段 = 每轮
  唯一变化、闭合规则、raw 证据、SHA-256。先读这里，多数问题不用碰原始快照。
- **原始快照**：`experiments/<case>/raw/{before,after}.gil`（96+ 个，按 vN 编号链
  v22→v67，before=上一轮 after，链上每个文件 hash 可串联校验）。
- **差分产物**：`experiments/<case>/coordinator/root-wire-diff.json`（L1 全 root 对比）。
- **权威结论**：`docs/game-engine-knowledge/composite-nodes.md`（已闭合规则，历史 case
  只作核对证据，不覆盖当前结论）。

## 标准流程

1. **定位**：manifest 恢复块 → 相关 case 段；只读目标字段（如 pinIndex）涉及的参数/节点。
2. **时间线**（某 def 字段演变）：
   ```bash
   npx tsx .../scripts/scan-history-pinindex.ts --timeline <exp-root> <defIdx>
   # 输出 vN [defIdx] name: pinIndex,...（按 v 排序去重，直接看加/删/改）
   ```
3. **出现史**（某号是否曾分配）：
   ```bash
   npx tsx .../scripts/scan-history-pinindex.ts --history <exp-root> 51,52,88
   # NEVER SEEN = 该号从未出现在任何现存 def；hits 列表含首个/末次出现位置
   ```
4. **单文件全景**（当前全局分布与缺失）：
   ```bash
   npx tsx .../scripts/scan-history-pinindex.ts <gil>
   # max/count/missing in 1..max；missing 候选 = 墓碑（曾分配后整体删除）或真空闲
   ```
5. **交叉验证**：把时间线首末态与当前差分对齐（如 v61 取 89 vs v66 取 51 的中间态
   = case4/5 手动删除），形成可证伪假说。
6. **回写**：结论更新到 manifest 恢复块 + 权威文档；假说未验证前标 INSUFFICIENT。

## 已闭合案例（可作模式参考）

- **pinIndex 分配器**（case6/case7）：timeline 重建 def 58 全史
  （47→48→49→51→52→53/54→55→56→57/58→59→60→89，删 52/51/57/58/60/89），
  history 判定 9,22,38,39,43,44,45,46,67,72,81,82,88 = NEVER SEEN（其他 def 墓碑），
  对照 case2（无手动删除史取 89=单调）与 case6/7（手动删除后取 51/52=回收池最小）
  → 4 样本 CONFIRMED。
- **v42 "删除不释放"旧结论**：被 case6 推翻（删 60/89 后 51 复用）；历史结论与新证据
  冲突时以相邻差分链为准，旧结论在文档中标注更新时间而非静默删除。

## 边界与教训

- 历史快照只证明"当时存在"，不证明"当时被分配"：NEVER SEEN 可能是从未分配，也可能是
  被整体删除的 def 占用的号（墓碑）。判定墓碑需结合删除史（时间线中该号的消失方式）。
- 恢复块/历史 case 段的"当前状态"可能滞后于快照（2026-08-08 case5 教训：恢复块 42 节点
  是旧状态误记）；跨轮归因前先对锁定快照实测重验。
- 不要用历史结论替代本轮差分：历史只提供假说与背景，规则闭合仍以相邻快照单变化为准。
- 一次性 /tmp 扫描脚本在模式重复三轮后必须资产化（本模块的 scan-history-pinindex.ts
  即由 2026-08-08 三个 /tmp 脚本提炼）；资产不得内置实时路径/一次性 ID。
