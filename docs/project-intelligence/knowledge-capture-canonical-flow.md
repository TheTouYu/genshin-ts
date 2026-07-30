# 知识录入最短正确流程

> 状态：当前推荐
> 来源：当前项目 PKC contract + 本次已应用 Bundle 的实战验证
> 最近校验：2026-07-30
> 适用范围：Genshin-TS 项目从已提交变更录入 Project Knowledge；不授权源码修改、地图操作或游戏文件写回

目标是用固定入口完成“当天提交 → 去重 → 候选 Claim → Authority → Bundle → 审批 → 应用 → 验证”，减少重复读取和命令输入错误。

## 0. 固定前缀与边界

所有命令都从项目根执行，并使用：

```bash
python tools/pkc.py <command>
```

开始时声明：

```text
mode: intake
risk: L1
project_state: configured
```

只处理已提交内容。工作树变化先记录路径，不读取或纳入，除非用户明确指定。

## 1. 一次获取当天提交

```bash
git status --short --branch
git log --since='today 00:00' --date=iso-strict \
  --pretty=format:'%H%x09%ad%x09%s' --name-status
```

按变更路径选择一个 Primary Context。不要为了找材料扫描整个仓库。

## 2. 一次 bounded retrieval

对复杂编译器/Composite 任务使用项目 Adapter 和唯一入口：

```bash
python tools/pkc.py progressive-query \
  --context compiler-diagnostics \
  --intent '<按提交主题描述的去重问题>' \
  --max-level 2 --limit 3 --check-authority --format json
```

如果结果足够，读取返回的最小文件；如果是 coverage gap，保留结果并基于当天提交、focused 测试和当前权威文档判断覆盖缺口。不要查询 SQLite，不要加载完整知识树。

## 3. 一次建立计划，串行完成全部操作

```bash
python tools/pkc.py knowledge-plan init \
  --intent '<录入范围>' --risk medium --format json
```

在同一个 plan 中依次执行：

1. 每条稳定事实一次 `add-claim`；
2. 每个 Claim 添加最小且当前的 `add-authority-ref`；
3. 若 finalize 的 full preflight 报 stale，只刷新实际被提交改变且事实边界未变的旧 Ref。

每个命令必须等待前一个命令成功后再执行。记录返回的 `plan_id`、Claim ID 和 Authority Ref ID；不要重复 `init`。

## 4. 只做一次最终检查和 finalize

所有 Claim、Authority Ref 和必要的 stale refresh 完成后：

```bash
python tools/pkc.py knowledge-plan check <PLAN_ID> --mode delta --format json
python tools/pkc.py knowledge-plan finalize <PLAN_ID> --format json
```

在所有操作完成前不要提前 finalize。若 finalize 被 stale Authority 阻止，按第 3 步处理后重新执行一次最终 delta check。

## 5. 精确审批门

读取 Bundle 摘要并展示：Bundle ID、完整 content hash、风险、Claim/Ref 摘要、变更文件和证据边界。

只有用户确认同一个完整 hash 后才能执行：

```bash
python tools/pkc.py bundle-approve <BUNDLE_ID> \
  --content-hash <EXACT_HASH> --apply
python tools/pkc.py bundle-apply <BUNDLE_ID> \
  --content-hash <EXACT_HASH> --apply
```

不要用“继续”“同意”替代精确 hash 确认。

## 6. 应用后验证

```bash
python tools/pkc.py rebuild
python tools/pkc.py validate
python tools/pkc.py tree --format text
git diff --check
git status --short --branch
```

知识库的 Claim 数量、Topic 路径、Authority 状态和 Bundle `approved/applied` 必须与预期一致。自动验证只证明知识库与投影一致，不证明 GIA、编辑器或游戏行为。

## 7. 记忆与提交

只有稳定、跨任务、已验证的流程规则才更新 `AGENTS.md`；当前检查点和下一恢复点更新 `docs/project-intelligence/CURRENT.md` 或对应 Context。局部错误、一次性 query 和临时计划 ID留在审计材料，不推广为规则。

完成验证后，按用户明确授权精确暂存本次文档、规则、记忆和 applied Bundle 变更，再提交 Git；不自动 push。

## 最小调用原则

- 固定 `python tools/pkc.py` 前缀，减少路径错误；
- 当天提交只做一次 log/status 读取；
- progressive-query 一次，最多 L2；
- 一个 plan 串行承载 Claim、Authority 和 stale refresh；
- 所有 mutation 完成后只做一次最终 delta check；
- finalize 后只对展示过的精确 hash approve/apply；
- apply 后集中验证，不重复运行中间检查。
