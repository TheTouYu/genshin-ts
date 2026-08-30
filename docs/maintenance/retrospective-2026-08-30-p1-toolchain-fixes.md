# 完整复盘：P1 编译器/工具缺陷处理（2026-08-30）

> 范围：2026-08-30 会话 P1 组六项（O-22-1 / O-21-4 / O-21-5 / O-27-02 / O-28-09 / O-28-10⑤）
> 视角：工具/编译器改进中的「范围事故」与「约束未先读」谱系
> 证据：提交 `5c6e94a`（enum 复合输入）/ `89ba917`（--incoming 误报）/ `edfcac3`（重复入边检测）/
>   `0ec799b`（复合输出复用）/ `ae481ef`（gia_log_flow）/ `829cd1f`+`4c242c5`（PKC 阻塞与账本）
> 状态：5 项落地（3 DONE + 2 部分），O-28-10⑤ 被 PKC 工具约束阻塞（已登记 + 修复任务提示词已产出）

## 一、错误谱系总览

| # | 层 | 具体错误 | 根因 | 处理 | 提交 |
|---|---|---|---|---|---|
| 1 | 测试 | enum 回归断言找错位置（nodes 里无 enumerations_equal） | 对 IR 结构不熟（复合 impl 在 compositeDefs.implNodes） | 探针探查后改断言 | 5c6e94a |
| 2 | 工具 | 按 O-21-4 描述（class=23 过滤）实现失败 | **open-items 描述与实测结构不符**（class 全 10001、which 12/14 混合） | 实测 which/class/id 三字段后改用 id 区间 | 89ba917 |
| 3 | 工具 | 修复中发现 2000000000+ 默认命名空间 def 同族误报 | 同族扩展（football GIA 4 个） | 一并修（mapIds 扩展） | 89ba917 |
| 4 | 检测器 | 重复入边首版 59 个测试图告警（噪音） | **分支 join 未豁免**（double_branch 两分支汇聚合法） | 实测校准：分支 join 豁免（59→41）；剩余形态无法 IR 层区分，保留 warning | edfcac3 |
| 5 | TS | 测试文件 TS1005（箭头函数表达式后紧跟顶层 `{`） | TS 解析器将 `{` 误判为函数体（最小实验确认） | 改函数声明规避 | edfcac3 |
| 6 | PKC | `--all-stale` 误拉全库 130 条 ref（operation 1→131） | **工具批量参数范围未先读** | abandon 计划 | 829cd1f |
| 7 | PKC | 死锁三次失败尝试（revise→add 拒 / add 前置 MISSING / refresh 无目标） | **未先读上游源码/测试**（约束在 semantic_plan.py 580/1055 行有实现与测试锚点） | 读上游定位死锁闭环 → 登记 + 修复任务提示词 | 829cd1f |
| 8 | 工具 | gia_log_flow 改进无真实多分支日志样本 | 本机无样本（计划风险条款预设） | 受控小样本 + 端到端待验证 | ae481ef |
| 9 | 设计 | 复合输出复用检测发现 rubik 29 处多消费 | error 会破坏编译 | 降级 warning + 登记剩余清理 | 0ec799b |

## 二、最近一次事故的完整调查链（PKC --all-stale 范围事故 + 死锁）

**现象**：`knowledge-plan refresh-authority-ref --all-stale` 后 operation_count 从 1 变 131
（全库 stale ref 全部入计划）——本想只给单个 claim 补 ref。

**调查链**：
1. 第一次尝试（revise → add-ref）：报 `PLAN_CLAIM_REVISED_NEEDS_REFRESH`（"revised, not added"）——
   误以为"先 add 再 revise"可解；
2. abandon → init → 先 add-ref：报 `PLAN_CLAIM_MISSING`（claim 不在计划内）——两次尝试矛盾；
3. 第三次：revise → `--all-stale`：成功但 operation=131——**范围事故**，abandon；
4. **转折**：读上游 `src/portable_knowledge/semantic_plan.py`——580 行（add 拦截）与 1055 行
   （check 强制 authority）把死锁闭环写死在实现里；测试 `test_semantic_plan_contract.py:1728`
   还固化了 REVISED_NEEDS_REFRESH 的期望——**这是设计约束，不是操作失误**；
5. 结论：not_registered claim 的 revise+补 ref 路径在上游缺失 → 登记 O-28-10⑤ + 生成修复任务
   提示词（提示词内已含上游行号定位，执行者第 0 轮直接可读）。

**方法教训**：三次失败尝试中，任何一次先读上游实现（5 分钟）都能直接得到死锁结论。
`--all-stale` 的批量语义也在同一文件的函数签名/文档里。

## 三、系统性根因（为什么反复出问题）

1. **工具批量/全量修饰词的「范围」未先读**：`--all-stale`、`-A` 类参数会把操作范围从"单条"
   扩到"全库"——调用前必须读 `--help` 或实现中的范围语义；本次只读到了"refresh every registered
   stale Authority Ref"的概要，未意识到计划 operation 数的爆炸。
2. **PKC 流程遇阻先试操作、后读实现**：三次尝试全部被同一批 PLAN_* 错误码拒绝后才读上游——
   **工具约束应先读实现/测试锚点再试**（错误码只是症状，实现里的分支才是语义）。
3. **静态检测器的豁免规则依赖真实数据校准**：重复入边检测首版 59 个告警里 18 个是分支 join
   合法形态——只有跑全量编译看告警分布才能发现；这条是**正收益方法论**（实现先行 + 全量观测 +
   校准豁免），应固化为"新 linter 落地必须跑全量编译统计告警分布"。

## 四、流程与方法论教训

- **实测优先于文档描述**（#2）：O-21-4 的"class=23"描述与真实 GIA 结构不符——任何修复前先
  decode 实测，open-items 描述只作线索不作依据。
- **探针探查 IR/工具结构**（#1/#2/#4）：3 次都靠写 /tmp 探针快速确认结构（ir-probe*.mts、
  gia-probe*.mts、reuse-scan.mts）——比读代码快，且是"唯一铁证"。
- **TS 解析器陷阱记录**（#5）：`=> ({...})` 表达式后紧跟顶层块 `{` 触发 TS1005（函数体误判）——
  测试代码用函数声明规避；已在测试文件注释，防再踩。
- **设计降级要显式**（#9）：O-27-02 从"报错"降级为"warning"有实测依据（rubik 29 处），
  降级理由与剩余工作已登记 open-items——不静默缩范围。

## 五、风险探索与未闭合项

| 项 | 状态 |
|---|---|
| O-28-10⑤ PKC 死锁（上游缺失路径） | 已登记 + 修复任务提示词已产出（含上游行号 580/1055/1728）——待用户派发 |
| O-29-11 全库 stale refs 维护（126 条，与 --all-stale 同窗口） | 维护轮独立进行（本次明确不误触） |
| rubik-3x3 29+ 处 GSTS-COMPOSITE-OUTPUT-REUSE 告警 | 待逐处核对清理（部分需物化重构） |
| 测试合并图 41 处 GSTS-DUPLICATE-EXEC-INPUT 告警 | 测试代码的汇聚形态待核（可能是测试自身问题） |
| gia_log_flow ②③ 端到端 | 待真实多分支日志核验 |
| 分支 join 豁免边界（来源 from 有多条入边时的汇聚） | 当前保守告警，后续可用真实日志校准 |

## 六、产出清单

- 提交：`5c6e94a` / `89ba917` / `edfcac3` / `0ec799b` / `ae481ef` / `829cd1f` / `4c242c5`
- 新文件：`tests/composite_enum_input_test.ts`、`tests/ir_lint_dangling_exec_test.ts`、
  `src/compiler/ir_lint_composite_reuse.ts`、`tests/ir_lint_composite_reuse_test.ts`
- 修改：`src/runtime/core.ts`、`src/definitions/nodes.ts`（enumerationsEqual）、
  `tools/check-gil-composite-refs.ts`、`src/compiler/ir_lint_dangling_exec.ts`、
  `src/compiler/ir_to_gia_transform/shared.ts`、`gia_log_flow.py` + SKILL.md、open-items
- 文档：本复盘 + open-items 五项登记 + **pkc-project-operator 技能迭代**（本次流程第 5 步）
- 验证：`npm run build` exit 0 ×5 / `npm run quicktest` exit 0 ×3 / 三个回归测试全 PASS
  / 真实项目告警量核验（rubik 9+35、football 1+0）
