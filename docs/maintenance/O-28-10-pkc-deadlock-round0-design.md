# O-28-10⑤ PKC 死锁修复·第 0 轮：复现记录 + 设计方案（待用户裁决）

> 日期：2026-08-31（第 0 轮）
> 范围：上游 portable-knowledge「revise 无 ref claim 补 authority ref」路径缺失的复现与设计；
>   本项目 clm_CAE30537（client-log-encoding）按钮字典修正为首个受益场景。
> 状态：**候选 A 已获用户裁决确认（2026-08-31），进入 R1 上游红绿测试 / R2 修复实施**。
> 裁决记录：用户于第 0 轮末从候选 A（推荐）/B/C 中选定 A——add_authority_ref 对零 ref revised claim 放行，有 ref 仍走 refresh。
> 关联：open-items O-28-10⑤（死锁登记）/ O-2026-08-29-11（全库 stale refs 维护轮，本次不误触）。

## 一、复现记录（本项目 genshin-ts，runtime fe838a0）

环境：`python3 tools/pkc.py`（锁定 runtime fe838a077160aeb35414ed6900291974a6d36ac2），
plan `pln_fb107f2d583d0a81c3cda43815`（baseline bc2bdaa），claim 全 ID
`clm_CAE30537EC91456D842A343D39`（authority-refs.json 中 0 条 ref，448 条 ref 均不含它——not_registered 实证）。
复现后已 abandon，现场已清理。

| 步骤 | 命令 | exit | 错误码 | 关键信息 |
|---|---|---|---|---|
| 1. revise-claim（correct，/tmp/new-statement.txt） | `revise-claim` | 0 | —（成功 op=1） | touched: proposals jsonl + client-log-encoding.md |
| 2. add-authority-ref | 同一 plan | 1 | `PLAN_CLAIM_REVISED_NEEDS_REFRESH` | 「revised, not added; refresh its existing Authority Ref instead」——但该 claim **没有** existing ref |
| 3. refresh-authority-ref（无 --all-stale，无 ref id） | 同一 plan | 1 | `PLAN_AUTHORITY_REF_MISSING` | 「Authority Ref not found or not unique: None」——refresh 无目标 |
| 4. check --mode delta | 同一 plan | 1 | `PLAN_CLAIM_AUTHORITY_INSUFFICIENT` | 「correction/expansion lacks Authority coverage」，can_finalize=false |
| 对照. 不 revise 直接 add-ref | 新 plan | 1 | `PLAN_CLAIM_MISSING` | 「planned claim not found」——覆盖 O-28-10⑤ 登记的第二次尝试 |

**与 open-items O-28-10⑤ 记录一致性**：完全一致；并补全了当时未落码的
refresh 无目标错误码 = `PLAN_AUTHORITY_REF_MISSING`（open-items 原文只写「无法 refresh 单条」）。

## 二、上游「ref 存在性」判定路径（semantic_plan.py @ fe838a0）

```text
revise_claim (483)
  └─ 502: plan["existing_claim_changes"][claim_id] = {canonical_input + details}
        （plan["claims"] 只收录本计划 add_claim 的 claim；revise 不进 claims）

add_authority_ref (574)
  ├─ 576: claim = plan["claims"].get(claim_id)          ← 只认本计划 add 的 claim
  ├─ 579: claim_id in existing_claim_changes？
  │     └─ 是 → 580 _fail PLAN_CLAIM_REVISED_NEEDS_REFRESH   ← 墙 1：指引去 refresh
  ├─ 583: 否则 _fail PLAN_CLAIM_MISSING                      ← 墙 2
  └─ （放行后）601: facts ⊆ claim["fact_classes"]
          605: permission 不得高于 internal
          614-635: 构造 ref → append authority_refs writes   ← 能力本身完整存在

refresh_authority_ref (736)
  ├─ 779: data["refs"] 按 --authority-ref-id 精确匹配
  └─ 781: 找不到 → _authority_ref_missing_fail               ← 墙 3：ref 必须已存在

check_delta (1036)
  ├─ 1044: changed_ids = plan["claims"] ∪ existing_claim_changes（revised claim 入检）
  ├─ 1048: all_refs 读自 staging overlay（含本计划 writes！）
  ├─ 1052: validate_authority_coverage(planned_claims, all_refs)   ← fact-class 级全覆盖
  └─ 1053-1055: correct/expand 且无任何 ref 覆盖
        → PLAN_CLAIM_AUTHORITY_INSUFFICIENT                   ← 墙 4：can_finalize=false
```

**死锁本质**：revise 把 claim 放进 existing_claim_changes；add 只认 plan["claims"]
并明确指引「去 refresh 已有 ref」；refresh 前提是 ref 已存在；对「历史上从未有过 ref」的
claim（真实场景：clm_CAE30537 及更早期 capture 落地的无 ref claim），四道墙互指、无出口。
--all-stale 是唯一能推进的命令，但它按 registry 全量拉 ref（本项目曾因此 1→131 操作，范围事故）。

**绕行口核查**：先 add_claim 同 id 造假 → core.plan_add_claim 的 duplicate 检测
（semantic_plan.py:468 PLAN_DUPLICATE）拦截，不是合法路径。

## 三、候选方案对比

### 候选 A（推荐）：add_authority_ref 对「无任何 ref 的 revised claim」放行

判定收窄：PLAN_CLAIM_REVISED_NEEDS_REFRESH 仅当该 claim 在 baseline authority-refs
中**已有 ≥1 条 ref**；零 ref claim 放行补首条。

实现要点（最小侵入，全部复用现有代码）：

```python
# semantic_plan.py add_authority_ref 576-583 改为：
claim = plan["claims"].get(args.claim_id)
if not claim:
    if args.claim_id in plan.get("existing_claim_changes", {}):
        _refs_rel, _data = _authority_registry_overlay(root, instance, plan)
        if any(args.claim_id in ref.get("claim_ids", []) for ref in _data["refs"]):
            _fail("PLAN_CLAIM_REVISED_NEEDS_REFRESH", ...)      # 原语义：有 ref → refresh
        temporary, staging = _with_overlay(root, instance, plan)
        try:
            registry, _ = _core().load_authority(staging)
            parsed_claims, parse_findings = _core().parse_claims(staging, registry)
        finally:
            temporary.cleanup()
        parsed = next((c for c in parsed_claims if c["id"] == args.claim_id), None)
        if parse_findings or not parsed:
            _fail("PLAN_CLAIM_REVISION_UNSUPPORTED", "zero-ref revised claim not parseable: " + args.claim_id)
        claim = parsed   # 提供 601/605 所需 fact_classes/permission（parse_claims 自带）
    else:
        _fail("PLAN_CLAIM_MISSING", ...)
# 598-638 行原逻辑零改动：fact-class 校验、permission 校验、ref 构造、writes 全复用
```

check/finalize **零改动**自动闭合：1048 行 all_refs 读自 staging overlay，放行后新 ref
进 plan["writes"][refs_rel] → 1052 coverage 满足、1054 any(...) 为 True → 不再报
INSUFFICIENT。finalize full preflight（1211-1228）同样在 staging 上跑，同一闭合。

### 候选 B：refresh 支持 --create-if-missing（不推荐）

refresh 的输入模型是 --authority-ref-id（对已存在 ref 重新批准 hash）；「创建」需要全套
构造参数（path/locator/role/change-policy/fact-class）。加 create-if-missing 意味着
refresh 命令要新增按 claim 定位 + 全套构造参数，输入模型分裂、语义混淆，侵入面大于 A，
且 --all-stale 交互面也要重新定义。

### 候选 C：不修上游，claim 修正并入全库 stale 维护轮（O-2026-08-29-11）

--all-stale 可绕过死锁但范围 126+ 条、与「只修一条」的需求不匹配；若用户裁决走此路，
O-28-10⑤ 以「并入维护轮」闭合，上游能力缺口另行登记。

## 四、对既有语义的影响面（候选 A）

- **PLAN_CLAIM_REVISED_NEEDS_REFRESH 触发面收窄**：仅剩「revised 且已有 ref」。
  有 ref 的 claim 仍必须走 refresh——「revise 必配 refresh」的核心设计不变。
- **契约文档对照**：SEMANTIC-CHANGES.md 67 行「revise 不改 Authority links」、
  79 行「correct/expand fail closed without coverage」均不受影响——A 只是给
  「零 coverage claim」提供了达成 coverage 的合法入口，fail-closed 语义不变。
- **权限面零弱化**：601 fact-class ⊆ claim 校验、605 permission ≤ internal 校验原样生效；
  fact_classes/permission 取自 baseline parse（revise CLI 本就不允许改这两者）。
- **审批面零变化**：新 ref 仍写 authority-refs.json、仍走 bundle content_hash 审批。
- **绕过防护不变**：PLAN_AUTHORITY_STAGED_DRIFT（1056-1061）照常拦截「ref 指向本计划
  修改的文档」。本项目场景 ref 指向 docs/game-engine-knowledge/debug-log-format.md
  （计划只改 knowledge/ 下知识文档，不改它），不触发 DRIFT。
- **既有测试**：test_semantic_plan_contract.py:1707（1728 行断言）revise 的是**有 ref**
  的 claim——按新语义仍被拒，**断言无需变更**（这正证明语义收窄的精确性）。

## 五、上游测试设计（R1 红绿）

新用例 test_add_authority_ref_allows_first_ref_for_zero_ref_revised_claim：

1. plan1 合法建 claim（add_claim + add_ref → check can_finalize → finalize → approve →
   apply → commit）——复用 1707 用例的建基线模式；
2. 手工从 data/store/authority-refs.json 删除该 claim 的 ref 并 commit（模拟历史遗留
   零 ref claim；直接编辑 refs json 的先例 = 1739 行用例；随后刷新 self.authority_before）；
3. plan2：revise-claim（correct）→ **add-authority-ref 应成功**（红：现版报
   REVISED_NEEDS_REFRESH；绿：放行返回 authority_ref_id）；
4. check --mode delta → can_finalize=True；finalize → approve → apply 全程无 PLAN_* 错误；
5. 断言 authority-refs.json 落地新 ref 且 apply 后 claim 有 coverage。

配套：1707 用例保持原样（充当「有 ref 仍拒」的守护断言）；R2 全量测试必须绿。

## 六、本项目侧核验链（R3，方案确认后执行）

1. plan-upgrade --source-repository /home/h/portable-knowledge --source-commit <修复 commit>
   （锁定新 commit，旧 runtime 保留可回滚；升级校验含 knowledge-check 全绿）；
2. 复现场景重跑：init → revise（/tmp/new-statement.txt 拆 statement/boundary，
   semantic-declaration=correct）→ add-authority-ref（path=docs/game-engine-knowledge/
   debug-log-format.md，locator=按钮字典精确映射，role=documented_contract，
   change-policy=invalidate_on_change，**fact-class=external_game_evidence**——claim 的
   fact_classes=["external_game_evidence"]，1052 全覆盖校验要求 fact-class 必须选它）
   → check delta 0 错 → finalize；
3. bundle content_hash 报用户审批 → approve → apply → pkc validate 绿 →
   show-claim 内容含精确映射（F=1937/B=1938/L=1870/R=1936/U=1939/D=1940）→ 提交。

## 七、风险与边界

- 放行分支的 parse_claims 若报 findings（知识文档结构损坏）→ fail closed
  PLAN_CLAIM_REVISION_UNSUPPORTED，不静默放行。
- 同一 claim 同一 plan 内重复 add 同参数 ref：610-613 幂等 replay 分支原样覆盖。
- 多 claim 计划：每个 revised claim 独立判定有无 baseline ref，互不影响。
- 本项目升级链 fe838a0 → 修复 commit 走 pkc-project-operator plan-upgrade 全流程，
  中途失败自动回滚旧 runtime。
- 若用户裁决候选 C：O-28-10⑤ 改挂 O-2026-08-29-11 维护轮，上游能力缺口另行登记 open-items。

## 八、第 0 轮结论

1. 死锁四错误码全部复现并落码（新增 PLAN_AUTHORITY_REF_MISSING 补录），
   与 O-28-10⑤ 登记一致；复现现场已 abandon 清理。
2. 判定路径闭环在上游实现中实证（行号锚点 502/576-583/779-781/1048/1053-1055）；
   绕行口（同 id add_claim）被 PLAN_DUPLICATE 拦截，确认无既有合法路径。
3. 推荐候选 A：实现面 = add_authority_ref 单函数入口分支（约 15 行），check/finalize/
   审批链零改动自动闭合；既有 1728 断言不变；新增 1 条红绿用例 + 1707 作守护断言。
4. **待用户确认候选 A（或裁决 B/C）后，才进入 R1 改上游。**

## 附录：修正后 statement（防 /tmp 清理的备份指引）

statement（--statement 传「### 标题行 + 正文段」，即 #### 适用边界 之前全部）与
boundary（#### 适用边界 之后内容）已拆分验证（1063 + 205 字符）。全文见
/tmp/new-statement.txt（2026-08-30 12:49，2355 字节）；核心修正 =
按钮字典 F/B/L/R/U/D=1073741937/1073741938/1073741870/1073741936/1073741939/1073741940、
x/y/z=1073743064/3065/3066（证据：docs/game-engine-knowledge/debug-log-format.md
「按钮字典精确映射」节，commit 9cfbc58）。
