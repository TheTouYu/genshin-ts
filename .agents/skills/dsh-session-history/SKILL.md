---
name: dsh-session-history
description: Search DeepSeek Harness (DSH) agent chat/session history (zstd-compressed JSONL event streams under ~/.dsh/sessions) to recover capabilities, tools, commands, decisions, user intent, acceptance criteria, model mistakes, unfinished tasks, and unsaved context. Use whenever the user asks to search past chats, recover what they previously told a model, identify which session or file change came from, resume an investigation, find undocumented decisions, extract model errors/tool-call details for retrospective (复盘) and knowledge sedimentation (长期进化), or check whether a task was completed in a past session. Prefer user messages for intent, then trace assistant/tool evidence and cross-check current source, git, tests, and real-environment state.
---

# DSH 会话历史检索（长期进化的记忆底座）

DSH（DeepSeek Harness）的每次对话保存在 `~/.dsh/sessions/` 下的 **zstd 压缩 JSONL 事件流**里。
这些记录是**跨项目恢复历史能力、工具用法、决策、模型错误、未完成任务和真实验证证据**的第一手来源。
本技能是 pi-session-history 的 DSH 适配 + 长期进化增强版：在"检索历史"之外，
新增 **错误自动定位（isError）、未完成任务检测、思考链提取、沉淀闭环** 四个能力，
直接服务于知识落盘、技能迭代与复盘（说了≠做了 → 用历史反推验证）。

## ⚡ 压缩/失忆后的第一动作：回收用户原话（30 秒，2026-09-10 用户纠偏固化）

**触发**：上下文刚被压缩过 / 跨天 / 一轮开始时不确定"用户到底要什么" / 动手改代码之前。
**不要**：凭记忆复述用户诉求、自己写摘要文件当真相源、让用户重复一遍（用户原话就在盘上）。

```bash
# 当前会话最近 10 条用户原话（默认；自动读 $DSH_SESSION_JSONL）
python3 ~/.agents/skills/dsh-session-history/scripts/last_user.py
python3 ~/.agents/skills/dsh-session-history/scripts/last_user.py --since-min 30    # 最近 30 分钟
python3 ~/.agents/skills/dsh-session-history/scripts/last_user.py --limit 20 --full # 最近 20 条不截断
python3 ~/.agents/skills/dsh-session-history/scripts/last_user.py --injected        # 连子代理转发/插件注入一起看
python3 ~/.agents/skills/dsh-session-history/scripts/last_user.py --list ~/.dsh/sessions/--home-h-genshin-model-studio--
```

- **实测**：30MB 压缩 / 本会话 **3.3 秒**扫完返回（`zstd -d -c` 流式 + 只对命中行 `json.loads`）→ 可当开工第一步，无成本顾虑。
- **判据（关键）**：真人消息的事件形如 `{"type":"user/message","data":{"source":{"kind":"user","rpcId":"…","clientTimeZone":"Asia/Shanghai"}}}`。
  其余 `source.kind`（`plugin` / `agent-instructions` / `skill-catalog` / `agent-messaging` / `acp-nudge` / `compact`…）
  **全是注入，不是人说的话**——不过滤就会把技能目录、压缩通知、另一个 agent 的转述当成用户诉求（脚本已默认过滤）。
- **反例（必须避免）**：压缩摘要里的"[模型自写摘要 · 非用户原文]"是**我自己的复述**，义务句/验收线可能被改写；
  拿它当用户原话 = 二次失真。以 `last_user.py` 输出为准，摘要只用来定位上下文。
- **配套**：捞回原话后立刻把"未闭事项 + 用户原话逐字 + 关键数值"写进项目 `.scratch/ISSUE-BOARD.md`
  （看板是**派生物**，不是真相源；真相源永远是会话 JSONL + `git log` + 盘上文件 + 页面实拍）。

## 原则（长期进化视角）

1. **聊天记录是线索，不是最终证据**。找到的历史说法必须与当前源码、`git log`、测试、
   真实地图状态交叉验证后再下结论；历史会话可能描述旧实现或未落地的计划。
2. **先小后大**。会话文件压缩后从几 KB 到几十 MB 不等，解压后可能放大数倍；
   先扫小会话、用 `search` 定位、再深入单个文件；禁止无脑解压大文件全文。
3. **按证据链报告**。区分：会话记录（谁在何时做了什么）→ 提交（git log SHA）→
   当前源码 → 真实验证（写回/游戏反馈）。每轮结束按本技能"沉淀闭环"把新结论落盘。
4. **历史是进化的原材料**。检索的目的不是考古，而是：①补上缺失的复盘/总结 ②发现未完成的任务
   ③把已验证结论转化为长期记忆（技能/文档/知识树三层落盘）。

## 会话存储位置与格式（DSH 版）

- 根目录：`~/.dsh/sessions/`（可用环境变量 `DSH_HOME` 定位，`$DSH_HOME/sessions`）
- 每个工作目录一个子目录，命名规则与 pi 相同：路径去掉前导 `/`，`/` 和 `.` 换成 `-`，再包 `--`：
  - `/home/h/genshin-ts` → `--home-h-genshin-ts--`
  - `/home/h/star-cube-nexus` → `--home-h-star-cube-nexus--`
- 每个会话一个子目录：`<session-id>/session.jsonl.zstd`，会话 ID 形如 `session-abb8cdd4-...`
  - 目录名两种形态都存在，**都要认**：新式 `session-<uuid>`，早期为裸 `<uuid>`（如 `--home-h-genshin-ts--/81661db9-…/`）
  - 日志文件名两种形态：**v0 = `session.jsonl.zstd`**；**v3 = `session.v3.jsonl.zstd`**（DSH 0.1.5+ 写出的新格式；旧会话被打开/迁移后原 v0 文件保留、旁边可能出现 v3 文件）
  - 脚本已内置 `artifact()` 解析器（`ARTIFACT_NAMES = ("session.v3.jsonl.zstd", "session.v3.jsonl", "session.jsonl.zstd", "session.jsonl")`），无需再硬编码文件名
- **压缩格式**：zstd（非纯文本！）。系统有 `zstd` CLI（v1.5.7）；Python 无 pyzstd/zstandard 库，
  脚本通过 `zstd -d -c` 管道流式解压，**不要落盘解压大文件**（23M 压缩可能对应几百 MB 文本）
- **读另一个 agent 的会话（跨会话接力/复盘时，2026-10-16 实证）**：`scripts/search_dsh_sessions.py dialog <会话目录> --tail N`
  能列出该会话的对话，**但它会把非 ASCII 输出成 `\uXXXX` 转义序列**——模型看到的是转义码不是字，
  **别把转义码抄进报告**。两条出路：对原始文件取尾部读真实文本
  （`zstd -dc <dir>/session*.jsonl.zstd | tail -c 4000`），或把脚本输出做 `unicode_escape` 解码。
- **行结构**（每行一个 JSON 事件，与 pi 的 `{"type":"message"}` 完全不同）：
  - `{"type":"session","version":0,"id":"session-...","createdAt":<ms>,"cwd":"...","delegationDepth":0}` 会话头（createdAt 是 **毫秒时间戳**）
  - **v3 会话头**（0.1.5+）：`{"type":"session","version":3,"id":"session-...","createdAt":<ms>,"cwd":"...","isSeeded":false,"delegationDepth":0,"agentPreset":"standard"}`；事件行新增顶层 `seq` 与 `time`（如 `{"type":"session/title","seq":16,"time":1789138561778,"data":{...}}`），`data` 结构与 v0 一致，故按 `type`/`data` 解析的旧逻辑仍然有效
  - `{"type":"user/message","data":{"content":[{"type":"text","text":...}],"source":{"kind":"user"},"role":"user","id":...}}` 用户消息
  - `{"type":"assistant/message","data":{"turn":N,"step":N,"message":{"role":"assistant","content":[...]}}}` 助手消息；
    content 元素类型：`{"type":"reasoning","text":...}`（思考）/ `{"type":"tool-call","name":...,"arguments":"..."}`（工具调用）/ `{"type":"text","text":...}`（正文）
  - `{"type":"tool/call","data":{"callId":"call_...","name":"...","arguments":"{...json字符串...}"}}` 独立工具调用事件
  - `{"type":"tool/result","data":{"message":{"content":[{"type":"tool-result","toolCallId":"...","content":[{"type":"text","text":...}],"isError":false}]}}}` 工具结果（**isError 是错误定位的黄金标记**）
  - `{"type":"turn/start","data":{"turn":N}}` / `{"type":"turn/end","data":{"turn":N,"reason":{"kind":"completed"|...}}}` 对话轮边界
  - `{"type":"session/title","data":{"title":"...","source":...}}` 会话标题（scan 免解析全文）
  - `{"type":"agent/inbox/spliced",...}` 注入的消息（如插件/恢复的消息，也含用户消息内容）
  - `{"type":"session/end-seed"}` 会话收尾标记
  - 其他噪声事件（可忽略）：`permission/preset`、`sandbox/mode`、`approval/policy`、`request/header`、`request/context`、`assistant/chunk`、`reasoning-chunks`、`text-chunks`、`tool-call-chunks`（chunk 是流式中间态，最终内容在 assistant/message 里）、`step/start`、`step/end`、`session/title-llm-request`
- **当前会话隔离**：环境变量 `DSH_SESSION_ID`、`DSH_SESSION_JSONL` 指向当前正在写入的会话；
  回溯过去来源时先排除它，否则刚执行的 status/diff 会伪装成历史证据。

## ⚠️ 升级到 DSH 0.1.5+ 后的老会话可读性（2026-09-11 实测）

0.1.5-rc.2 的迁移 worker（`dsh-session-persistence-jsonl/lib/worker.cjs`）会**拒绝**两类 v0 日志，
报 `SessionFormatUnsupportedMigrationError`，且**原 v0 文件保持不变**（`source v0 artifact remains unchanged`）：

```js
if (event.type === "subagent/descriptor" && data["version"] !== 3) { ... throw ... }
```

- **含 `subagent/descriptor` 且 version ≠ 3 的老会话**（本机 540 个 v0 会话中 147 个，占 27%，全是子代理会话）
  → 在 DSH 0.1.5+ 里**打不开、不能续聊**（`agent_list` 仍会列出它们，`agent_send` 恢复时失败）。
- 迁移前还会校验"历史事件类型必须在冻结的 v0 清单内"，未知类型同样拒绝迁移。
- **对检索无影响**：本技能直接读原始文件，不做迁移；实测这些 v0 文件照样 `scan/search/show/last_user` 正常。
  即：**内容不丢，丢的是"在 GUI 里打开/续聊"**。升级前若要保住可续聊性，只能在旧版本里逐个恢复后重存。

## 检索流程（配套脚本 scripts/search_dsh_sessions.py，**v3.1 提速版 2026-09-12**）

> 🚨 **v3 事故复盘（用户 2026-09-10 纠偏："你这么搜索，刚刚差点卡死了！！！"）**
> 1. **禁止无过滤全库扫描**：本机 `~/.dsh/sessions`（2026-10-15 实测 **97 会话 / 93MB** 压缩；事故当年是 300+ 会话 / 1.2GB）；v2 默认 `--jobs 8`
>    全量并行解压 = 一次自造的 IO/CPU 风暴（本机为 **16 核 / 15GB · Arch Linux**；事故当年那台是 8 核 7.9GB 的 WSL2——规格不同，结论不变）。
>    v3 起：**默认只扫最新 10 个**（`recent`/`dialog` 默认最新 3 个），jobs 默认 2，总预算默认 150MB，
>    全程 `nice -n 19 ionice -c3` 降级。要更大范围必须**显式**给 `--since-min`/`--newest`/`--all`。
> 2. **关键词搜"活动"，不搜"症状"**：历史会话记录的是**模型干了什么**（命令/工具名/路径/报错串），
>    不是系统症状。搜 `OOM|卡顿|很卡|卡死` 必然空手——要搜 `filter-branch`、`git push`、`npm run build`、
>    `docker`、`ensure-edge.sh`、`zstd -d -c`、`playwright|msedge`、`find /`、`tar` 这类**重型动作**。
> 3. **入口分两问（v3.1 定案）**：问「**最新对话说了什么**」（用户要什么/模型答了什么）→ `dialog`；
>    问「**模型当时在跑什么活动**」（命令/报错/机器为什么卡）→ `recent`。都不是 `search` 全库。
> 4. **作用域永远可见**：每次输出都打印 `[scope:cmd] 实际扫描 N 个会话 | notes`——
>    "没命中"必须能区分**真没有** vs **没扫到**（默认截断会伪装成不存在）。

> v3.1 提速（用户 2026-09-12 痛点："一扫好几分钟 / 要更快拿到最关键信息"）实测：
> ① `scan` 旧版冷缓存 = 全项目解压（本项目 165 会话/285MB，>90s 未完成）→ 现默认只索引
> mtime 最新 30 个 + 跳过 >25MB 怪物，**冷缓存 3.2s**；② 旧版 scan 按 created 排序（今天活跃的
> 老会话排不到前排）→ 现按**最后活动**排序；③ `recent` 输出先给「速览：最后一条 U / 最后一条 A」，
> 不用在工具噪声里翻；④ 新增 `dialog` 一条命令拿最新人机对话（实测含 18.8MB 会话 1.5s）。
> v2 性能备注：scan 首次建索引（全量）约 1 分钟，之后毫秒级；加速原理：①噪声行纯字节跳过
> ②并行（索引 ProcessPool / 搜索 ThreadPool，上限 2）③增量索引缓存（mtime+size 失效）
> ④正则先在原始行上跑（C 速度），**命中行才 json.loads** ⑤最新优先 + 总量预算封顶
> ⑥nice/ionice 让检索永远不跟用户抢 CPU/IO。

```bash
# 0. 定位会话根（默认 ~/.dsh/sessions，DSH_HOME 生效）——毫秒级
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py dirs
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py dirs /home/h/genshin-ts

# 0a.【首选①】最新人机对话速览（v3.1 新增）——"最新对话说了什么/用户最后要什么/模型最后答什么"
#     只列真人原话(U)+助手正文(A)，零工具噪声；默认最新 3 个会话各最后 8 条；--tail K / --grep / --full
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py dialog ~/.dsh/sessions/--home-h-genshin-ts--
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py dialog <单个会话目录> --tail 12
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py dialog ~/.dsh/sessions --grep "窗外世界" --tail 5

# 0b.【首选②】最新大模型活动时间线——"模型刚刚在跑什么/机器为什么卡"；头部自带速览(最后U/A)
#     默认只解压最新 3 个会话 | --since-min 分钟窗 | --newest N | --grep 过滤 | --full 全量 | --max-lines 尾部条数
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py recent ~/.dsh/sessions --since-min 120 --max-lines 25
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py recent ~/.dsh/sessions --newest 4 \
  --grep '(ensure-edge|page-probe|page-shots|npm run|docker |zstd -d -c|playwright|msedge|find /|tar |rm -rf)'
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py recent <单个会话目录> --max-size 50

# 1. 会话全景（v3.1：**按最后活动排序**；默认只索引/显示最新 30 个 + 跳过 >25MB，冷缓存秒级；--all 全量）
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py scan ~/.dsh/sessions/--home-h-genshin-ts--
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py scan <会话目录> --limit 10

# 1b. 显式建/重建索引（scan/todos 自动增量补；--rebuild 只强制重扫作用域；删缓存文件即重置）
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py index ~/.dsh/sessions/--home-h-genshin-ts--

# 2. 关键词搜索（正则；**搜活动不搜症状**；--since-min/--newest/--max-size/--budget-mb 收紧作用域）
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py search "static-assemblies" ~/.dsh/sessions/--home-h-genshin-ts-- --max-hits 20
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py search "zstd -d -c|sleep 150" <会话目录> --context 300
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py search "造物|客户端计算" <会话目录> --context 400
# ⚠ 默认只扫最新 10 个会话；要跨全库必须显式：--since-min 10080（7 天）或 --newest 50 或 --all

# 3. 深入单个会话：按时间顺序浏览消息序列（U 用户 / A 助手 / C 工具调用 / R 结果 / R[ERROR]）
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py show <会话目录> --tail 20
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py show <会话目录> 0 50

# 4. 错误定位：isError=true 的工具结果清单（同 scope 护栏）
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py errors <会话目录或目录> --since-min 1440

# 5. 未完成任务检测（走索引，秒级）：turn 中断 / 无 end-seed / 尾部停在工具调用
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py todos ~/.dsh/sessions/--home-h-genshin-ts--
```

### 作用域参数（v3.1，所有扫描类命令通用）

| 参数 | 含义 | 默认 |
|---|---|---|
| `--since-min M` | 只扫最近 M 分钟内活动过的会话（**首选**，最贴近"刚刚/今天"） | 关 |
| `--newest N` | 只扫最新 N 个会话 | dialog/recent=3 / search=10 / **scan/todos=30** |
| `--all` | 全量（危险模式，脚本会打印警告） | 关 |
| `--max-size MB` | 单会话压缩体积上限，跳过怪物会话 | **scan/todos=25**（其余关） |
| `--budget-mb MB` | 扫描总量预算，按新→旧累加封顶 | 150 |
| `--jobs N` | 并行度 | 2 |

**判据（怎么算用对了）**：① 每条命令都带时间窗或 `--newest`；② 输出第一行的 `[scope:...]` 与实际
意图一致；③ 全程 `nice/ionice` 降级（脚本内置）④ 单次调用不把机器 load 推起来——用完可 `cat /proc/loadavg` 自查。

### 维护：归档旧的巨型会话（v3 配套工具 scripts/archive_old_sessions.py）

> 🔴 **破坏性操作纪律（2026-09-10 事故，用户震怒："这么危险的操作，不和我商量就执行了？"）**
> 模型曾以"用户说了执行"为由，**一次搬走 64 个会话 / 580MB**，其中包括**用户最重要的项目**（genshin-ts
> 全项目 166 个会话）。三条铁律，任何一条都不得再犯：
> 1. **授权分级**：「执行」这类宽泛授权只覆盖**可回滚的系统配置**（unit/cgroup/环境变量），
>    **不覆盖数据搬移、删除、重写**——后者**永远逐项征得真人点头**，无论授权措辞多宽。
> 2. **闲置 ≠ 废弃**：不能用 mtime 推断重要性。用户最重视的项目恰恰最"久没动"（长跑任务收尾后自然安静）。
> 3. **先给可回滚清单 + 影响预览**：明确说"这一步会让以下东西从你视野里消失"，等回答再动。
>
> **工具侧硬闸**：`--apply` 必须与 `--project <精确项目目录名>` 同用，一次只搬一个点名的项目——
> 干跑清单要**先交真人过目**，再逐项目执行。

`~/.dsh/sessions` 是 IO 地雷区（2026-09-10 时 302 会话 / 1.2GB，其中 60% 是久不活跃项目的陈年会话）。
**收拾它只有一条安全路径——整体搬目录**：

```bash
# 干跑（默认，绝不改文件）：idle>12h 且 ≥5MB 的会话
python3 ~/.agents/skills/dsh-session-history/scripts/archive_old_sessions.py --idle-hours 12 --min-size-mb 5
# 执行 → 搬到 ~/.dsh/sessions-archive/<项目>/<会话>/（文件不动，可一条命令还原）
# ⚠ --apply 必须点名一个项目；干跑清单先交真人过目
python3 ~/.agents/skills/dsh-session-history/scripts/archive_old_sessions.py --project --home-h-xxx-- --idle-hours 720 --min-size-mb 5 --apply
# 还原
python3 ~/.agents/skills/dsh-session-history/scripts/archive_old_sessions.py --restore [--match genshin-ts]
# 归档目录照样可检索（当普通 root 用）
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py recent ~/.dsh/sessions-archive --newest 3
```

> 🚫 **绝对不要用"删事件"给会话瘦身**（我 2026-09-10 设计过这个方案，被代码否掉）：
> `dsh-session-persistence-jsonl/lib/index.js:333` 硬校验事件 `seq` 必须从 0 连续——
> `corrupt session log: seq gap in committed region` → 缺口之后的历史全部作废。
> 而 chunk 事件里的 `block-end` 携带**完整推理正文**（不是可有可无的增量）——删了就是毁证据。

**安全边界**：当前会话永不入选（读 `$DSH_SESSION_JSONL`）；只搬 idle 窗口外的；默认干跑。


缓存：按序探测 `~/.cache` → `$DSH_HOME/.cache` → `/tmp` 下的 `dsh-session-history/index.json`
（只读环境自动降级 /tmp，功能不变只损失持久化）。当前会话自动排除。单文件解压预算自适应
（10s + 1s/MB 压缩，封顶 60s），个别怪物会话不拖垮全局。

### 用户原话优先（意图提取最快路径）

历史里的 assistant 总结可能已经改写了用户的原意。先提取 `user/message` 中的目标、约束、
验收标准和未决问题，再读取 assistant/tool 事件补齐证据；不要用 assistant 的复述替代用户原话。
`scan` 只输出 user 消息即为这一原则的落地。

## 长期进化增强能力（超越 pi 版的核心价值）

### 1. 错误自动定位（isError）
`tool/result` 的 `isError:true` 是模型犯过错误的最可靠标记（含 ToolCallError、脚本失败、断言失败）。
`errors` 子命令直接产出清单：哪一步、什么工具、什么报错。复盘时按"错误→修复→沉淀"闭环处理，
已修复的结论要转化为技能/文档/知识树规则，防止同类错误复发。

### 2. 思考链提取（reasoning）
`assistant/message` 里的 `{"type":"reasoning"}` 是模型的完整思考过程（可能很长）。
看"模型当时为什么这么做/卡在哪"时优先读它；但要区分思考与结论——思考是过程，正文+工具结果才是行动证据。

### 3. 未完成任务追踪（todos）
会话可能因上下文中断、切换任务而留下未完成事项。判据：
- `turn/end` 的 `reason.kind` 不是 `completed`（中断/错误终止）
- 会话尾部（最后几条）没有明确的结论性 assistant 正文（如"已完成/下一步是X"）
- 会话中出现"先做A，再做B"但只有 A 的落盘记录
发现未完成任务后，在**当前会话**中补齐（技能迭代/文档更新/知识树录入），这是"说了≠做了"的直接反例来源。

### 4. 沉淀闭环（检索→验证→三层落盘）
检索出有价值结论后必须走完沉淀闭环，否则检索就只是考古：
1. **交叉验证**：git log SHA → 当前源码 → 测试 → 真实地图状态，确认结论仍成立
2. **三层落盘**：技能（`.agents/skills/`）→ 权威文档（`docs/`）→ 知识树（PKC：`python tools/pkc.py`）
3. **反推验证**：一年后回看，能否从这些落盘中想起当时的决策？落盘粒度要够（含失败案例与反例）
4. **变更归因**（继承 pi 版）：用户问"哪次会话改了这些文件"时，分三层证据：
   直接修改（该会话的 edit/write）→ 旁观记录（只看 status/diff）→ 已提交（git show 复核）；
   无法闭合就报告"来源不确定"，不要猜。

## 交叉验证清单

找到线索后，按以下顺序确认能力现状：

1. `git log --oneline --all | grep -i <关键词>` 找实现提交
2. 读当前源码确认命令/配置类型仍存在
3. 有测试就跑 focused 测试
4. 涉及真实地图的结论，确认当前地图状态（可能已被覆盖）

## 陷阱（DSH 版特有）

- **必须 zstd 解压**：文件是 `session.jsonl.zstd`，直接 grep/read 会得到二进制乱码；脚本内部已流式解压，外部操作要用 `zstd -d -c`
- **时间戳是毫秒**：`createdAt`/事件 `time` 是 epoch 毫秒（如 1786685488006），脚本已换算为本地时间（+8h）；手工解析时记得 /1000
- **大文件**：压缩 23M 的会话解压后可能几百 MB 文本；`search` 按行流式匹配不会爆内存，但 `show` 全文要加 --tail/行数限制
- **chunk 事件是中间态**：`assistant/chunk`、`reasoning-chunks`、`text-chunks`、`tool-call-chunks` 是流式增量，最终完整内容在 `assistant/message` / `tool/call` / `tool/result` 里；检索时忽略 chunk 避免重复与碎片
- **arguments 是 JSON 字符串**：`tool/call` 的 `arguments` 字段是字符串形式的 JSON（`"{...}"`），解析时需 `json.loads` 二次解析
- **注入消息**：`agent/inbox/spliced` 里的 content 也可能是用户消息（如恢复/插件注入）；scan 时一并纳入 user 摘要
- **当前会话排除**：`$DSH_SESSION_JSONL` 指向当前正在写入的文件，检索过去来源时先排除
- **工作区目录名以 `--` 开头**（2026-10-15 实证两次）：`ls "--home-h-…"` 会被当成选项报「未识别的选项」，`cd` 同理——一律加 `./` 前缀（`ls -t ./--home-h-…--/`）或用 python `os.listdir`；本技能脚本把目录作为 argv 传入不受影响
- **不同会话可能对同一能力有不同说法**：以时间最近 + 有提交/源码佐证的为准
- **会话文件仍可能在写入**：看到自己正在执行的会话内容属正常

## 与其他技能/工具的关系（长期进化体系定位）

- 检索到历史 → 用 `gil-node-graph-reading`/源码交叉验证 → 用 `skill-creator` 迭代技能 → 用 PKC（`pkc-project-operator`）录知识树
- 复盘会话时配合 `task-trace-review`（子代理 trace 分析）与 `debug-log-investigator`（游戏日志证据）
- 本技能是"长期进化记忆底座"：pi 版服务 pi 环境，本版服务 DSH 环境；两者检索到的结论最终都汇入同一套知识沉淀体系
