# 复盘：悬空 exec 节点检测器 + 2×2/3×3 魔方修复闭环（2026-08-21）

> 范围：从「3×3 自动打乱不自动（Bug 2）」出发 → 方案 A 悬空 exec 静态检测器（GSTS-DANGLING-EXEC-NODE）→ 2×2 三处修复并注入实测通过 → 3×3 修复落地并注入
> 视角：同一 DSL 雷区（`f.node()` detached 注册）在 2×2/3×3 两个项目同源复现，串成谱系；验证链分层证据是主线方法论
> 证据：源码（`examples/rubik-2x2/src/game.ts`、`examples/rubik-3x3/src/composites/flow.ts`、`src/compiler/ir_lint_dangling_exec.ts`、`src/compiler/ir_to_gia_transform/shared.ts`）+ 真实 GIL 读图（2×2 map 1073741882、3×3 map 1073741899）+ 编译期检测器输出
> 状态：2×2 用户游戏实测通过（无回归）；3×3 已注入待用户实测；检测器「重复入边」增强与 check-gil-composite-refs 信号误报已登记 open-items

---

## 一、错误谱系总览：同一 DSL 语义，多个悬空点

**共同症状**：编译、注入全部成功，但游戏内行为缺失（队列不写入 / 打乱不自动播放 / 时序表不更新）。
**共同根因**：`f.node()` 是 **detached 注册**（不自动串接当前 tail，入口/出口悬空），而 `f.registerExecNode()` 是 **auto-chain**（自动串接当前 tail）。

| # | 项目 | 根因层 | 具体错误 | 修复 | 状态 |
|---|---|---|---|---|---|
| 1 | 3×3 | DSL 用法 | `flow.ts` flowScramble 437-442：循环后 autoMode/qIdx/lock 三 set 用 `f.node()`，入口悬空 → 打乱不自动播放 | 改 `f.registerExecNode()` 三连（从 Loop Complete 出口 auto-chain） | 已修 |
| 2 | 2×2 | DSL 用法 | `gstsScramble` 分支内 setQ/setM 用 `f.node()` → 分支出口悬空，queue 写不进 | 改 `f.registerExecNode()` + connect | 已修+实测通过 |
| 3 | 2×2 | DSL 用法 | `gstsScramble` 尾部 autoMode/qIdx/lock 用 `f.node()` → 入口悬空（与 #1 同源） | 改 `f.registerExecNode()` 三连 | 已修+实测通过 |
| 4 | 2×2 | DSL 用法 | `gstsDoWhole` 8 个 set_list_value 用 `f.node()` → times 链悬空，start_timer 读旧值 | t0 改 `registerExecNode` + connect 链 + start_timer 改 `f.node` + 显式 connect | 已修+实测通过 |
| 5 | 工具 | 检测器误报面 | 检测器只能抓「有出边无入边」，抓不到 auto-chain 重复入边 | 登记增强项（O-2026-08-21-NN） | 待做 |
| 6 | 工具 | 工具缺陷 | `check-gil-composite-refs --incoming` 把信号定义单元（which=12/14，class=10001）误报为「复合缺失」 | 登记修复项（O-2026-08-21-NN） | 待做 |

**关键认识**：#2/#3/#4 是 #1（3×3 Bug 2）的**同族复现**——检测器建立后对 2×2 一跑就命中 4 个真悬空，全部与 3×3 同源（`f.node()` detached）。这验证了「一次修一组」的扩展检查价值：3×3 修完不扫一遍其它项目，2×2 会带着同样的雷继续跑。

---

## 二、最近一次错误的完整调查链（2×2 修复闭环，含双入边规避）

1. **现象**：用户提出 2×2「整面转/自动播放」行为可疑（与 3×3 Bug 2 同源症状）。
2. **静态检出**：检测器（方案 A，`ir_lint_dangling_exec.ts`）对 `examples/rubik-2x2/dist/src/game.json` 报 4 个悬空 exec 节点——两分支 setQ/setM（无入边）、尾部三 set（无入边）、`gstsDoWhole` times 链（无入边）。
3. **修复**（`examples/rubik-2x2/src/game.ts`，3 处）：
   - 分支内 setQ/setM → `f.registerExecNode()` + `connect`（挂上 double_branch 分支出口）；
   - 尾部三 set → 连续 `f.registerExecNode()`（finiteLoop 无 return 时 Loop Complete 已是 tail，auto-chain 从 Loop Complete 串联）；
   - `gstsDoWhole` t0 → `f.registerExecNode()`（接入 curMove 后 tail），t1..t7 保持 `f.node()` + 7 个 connect 显式链，**start_timer 用 `f.node()` + `connect(t7, 0, startTimer, 0)`**。
4. **双入边隐患规避（本轮最重要的实现层教训）**：若 start_timer 用 `f.registerExecNode()`，它会从当前 tail（t0，因 t0 已是 registerExecNode 接入）再 auto-chain 一条边 → 与 `connect(t7→startTimer)` 形成**两条入边**（同一节点执行两次，日志特征：Start Timer 同节点两帧）。所以「registerExecNode 之后的首个普通 exec 要用 f.node + 显式 connect」。
5. **验证链（分层证据）**：编译（`gsts --noinject`）→ 检测器 0 悬空 PASS → 注入（`gsts`，ok 1 fail 0）→ `maps:resync` → **真实 GIL 读图核验**（`explain-gil-node-graph`：Loop Complete → autoMode → qIdx → lock → gsts_do_move ✓；curMove → t0..t7 → Start Timer ✓）→ 用户游戏实测通过。

---

## 三、为什么反复出问题——系统性根因（3 条）

1. **`f.node()` vs `f.registerExecNode()` 语义差异是 DSL 层最高频雷区**：detached vs auto-chain 的差异不体现在编译报错里，只有「行为缺失」或「读图」才暴露。分支/循环回调体内第一个 exec 节点**必须** `registerExecNode`；`f.node` 之后接 `registerExecNode` 有 auto-chain 重复入边隐患。→ 已沉淀进 `dsl-nodegraph-development` 技能（2026-08-21 实证）。
2. **静态检测器覆盖不到「重复入边/断链语义」**：检测器（有出边无入边）能抓悬空，但抓不到 auto-chain 造成的重复入边（同一节点两条 InFlow）。编译期不报错 → 必须读真实 GIL 的 `flow`/`boundary` 才能发现。验证链中「读图核验」是不可省略的一层（AGENTS.md 已强制）。
3. **「编译通过 ≠ 注入正确 ≠ 游戏行为正确」的三层鸿沟**：本轮每次交付都走完整闭环（编译→检测→注入→读图→用户实测），2×2 一次通过、用户实测无回归。省掉读图层是历史上多轮返工的根因（对照 08-16 信号五连错）。

---

## 四、流程与方法论教训

- **同族扩展有效**：检测器从 3×3 建立 → 扫 2×2 命中 4 个真悬空，证明「修完一个先扫同族」能提前止损。
- **写 DSL 前想清楚 auto-chain 语义**：registerExecNode 会从当前 tail 自动串接，若同时显式 connect 会重复入边。修改前先在注释里写明「为什么这里用 f.node / registerExecNode」（本轮 3 处修复均带 2026-08-21 注释，后续维护可直接读意图）。
- **edit 工具纪律**：先 read 再 edit（本轮第一次 edit 因未先读被拒）。
- **被拒后立即行动**：复盘中途路由器提示「只分析不产出」→ 停止盘点，直接执行修复闭环，避免状态盘点替代实际交付。
- **工具参数核对**：`maps:resync` 参数是 `--map-id`（不是 `--map`），CLI 自检报错后快速修正，未造成影响。

---

## 五、风险探索与未闭合项

1. **检测器增强（重复入边检测）**：同一 exec 节点在 `flow` 中多条 InFlow 是 auto-chain + connect 冲突的信号（编译期 IR 可查 edges 中同一 target 的多条 exec 边）。→ O-2026-08-21-NN。
2. **check-gil-composite-refs 信号单元误报**：`--incoming` 对比把 which=12（监听信号）/14（发送信号/向服务器发送信号）定义单元收进 incomingIds，与复合 impl 区间对比 → 误报「复合缺失」。修复：过滤 class=10001（或仅收集 class=23 的复合 def）。→ O-2026-08-21-NN。
3. **2×2 `gstsSolve`（自动复原）仍是占位**：未实装求解器，接口已预留（queue + qLen → 队列播放）。
4. **3×3 待用户实测**：已注入 1073741899.gil，待用户确认自动打乱/手动/胜利判定无回归。

---

## 六、产出清单

- 修复：`examples/rubik-2x2/src/game.ts` 3 处（2×2 已实测通过）；3×3 修复已注入待实测
- 检测器：`src/compiler/ir_lint_dangling_exec.ts` + `shared.ts` 挂载点（GSTS-DANGLING-EXEC-NODE，warning 级，--strict-warnings/--warnings-json）
- 技能迭代：`dsl-nodegraph-development`（exec 链铁律）、`gil-node-graph-reading`（执行边健康检查 + 多图核验 + check 工具误报说明）
- 文档：本文档 + `docs/maintenance/open-items.md` 登记 2 项
- 初始文件同步：`AGENTS.md`（技能路由表补 miliastra-knowledge 等 + 本轮纪律核对）、`CLAUDE.md`（补 gsts 悬空检测 CLI 选项与读图核验指向）
- 未提交（按 AGENTS.md 不擅自 commit；用户指示后分批提交）
