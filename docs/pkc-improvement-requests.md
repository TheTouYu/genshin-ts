# PKC 使用体验改进需求（提交给 portable-knowledge 项目）

- 提交日期：2026-08-13
- 提交方：genshin-ts 项目（千星沙箱开发，日常用 PKC 沉淀游戏引擎实测规则）
- 版本信息：`portable_knowledge 0.2.0rc5`，source_commit `2e97a0470fec4c78a5db30b3aff809c8fe40ffe4`，operator_contract `0.1`
- 使用方式：项目内 `python tools/pkc.py ...`（wrapper），knowledge-plan 录入 + bundle approve/apply

## 背景

本需求来自一次真实的批量录入实践（2026-08-13，控制器视觉修复复盘）：

- 目标：录入 2 条新 claim（薄片偏移公式、编辑器 aux 重写比对法）+ 各 1 条 authority ref
- 实际过程：**finalize 被 23 条历史 stale/invalidated refs 全量阻塞 → 被迫先做 23 条维护 refresh（bundle 1）→ apply 后 plan 快照过期 → abandon 重做 plan 两次 → 才最终完成**
- 总计 3 次 git 提交、2 次 plan abandon、1 次翻源码查参数值域

以下需求按真实遇到的顺序排列，每条附完整复现路径，可直接作为 issue 描述。

---

## R1（P0）：CLI help 不暴露参数合法值域，必须翻源码

### 现状

- `knowledge-plan add-authority-ref --role`：传入 `authority` 报 `AUTHORITY_REF_ROLE: invalid role`，但 `--help` 不列出合法值。合法值在 `portable_knowledge/authority.py`：`ROLES = {"design_intent","current_implementation","documented_contract","external_environment_behavior"}`（`POLICIES`、`FACT_CLASSES` 同理）。
- `bundle-approve` / `bundle-apply` 的 `--content-hash` 是 **required**（不带直接 usage 报错退出），但 `--help` 的 usage 行没有 `[required]` 标记，帮助文本也未说明该参数从 `bundle-status` 输出获取。
- `knowledge-plan check --mode delta` 的 `--mode` 取值同样不在 help 中枚举。

### 期望

- 所有枚举参数在 help 中列出合法值（argparse `choices=` 会自动展示，当前实现已用 `choices=` 的改为检查是否被 `argparse.SUPPRESS` 或自定义 help 吞掉）。
- required 参数在 usage 与帮助文本中显式标注（如 `--content-hash CONTENT_HASH (required)`），并说明获取途径（`bundle-status`）。
- 验收：新用户不读源码、只看 `--help`，能完成 `add-authority-ref` 与 `bundle-approve`。

### 复现

```bash
python tools/pkc.py knowledge-plan add-authority-ref <plan> --claim-id <id> \
  --path docs/x.md --locator y --role authority --change-policy invalidate_on_change
# → AUTHORITY_REF_ROLE: invalid role（help 未告知合法值）
python tools/pkc.py bundle-approve <bundle_id> --apply
# → error: the following arguments are required: --content-hash
```

---

## R2（P0）：finalize 全量预检把 historical 范围的 stale refs 全部设为 blocking，阻碍无关录入

### 现状

`knowledge-plan finalize` 的 full staged preflight 检查**所有** authority refs，`PLAN_FULL_AUTHORITY_NOT_CURRENT` 一律 `blocking: true`，即使 `authority_scope: historical`（与本 plan 完全无关的 refs，如别的主题引用的源文件被后续提交改动）。

### 实际影响

本次录入 2 条新 claim（涉及 `static-gil-assets`），被 23 条 historical refs（`components.md`、`src/cli/*`、`gil-structure-semantics.md` 等无关路径）阻塞。录入者被迫：先建维护 plan 批量 refresh 23 条 → 提交 → 重做录入 plan。**录入 2 条 claim 变成 25 条 refs 的维护任务**。

### 期望（三选一，倾向 A）

- **A（推荐）**：`authority_scope == "historical"` 的 `PLAN_FULL_AUTHORITY_NOT_CURRENT` 降级为 warning（非阻塞），仅在 plan 末尾提示"存在 N 条 historical stale refs，建议单独维护"；`plan_affected` 仍 blocking。
- B：提供 `finalize --allow-historical-stale` 显式开关。
- C：保持阻塞，但 `recommended_action` 明确指出"可先 abandon 本 plan，在独立维护 plan 中处理"（见 R3）。

验收：存在 historical stale refs 时，新 claim 的 plan 仍可 finalize；维护工作可延后且不阻塞主线录入。

### 复现

```bash
# 1) 先有任意 refs 的源文件被后续提交修改（stale）
# 2) 建 plan 录入一条与它们无关的新 claim
python tools/pkc.py knowledge-plan finalize <plan>
# → PLAN_FULL_AUTHORITY_NOT_CURRENT × N，全部 blocking
```

---

## R3（P0）：plan 的 authority 快照来自 git HEAD，维护 bundle apply 后不提交会持续误报，且错误信息误导

### 现状

- plan 在 init 时从 **git HEAD** 快照 `data/knowledge/authority-refs.json`；`finalize` 的 preflight 也用 plan 快照（`_with_overlay` 覆盖）比对 **HEAD 中的源文件**。
- 因此"维护 bundle apply 成功"（工作树 refs 已更新为 approved hash）之后，**只要不 commit，finalize 仍报同样的 stale**——因为 plan 快照和 HEAD 都是旧值。
- 错误信息 `recommended_action: "Review and refresh or retire this Ref; historical refs may use a separate authority-maintenance plan, then rebase this open plan"` 在本场景**完全误导**：refs 已经 refresh 过（bundle 已 applied），问题是快照过期，rebase 还返回 `PLAN_REBASE_NOOP`（HEAD 未变，rebase 无操作）。

### 实际影响

本次 abandon 了 2 个 plan、重做了 4 次相同的 add-claim 长参数，才靠翻源码（`authority.py` 的 `observe_authority_refs`、`semantic_plan.py` 的 `_with_overlay`）定位到"必须 commit 后重建 plan"。

### 期望

- `PLAN_FULL_AUTHORITY_NOT_CURRENT` 的报错中区分两种成因：
  1. **ref 从未 refresh**（approved_hash 落后于源）→ 现有 recommended_action；
  2. **refs 已在工作树更新但 HEAD 未提交**（ref.approved_hash 与工作树一致、与 HEAD 不一致）→ 提示"维护 bundle 已 apply，请先提交 git，再 abandon 并重建 plan"。
- `rebase` 在 plan 快照过期时（HEAD 未变但工作树 refs 已变）不应返回 NOOP，应能刷新快照或明确告知唯一路径。
- 验收：按上述场景复现时，错误信息能让操作者一次定位到"commit + 重建 plan"，无需翻源码。

---

## R4（P1）：录入缺乏文件驱动方式，长文本参数不可复用

### 现状

`init → add-claim → add-authority-ref → check → finalize` 是 5 步串行 CLI；claim 的 title/statement/boundary 全部以命令行参数传入，无法从文件读取。

### 实际影响

- 一次 claim 的 statement 约 200 字，需在 shell 中手动转义；plan 废弃重做时需原样重打（本次重打 4 次）。
- 同一结论要同时进文档（PROGRESS.md/技能）与知识树时，文本无法复用，需维护两份。

### 期望（二选一）

- A：`knowledge-plan add-claim` 支持 `--from-file <markdown>`，解析固定格式（如 `# 标题 / ## 声明 / ## 边界` 三段）。
- B：提供 `knowledge-plan import <bundle-manifest.json>`：一个 JSON 文件描述多 claim + refs，一次 init/add/finalize 完成批量录入。
- 验收：一条 200 字 claim 的录入从"3 次命令 + 手动转义"变为"1 个草稿文件 + 1 次命令"；批量（≥2 claims）时命令数不随 claim 数增长。

---

## R5（P2）：检索输出的键名与筛选能力

### 现状

- `knowledge-search --format json` 的 results 条目主键叫 `id`（实际是 claim_id），无 `claim_id` 别名；`node_id`/`topic_id` 需要再次关联。
- `query` 无按 claim 状态（`authority_status`）筛选参数；`knowledge-search` 的结果里 `authority_status: pending_review` 与 `current` 混排，无法只看已确认结论。

### 期望

- results 条目提供 `claim_id` 字段（或文档说明 `id` 即 claim_id）。
- 两个检索命令均支持 `--status current|pending_review|...` 过滤。
- 验收：用一条已确认 claim 检索，结果字段可明确区分 id 语义；可过滤掉未确认条目。

---

## 附：本次实践的命令序列（供复现与测试）

```bash
# 1. 录入 plan（2 claims + 2 refs）→ finalize 被 23 条 historical stale 阻塞（R2）
# 2. 建维护 plan，refresh 23 条 refs → finalize → bundle bnd_0f7e36c9 → approve/apply（成功）
# 3. 原 plan rebase → NOOP（R3）；finalize 仍报同样的 stale（R3 根因）
# 4. abandon 重做 plan（快照仍旧）→ 再 abandon → 提交维护 bundle（c837047）→ 第三次建 plan → 成功
# 5. finalize → bundle bnd_e756e32a → approve/apply → rebuild/validate 通过
```

全程 3 次 git 提交、2 次 plan abandon、1 次源码阅读。其中 R2、R3 合计约 70% 的额外轮次。

---

## R3 复现确认（2026-08-16）：staged 快照缺未提交 ref 的另一变体——`AUTHORITY_FACT_COVERAGE`

### 现状

2026-08-16 再次真实命中 R3 同根因的**另一报错变体**：apply 一个维护/录入 bundle（未提交 git）后新建 plan，finalize 全量 preflight 报：

```text
AUTHORITY_FACT_COVERAGE: clm_6788051E...: missing documented_contract
```

根因与 R3 完全相同：新 plan 的 staging 从 git HEAD 快照 authority-refs.json（211 refs），而工作树已 apply 的 ref（`aref_a6b7dc07`，第 212 条）未提交，导致 staged 快照里该 claim 缺覆盖 → 校验失败。`validate`（工作树）通过、`knowledge-check` 不报该 ref，只有 plan finalize 的 staged preflight 报——误导性极强。

### 期望（并入 R3）

R3 的修复应同时覆盖 `AUTHORITY_FACT_COVERAGE` 变体：当 coverage 缺失源于"ref 存在于工作树但不在 HEAD"时，报错应提示"检测到未提交的 authority 变更（N 条 ref 仅在工作树），请先提交或使用 rebase 刷新快照"，而不是报"missing documented_contract"。

---

## R5.1（2026-08-16 已实施）：bundle-status 生命周期健康度汇总（R6/R7/R8 的首个落地）

本体 `portable-knowledge` 已于 2026-08-16 实现 `bundle_health`：`bundle-inspect`/`bundle-status` 在列出全部时新增 `health` 块（状态计数 / 同 intent 重复 draft 提示 / approved 待 apply 下一步 / approval 内容级校验）。已通过全量测试（14/14）与 genshin-ts 真实数据端到端验证（正确识别 1 对重复 draft + 2 个待 apply + 0 误报）。等待发布后经 `plan-upgrade` 落入各消费项目。

---

## R3 修复状态（2026-08-16 已实施+已发布）

- 本体 commit `1de74e310e0ff3a090fd49ee60bab335896fc22c` 实现 `knowledge-plan init --baseline worktree`：操作者可显式接受"已 apply 未提交"的工作树权威为 plan 基线，并钉住工作树快照（`PLAN_WORKTREE_SNAPSHOT_DRIFT` 守卫后续漂移）。
- 已随 plan-upgrade 发布到 genshin-ts（wheel `edad0ba4...`，锁 `source_ref 1de74e3`）。
- 补充认知：纯已 apply 维护（refs 全部 refresh 到 current）时 committed 模式本就不拦截；worktree 模式是"有未 refresh stale ref 混入时"的显式推进通道。
- 待办：`--baseline worktree` 的真实"混入 stale"场景端到端验证（当前 authority 干净，未触发）。

## R6（P1）：draft 重复无自动消重——同 intent 近似重复 draft 无任何提示

### 现状

`bundle-status` 逐条列出 bundle，但不提示"同 intent 存在多个 draft"。2026-08-15/16 实测发现两对近似重复：

- intent `entity-import-aux-attachment-2026-08-10`：`bnd_ffe4dbcac...` + `bnd_e13c56cbe...`（各 2 claims + 4 refs，语义相同，content hash 不同，均无 `superseded_by`）；
- intent `P4-4 类型契约`：`bnd_36ef81925...` + `bnd_bbda2fb98...`（各 3 claims + 6 refs，同上）。

其中第一对的意图其实已被第三个 bundle `bnd_4f9e9121...`（applied）覆盖——即**三个 bundle 做同一件事**，两个 draft 是孤儿。识别需手工 cross-check 每个 draft 的 claims/refs 与已 apply bundle 的语义。

### 实际影响

维护者无法从 `bundle-status` 得知"这个 draft 可能已被覆盖/重复"；误 apply 会重复注册已存在 claim/ref（stale-baseline 静默假成功风险）。本次靠逐 bundle 读 json + 与已 apply bundle 对比才识别。

### 期望

- `bundle-status` 对"同 intent 的多个 draft（均未 superseded）"输出疑似重复提示（附 intent 分组）。
- 对"draft 的 claims/refs 与某已 apply bundle 完全重合"提示"意图可能已被 bnd_xxx 覆盖"。
- 验收：一条 `bundle-status` 输出即可发现这两对重复，无需读 json。

---

## R7（P1）：bundle-status 缺生命周期健康度汇总——状态计数与"下一步"提示

### 现状

`bundle-status` 输出逐条 bundle（73+ 条），无聚合统计，无状态语义说明。本次实测两次误判：

1. 误把 `approved` 态 bundle 的 approval 文件当成"空文件半成品"（用不存在的键 `approved_by/approved_at` 读，返回 None 误判为空）——实际 approval 文件合法完整（approval_hash/content_hash/principal/schema_version 齐全），`approved` 是合法中间态（已批准待 apply）。根源：输出无"approved=待 apply"的语义提示。
2. 无法一眼看出"有几个 draft 待处理、几个 approved 待 apply、几个已 apply"。

### 期望

- `bundle-status` 增加健康度汇总块：各 state 计数（draft/approved/applied/superseded/...）。
- `approved` 未 apply 的 bundle 显式标注"下一步：bundle-apply --apply"。
- 验收：一条命令看清生命周期全景与待办，无需手工交叉 bundle-status + approval/applied 文件。

---

## R8（P2）：bundle 生命周期文件缺内容级校验——approval/lifecycle 文件损坏或半写无法被 detect

### 现状

`bundle-status`/`bundle-inspect` 只检查 approval/applied **文件是否存在**（`approval_path.is_file()`），不校验内容合法性（schema、approval_hash 是否匹配 bundle）。若文件被截断、写坏或手工改坏，`bundle-status` 仍报 `approved`/`applied`，直到 `bundle-apply` 才失败。

### 期望

- `bundle-status` 对 approval/applied/lifecycle 文件做内容级校验（schema + hash 匹配），异常标记为 `approval_invalid`/`receipt_invalid` 并列入健康度汇总。
- 验收：故意损坏一个 approval 文件后，`bundle-status` 能指出该 bundle 状态异常，而不是静默报 approved。
