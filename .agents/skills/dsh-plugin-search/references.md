# 数据源地图与验证清单

## 数据源（由近到远）

| 数据源 | 覆盖 | 特点 | 用途 |
|---|---|---|---|
| 脚本缓存 `data/repos.json` | 前 1000 个仓库（搜索 API 上限） | 本地秒查，24h 缓存 | 主路径：模糊匹配标题/描述/话题标签 |
| GitHub 搜索 API `--api` | 1000+，含 README 全文 | 未认证 10 次/分钟 | 补网：README 才出现的关键词 |
| 话题页 `github.com/topics/dsh-plugin` | 精选 20 个 | 人肉精选 | 快速浏览热门 |
| GitHub 搜索 UI `github.com/search?q=topic:dsh-plugin+<kw>&type=repositories` | 全文含 README | 页面交互式 | 手动路径 |
| `AdamPlatin123/awesome-dsh-plugins`（PLUGINS.md） | 124 个已验证 | 运行级 ✅ 证据、分类目录 | 交叉核对 + 质量背书 |
| `bradeGithub/DSH-Plugins-Marketplace` / `yyyyukari/dsh-plugin-workshop` | 聚合话题 | GUI 搜索+安装 | 直接推荐给用户浏览 |

## 实测数据（2026-08 快照）

- `topic:dsh-plugin` 共 **1804** 个仓库；搜索 API 每页 100，最多取 1000。
- 话题页只展示 20 个精选；API 是完整视图。
- `--api` 全文搜索能捞到名称/描述不包含关键词但 README 包含的插件（实测：`openrouter` 仅在 README 出现时也能命中）。

## 打分说明（`search.mjs` 内置）

- 字段权重：名称 2.0 > 描述 1.0 > 话题标签 0.8；整句短语命中另有加成。
- 英文 token 五级：精确 1.0 / 前缀 0.85 / 子串 0.75 / 编辑距离 ≤2 0.55–0.68 / 子序列 0.45（容错拼写）。
- 中文：整串子串 1.0，否则 2-gram 覆盖度 ×0.8。
- 覆盖率乘数：(0.35 + 0.65 × 命中token占比) —— 部分命中的查询自动降权。
- 经验阈值：`≥ 2` 值得看；`0.5–2` 相关性存疑；`< 0.5` 默认过滤。

## 限流须知

- 未认证搜索 API：**10 次/分钟**，分页抓取脚本内置 7.5s 间隔（10 页 ≈ 75s）。
- 403 时脚本会提示等待；`raw.githubusercontent.com` 不受搜索限流，验证 README 用它。
- README 分支：先试 `main`，404 再试 `master`（实测 `dsh-byok` 在 master）。

## 验证清单（推荐前逐项核对）

1. README 能力真实性：看配置示例/截图，不信一句话描述。
2. 安装路径：`dsh plugin --profile web add github:owner/repo` / `npm install <pkg>` / bundle。
3. 配置面：自定义项长什么样（如 `providers: {name: {baseURL, apiKey}}`）。
4. 风险：改官方文件（patch 层）还是独立 bundle；依赖轻重；star 数、最近推送时间。
5. 生态背书：awesome-dsh-plugins 的运行级 ✅ / 待测 / ❌ 标记。
6. **纯文本模型约束（实测踩坑）**：目标环境若用纯文本模型（如 deepseek-v4-flash），DSH 附件有 image-admission preflight，纯附件型插件会被拒；选型要确认插件是"路径注入型"（如 paste-to-workspace / dsh-drop-to-path，发送时转 `[Image: source: …]` 文本）还是"附件型"（dsh-paste-input 存疑）。感知层另需视觉桥（可复用用户 pi 生态的 aijws 提供商，openai-responses 协议）。

## 已知边界

- 搜索 API 1000 条上限：超出部分（1804-1000=804 个）只能靠关键词查询或页面路径触达。
- 描述为空的仓库只能按名称/话题匹配。
- 话题标签混入非插件仓库（skin/桌面壳/索引库），验证步骤不可跳过。
