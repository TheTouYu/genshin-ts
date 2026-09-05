---
name: document-governance
description: 文档治理与强制门禁技能。当出现 doc_health 提交被拦截、文档状态头缺失/过期、历史文档被当现状、PROGRESS 膨胀需归档、AGENTS/CLAUDE 去重、BOARD 滞后、新 issue/源码文件需要补 @status 等文档治理场景时使用。也用于执行或解释 docs/maintenance/document-governance.md 与 scripts/doc_health.py 的规范。
---

# Document Governance（文档治理）

> 权威规范：`docs/maintenance/document-governance.md`
> 强制门禁：`scripts/doc_health.py` + `scripts/git-hooks/pre-commit`

## 何时加载

- 收到 `doc_health` 提交拦截输出，且问题涉及多文件/规范/收口/归档；
- 要新增/修改 issue、BOARD、AGENTS/CLAUDE、历史架构文档、源码文件头注释；
- 要判断某文档是 active 还是 historical；
- PROGRESS 超过 20KB 需要归档；
- 要理解“状态头/文档类型/收口三同步”。

## 核心规则速查

### 1. 文档类型

| 类型 | 含义 | 启动是否必读 |
|---|---|---|
| R | 注入规则（AGENTS/CLAUDE） | 是（应最小） |
| S | 当前状态入口（BOARD、issue 状态行） | 是（只读顶部） |
| A | 设计/权威 | 按需 |
| H | 历史/归档 | 否 |
| T | 票/执行档案 | 按票 |
| C | 源码注释 | 只读当前在飞文件 |

### 2. 状态头

普通治理文档头部须含：

```markdown
> doc-type: R|S|A|H|T|C
> status: active | historical | archived
> updated: YYYY-MM-DD
```

源码文件（src-fb/*.ts）前 5 行须含：

```ts
// @status: active | experimental | compile-only | historical ...
// 或派生文件：@derived-from: <path>
```

`docs/` 下文档遵循 `docs/AGENTS.md`，使用中文标签：`状态：`、`最近校验：`。

### 3. 强制门禁

```bash
python3 scripts/doc_health.py          # 全量体检
python3 scripts/doc_health.py --staged # pre-commit 用
bash scripts/install-git-hooks.sh      # 安装 pre-commit（新 clone 必做）
```

提交被拦截时：
1. 先修输出中列出的具体问题（补状态头/删陈旧句/更新 BOARD HEAD/瘦身超限文件）。
2. 若问题面广或涉及协议，继续读本技能与 `docs/maintenance/document-governance.md`。
3. 不要用 `git commit --no-verify` 绕过。

### 4. 收口三同步

每轮收口必须同步：
1. `BOARD.md` 顶部当前前沿/HEAD；
2. 对应 issue 顶部状态行；
3. `PROGRESS.md` 当前摘要（超 20KB 时归档历史轮次到 `.scratch/football-v2/archives/progress/`）。

### 5. 修复流程

1. 运行 `python3 scripts/doc_health.py` 看全量问题。
2. 按 FAIL 文件逐个修复：
   - 文档补 `doc-type/status/updated`；
   - 源码补 `@status/@derived-from`；
   - 陈旧 marker 直接删除/改写；
   - 超限文件做归档/瘦身；
   - BOARD HEAD 滞后 → 更新为 `git rev-parse --short HEAD`。
3. 修复后 `git add` 相关文件并提交（pre-commit 会再次验证）。
