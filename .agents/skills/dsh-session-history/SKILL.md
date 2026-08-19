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
- **压缩格式**：zstd（非纯文本！）。系统有 `zstd` CLI（v1.5.7）；Python 无 pyzstd/zstandard 库，
  脚本通过 `zstd -d -c` 管道流式解压，**不要落盘解压大文件**（23M 压缩可能对应几百 MB 文本）
- **行结构**（每行一个 JSON 事件，与 pi 的 `{"type":"message"}` 完全不同）：
  - `{"type":"session","version":0,"id":"session-...","createdAt":<ms>,"cwd":"...","delegationDepth":0}` 会话头（createdAt 是 **毫秒时间戳**）
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

## 检索流程（配套脚本 scripts/search_dsh_sessions.py）

```bash
# 0. 定位会话根（默认 ~/.dsh/sessions，DSH_HOME 生效）
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py dirs
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py dirs /home/h/genshin-ts

# 1. 扫项目会话全景：每个会话的 标题 + 时间 + user 消息摘要（判断哪次会话相关，免解压全文）
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py scan ~/.dsh/sessions/--home-h-genshin-ts--

# 2. 关键词搜索（正则；自动流式解压；小文件优先；--context 控制片段长度）
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py search "static-assemblies" ~/.dsh/sessions/--home-h-genshin-ts-- --max-hits 20
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py search "structureFile" <会话目录> --context 400

# 3. 深入单个会话：按时间顺序浏览消息序列（user/assistant 正文 + 工具调用概要 + 思考片段）
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py show <会话目录> --tail 20
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py show <会话目录> 0 50

# 4. 【新增】错误定位：列出会话中所有 isError=true 的工具结果（模型犯过的错误的第一手清单）
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py errors <会话目录或目录>

# 5. 【新增】未完成任务检测：找出 turn/end reason 非 completed、或会话尾部没有结论的会话
python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py todos ~/.dsh/sessions/--home-h-genshin-ts--
```

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
- **不同会话可能对同一能力有不同说法**：以时间最近 + 有提交/源码佐证的为准
- **会话文件仍可能在写入**：看到自己正在执行的会话内容属正常

## 与其他技能/工具的关系（长期进化体系定位）

- 检索到历史 → 用 `gil-node-graph-reading`/源码交叉验证 → 用 `skill-creator` 迭代技能 → 用 PKC（`pkc-project-operator`）录知识树
- 复盘会话时配合 `task-trace-review`（子代理 trace 分析）与 `debug-log-investigator`（游戏日志证据）
- 本技能是"长期进化记忆底座"：pi 版服务 pi 环境，本版服务 DSH 环境；两者检索到的结论最终都汇入同一套知识沉淀体系
