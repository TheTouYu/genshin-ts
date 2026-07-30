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

## 复盘结论

最常见的可避免错误是入口路径手写错误。最重要的安全错误是绕过 stale Authority、混淆证据等级或未确认精确 Bundle hash。前者靠固定命令模板解决，后者必须保留 PKC 的 staged validation 和人工审批门。
