---
name: dsh-plugin-search
description: Find plugins for DeepSeek Harness (DSH) on GitHub. Use when the user wants to search, locate, or discover a dsh plugin for some capability (custom model, API key, web search, UI skin, TUI, MCP, sandbox, memory, notification...), asks "find/搜/找一个 dsh 插件" or "is there a plugin for X", or wants candidate plugins evaluated before recommending. Sweeps the topic:dsh-plugin ecosystem like a radar — fuzzy-match on title + description, then verifies candidates against their README before recommending.
---

# dsh-plugin-search

Find a DSH plugin by sweeping the whole `topic:dsh-plugin` ecosystem (1800+ repos) like a **radar**: cast a wide net with fuzzy matching on title + description, then converge on verified candidates.

## Step 1 — 蒸馏需求关键词

把用户要的"能力"蒸馏成查询词：主词 + 同义词 + 中英文变体。例："自定义模型" → `custom model`, `model provider`, `openai compatible`, `api key`, `自定义模型`, `自定义供应商`, `openrouter`, `llm adapter`。

**完成标准**：得到 3–8 个覆盖中英文、宽窄两档的关键词组。

## Step 2 — 雷达扫描（脚本快速路径）

脚本：`scripts/search.mjs`（零依赖，Node ≥ 18，首次运行自动抓取缓存数据）。

```bash
node scripts/search.mjs <关键词...> --limit 10          # 模糊匹配标题+描述+话题标签
node scripts/search.mjs <关键词...> --api "<关键词>"    # 追加 GitHub 全文搜索（含 README）并合并
node scripts/search.mjs <关键词...> --refresh           # 重抓数据（24h 缓存；10 页 ≈ 70s，未认证限流 10 次/分钟）
node scripts/search.mjs --list                          # 查看缓存规模
```

要点：
- 分数 `≥ 2` 值得看；`--min-score` 调阈值；`--json` 出结构化结果。
- **名称/描述没命中 ≠ 没有**：`--api` 搜 README 是补网的关键（如 `openrouter` 只在 README 出现）。
- 中英文一起试：中文走整串/2-gram 匹配，英文走精确/前缀/子串/编辑距离/子序列五级打分。

**完成标准**：每组关键词都跑过，得到 ≥1 个与能力直接相关的候选；若全空，改词（换同义词 / `--api` / 调低阈值）后再扫，禁止带着空结果进入下一步。

## Step 3 — 页面纵深（手动路径，脚本不够或用户想浏览时）

- 话题页（精选 20 个）：`https://github.com/topics/dsh-plugin`
- GitHub 搜索 UI（全文，含 README）：`https://github.com/search?q=topic:dsh-plugin+<关键词>&type=repositories`
- 精选索引（人肉维护，质量高）：
  - `AdamPlatin123/awesome-dsh-plugins` — 124 个验证过的插件，分类目录 PLUGINS.md（按功能领域找最快）
  - `awesome-dsh-plugin/awesome-dsh-plugin` — 精选列表
  - `bradeGithub/DSH-Plugins-Marketplace`、`yyyyukari/dsh-plugin-workshop` — 现成的 GUI 插件浏览器（可搜索/一键安装）

**完成标准**：脚本结果与精选索引交叉核对过；候选集合与 Step 2 一致或有明确增删理由。

## Step 4 — 验证（推荐前必做）

对每个候选抓 README（raw.githubusercontent，先试 `main` 再试 `master`），核对：
1. **能力真实性**：README 是否真的支持需求（描述里说支持 ≠ 支持，看配置示例/截图）
2. **安装路径**：`dsh plugin add github:owner/repo` / `npm install` / bundle 安装，写进汇报
3. **配置面**：自定义项（如 `apiKey` / `baseURL` / providers 列表）长什么样
4. **风险**：改官方文件（patch）还是独立 bundle？依赖重不重？star/更新时间/测试证据（参考 awesome 列表的运行级 ✅）

**完成标准**：每个推荐的插件都有 README 证据 + 安装命令；未验证的不推荐。

## Step 5 — 汇报

按匹配度排序输出：插件名、一句话能力、安装命令、证据链接。点明"最佳匹配"与"备选"。

**完成标准**：用户能直接照着安装命令用起来。

---

## 参考

- 数据源地图、URL 模式、打分说明、限流须知 → [`references.md`](references.md)
