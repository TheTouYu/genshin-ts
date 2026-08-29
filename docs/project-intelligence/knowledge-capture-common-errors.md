# 知识录入常见错误汇总

> 状态：当前记录
> 来源：当前项目知识录入流程的实战复盘
> 最近校验：2026-07-30
> 适用范围：Genshin-TS 项目 PKC 知识录入；不替代 PKC runtime contract

本文记录本次从当天提交整理知识时实际遇到、且可复用的错误类型。它不是失败日志；具体计划 ID、临时查询文本和单次路径不作为规则。

## 1. 命令入口写错

项目唯一入口是：

```bash
python tools/pkc.py <command>
```

本次多次误写为 `python tools.pkc.py`，导致 Python 报：

```text
can't open file '/home/h/genshin-ts/tools.pkc.py'
```

修复：每次复制固定前缀 `python tools/pkc.py`，不要手敲变体。命令失败时先修正入口，不要重建计划或重复执行已成功的操作。

## 2. 把 coverage gap 当成知识缺失或流程失败

`progressive-query` 返回 `RETRIEVAL_CANDIDATE_UNKNOWN` 时，含义是当前检索路由没有足够置信度覆盖问题，不是仓库没有相关知识，也不是应该扫描整个知识树。

正确处理：

1. 保留候选 Topic 和 confidence/margin 结果；
2. 读取最小必要的当前提交、测试和权威文档；
3. 判断是新增 Topic/Claim，还是修订已有 Claim；
4. 只在稳定规则成立时扩展覆盖。

## 3. 计划操作没有串行执行

同一个 `knowledge-plan` 不支持并发 mutation。`init`、`add-claim`、`add-authority-ref`、`refresh-authority-ref` 必须等待上一步返回后再执行下一步。

本次虽然使用串行调用，但中间命令输入错误后重新执行；这比并发安全，但仍应先检查上一步结果，避免重复操作。

## 4. 过早 finalize 或绕过 stale Authority Ref

delta check 通过不代表可以 finalize。finalize 还会执行 full staged preflight。

如果出现 `PLAN_FULL_AUTHORITY_NOT_CURRENT`：

- 不要跳过 preflight；
- 不要直接刷新全部 Authority Ref；
- 只刷新被本次已提交变更实际改变、且原 Claim 事实边界仍然成立的 Ref；
- 使用 `refresh-authority-ref`，保留原 Ref ID 和 Claim 链接；
- 之后按规则重新执行一次最终 delta check，再 finalize。

## 5. 把工作树内容当作 Authority

Authority 必须来自已提交基线。工作树中未提交的源码、文档或输出不能直接升级为稳定 Claim。

录入当天提交时，应先记录：

```bash
git status --short --branch
git log --since='today 00:00' --name-status
```

只纳入明确属于当天提交的路径；保护其他工作树变化。

## 6. 混淆证据层级

以下结论必须分开：

- 当前源码实现；
- focused 自动回归；
- GIA 生成或解码；
- 编辑器导入；
- 写回成功；
- 游戏内行为。

自动回归不能写成编辑器或游戏验证。每条 Claim 都要写清适用范围、失效条件和 Authority Ref。

## 7. 把“批准”与“应用”混为一谈

正确顺序是：

1. finalize 生成 draft Bundle；
2. 展示 Bundle ID、完整 content hash、变更文件和边界；
3. 人工确认精确 hash；
4. `bundle-approve`；
5. `bundle-apply`；
6. apply 后 `rebuild`、`validate` 和检索/路径检查。

普通的“同意”不能替代对具体 hash 的确认。

## 8. 只跑 validate，不检查最终工作树

知识 Bundle 应用后至少执行：

```bash
python tools/pkc.py rebuild
python tools/pkc.py validate
python tools/pkc.py tree --format text

git diff --check
```

同时检查 `git status`，确认变化只属于本次 Bundle 和明确授权的文档/规则修改。

## 9. 新 topic 的 topic-path 必须落在 knowledge/ 且为 Markdown 路径

`add-claim` 建新 topic 时 `--topic-path` 必须是完整 Markdown 路径（`knowledge/<node>/<topic-id>.md`）。
写 `game-engine-knowledge` 报 `path must remain under knowledge/`；写到目录不写 `.md` 报 `must be Markdown`。
失败后 plan 状态不变，可直接用正确路径重试（同 plan 内幂等，不会产生重复 claim）。

## 10. 引用「本轮刚提交的索引文档」不要用 manual_review 政策

`add-authority-ref --change-policy manual_review` 的 Ref 在 finalize 全量预检中**恒为阻塞态**
（`PLAN_FULL_AUTHORITY_NOT_CURRENT ... blocking: true`，即使 expected==observed hash 也拦），
且 `refresh-authority-ref` 对 hash 一致的 Ref 返回 `PLAN_STRUCTURE_NOOP`，无法解除。
规律：**引用定期更新的索引/总纲类文档（如周度复盘总纲）用 `review_on_change`**（内容未变即 current）；
`manual_review` 只适合「每次 finalize 前必须人工介入」的强门场景，且要提前想好解除阻塞的路径。
补救：retire 旧 Ref（**必须带 `--replacement-authority-ref-id`，否则报 `PLAN_AUTHORITY_REPLACEMENT_REQUIRED`**）
+ 以新政策重新 add。

## 11. bundle-approve / bundle-apply 默认 dry-run，必须加 --apply

不带 `--apply` 的 `bundle-approve` 只做 DRY RUN（不落 `.approval.json`），随后 `bundle-apply`
会报 `required file missing: ...approval.json`。正确顺序：`bundle-approve <id> --content-hash <h> --apply`
→ `bundle-apply <id> --content-hash <h> --apply`。

## 12. 每次 mutation 后 finalize 前必须重新 delta check

retire/refresh/add 任何操作后，plan digest 变化，直接 finalize 报 `PLAN_DELTA_REQUIRED`。
流程固定为：全部 mutation → `knowledge-plan check <id> --mode delta` → `finalize <id>`。

## 13. 共享工作树下只提交自己的 bundle 文件

多个会话并发做 PKC capture 时，`data/knowledge/bundles/` 下会并存其他会话的草稿 bundle
（`.json`/`.approval.json` 未提交）。提交时**只精确暂存本次 bundle 的三件套
（bnd_xxx.json / .approval.json / .applied.json）**与 registry/authority-refs/proposals 及本次
knowledge 主题文件；`proposals/*.jsonl` 是共享追加文件，先 `git diff` 确认新增行都属于本次计划再提交。


## 14. 多 plan 连续维护三坑（2026-08-29 二轮复盘元复盘实证）

### 14a. 同 topic 多 claim 批量 capture：topic 元数据只在创建时有效

同 topic 的第 2 条起再传 --topic-title/--topic-summary/--topic-keyword 报
PLAN_TOPIC_INVALID「topic metadata is only valid when creating a new topic」。
批量脚本按 topic 分组：每 topic 首条 claim 带全量元数据，后续只传 --topic-id + --topic-path。

### 14b. bundle apply 后必须先提交 PKC 落盘文件，再开新 plan

apply 只写工作树不写 git。未提交时开新 plan：full preflight 把新 ref 判 missing（committed 基线不可见），
update/refresh-authority-ref 报 PLAN_AUTHORITY_REF_MISSING（not found），与 ref 是否存在于磁盘无关；
提交后旧 plan 又可能 rebase 冲突（authority-refs.json 跨基线变化，PLAN_REBASE_CONFLICT），
只能 abandon 重 init。正确时序：bundle apply → validate/rebuild → **提交落盘** → 再开下一个 plan。

### 14c. post-apply 评估门失败 ≠ 事务失败；检索竞争用三级杠杆

bundle-apply 报 PLAN_POST_APPLY_EVALUATION_FAILED（exit 1）时，事务通常**已落盘**——
先 bundle-status / validate / tree 定性，再处理评估门。检索竞争类失败（新知识把评估用例期望 topic
挤出 top-N）三级杠杆按序：①topic 元数据（关键词去竞争，官方杠杆）②claim 标题措辞（clarify 声明）
③评估夹具 expected_topic_ids 更新（tracked config，用户审阅精确 diff）。前两级可能都不够——
若新 claim 语义上就是该 query 的合法答案（语义重叠），直接走第 3 级；禁止为迁就检索删改 claim 正文语义。

## 复盘结论

最常见的可避免错误是入口路径手写错误。最重要的安全错误是绕过 stale Authority、混淆证据等级或未确认精确 Bundle hash。前者靠固定命令模板解决，后者必须保留 PKC 的 staged validation 和人工审批门。
