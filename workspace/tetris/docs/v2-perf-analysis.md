# Tetris v2 执行性能分析（2026-10-27 15:15-19:00，近 4 小时之因）

> 状态：性能分析报告（perf-analyst 队友产出，2026-10-27 晚）
> 数据源：DSH 四个会话的 session.v4.jsonl.zstd 事件流全量解析（毫秒时间戳），非人工估计。
> 复算入口：`python3 workspace/tetris/docs/v2-perf-analysis.py`（脚本自包含：解压→配对→分桶，输出与本文一致的表）。

## TL;DR（top3 结论）

1. **串行尾部 + 波次编排缺陷是挂钟大户**：17:22-18:48 共 86min（占任务挂钟 217min 的 **39.6%**）只有 modes-arch 一个代理在跑 T0/T6/T7，core-mechanics 同时闲置 85min；modes 在 15:50-17:22 还有 **92min 空窗**（T0 被排在波 2，前置工作做完没活可领）。两段合计浪费 1 人时 3 小时，是「近 4 小时」的第一因。
2. **全量 runner 验证循环是尾部 41% 的耗时**：28 用例后每次全量 245-290s；modes-arch 尾部以**后台 job 形式跑了 9 次全量 = 35.2min**（`job_output` 等待实测 237-290s/次）。对比 core-mechanics 的**选择性跑法**（`runner.mjs <用例名>`）30 次调用 avg 仅 **5s**——同一个 runner，两种用法差 **52 倍**。
3. **模型生成占四代理人时的 27%**（207min）：工具执行只占 15%（110min）。core-mechanics 生成:实工具 = 74.5:12.3 ≈ **10:1**（重思考轻执行）；lead 的 186.9min 工具时间中 94% 是 `wait_agent` 等队友（31 次，12+ 次打满 900s 超时）。

**量化潜力**：三项流程修正（runner 分片 + T0 提前解锁 + 尾部双代理并行）合计可把同类任务挂钟从 217min 压到 **~150min（-30%）**，不换任何模型。

---

## 一、四代理耗时分布表

### 1.1 会话定位（复算用）

| 代理 | 会话目录（`~/.dsh/sessions/--home-h-genshin-ts--/` 下） | 创建 | 最后活动 |
|---|---|---|---|
| lead（主会话） | `session-4b71d96c-01ca-4c27-bdd0-a776c1cf595a` | 14:50 | 18:51 |
| core-mechanics | `0d4c9b47-7e18-415b-852b-ef99b101d901`（裸 uuid，origin:subagent，parentSession=lead） | 15:21 | 18:53 |
| ai-driver | `cdddbd89-460a-4306-bb17-56286f11fdf3` | 15:21 | 17:23 |
| modes-arch | `cc2f390b-e749-4d26-9181-08ff2c2e40da` | 15:21 | 18:48 |

### 1.2 分布表（单位 min；「生成」= assistant 消息到达间隔即模型思考/写作；「实工具」= 排除 wait_agent/ask_user_question 的工具执行）

| 代理 | 挂钟 | 模型生成 | 实工具执行 | 等待/闲置（等 lead 或等解锁） | 工具调用数（错误数） |
|---|---|---|---|---|---|
| lead | 240.9¹ | 23.0 | 1.5 | wait_agent **175.2**（31 次）+ ask_user 11.7（等用户三裁决） | 140（14） |
| core-mechanics | 211.9 | **74.5** | 12.3（bash 7.0/166 次） | **120.6**（17:23-18:48 空窗 84.8 + 16:46-17:22 等裁决 35.8） | 342（17） |
| ai-driver | 122.1 | 49.0 | **51.2**（bash 47.8/85 次） | 19.0（15:49-16:08 等派活） | 193（10） |
| modes-arch | 206.8 | 60.8 | **45.3**（job_output 35.2/9 次 + bash 9.6/156 次） | **98.5**（15:50-17:22 空窗 92.2 + 碎片 6.3） | 330（13） |
| **四代理合计²** | **757** | **207.4（27%）** | **110.0（15%）** | lead 等待 186.9（25%）+ 队友闲置 238.1（31%） | 1105（54，错误率 4.9%） |

¹ lead 含 14:50-15:14 的 24min 前置（longtask-dossier 例行），任务窗口实际从 15:14 收任务书起算 ≈217min。
² 合计已扣除 lead 前置 24min；四类之和 742.7min，余 ~14min 为 turn 内碎片间隙。

### 1.3 实工具执行 110min 的构成

| 类别 | 人时 | 证据 |
|---|---|---|
| runner 全量验证（≥100s/次） | **45.6** | modes job_output 9 次×237-290s=35.2 + ai 全量 2 次（248s/180s 档）+ core 全量若干（12 用例时代全量仅 ~2-28s，未成瓶颈） |
| T5 校准探针（模拟器内跑块） | **~28** | ai-driver `probe` 10 次 avg 63s + 4 次 255-275s 的 python heredoc 实验脚本 |
| build.mjs + lua5.3 语法门 | 5.2 | 合计 22 次，avg 7s——**不是瓶颈**（任务书预估偏高） |
| 其余 bash/read/edit/grep 等 | ~31 | 读写编辑与 git 操作 |

### 1.4 挂钟时间线（任务 217min 怎么花的）

| 时段 | 时长 | 状态 |
|---|---|---|
| 15:14-15:21 | 7min | lead 读档案、写任务书、spawn 三队友 |
| 15:21-16:46 | 85min | **满并行窗口**：core 串行做 T1→T2→T3→T8，ai 做 T4 后进 T5 校准；modes 15:50 前做完 T0 前置收表后**闲置**（15:31-15:43 lead 等用户三裁决 11.7min 与此并行） |
| 16:46-17:22 | 36min | **裁决/波次空窗**：core T8 完、ai T5 收尾；只剩 lead 在 wait_agent（16:47 起打满 900s×2） |
| 17:22-18:48 | **86min（39.6%）** | **串行尾部**：modes 独跑 T0→T6→T7（其中 9 次全量 runner job 占 35.2min=尾部的 41%）；core 闲置 85min、ai 已收工 |
| 18:48-18:51 | 3min | 收尾归档 |

---

## 二、慢因归因（量化排序）

### 按「对挂钟的贡献」排（用户体感）

1. **波次编排缺陷 + 串行尾部：122min（56%）**
   - T0（双屏地基）排在波 2，但它的前置（收表/机械收编）15:50 就做完了 → modes 空窗 **92min**；
   - T6/T7/T-spin 尾部全压给 modes 单代理（86min），core 的 85min 闲置本可吸收 T7（垃圾行与模式机制在 main.lua 不同函数区，先例：T5/T8 用「隔离调子」实现零冲突并行）。
2. **全量 runner 验证循环：挂钟贡献 ≈40min**（尾部 35.2min + ai 7.9min 部分）
   - 每次全量 245-290s ×9 次；若按受影响面选择性跑（core 实测 avg 5s）+ 仅 commit 前跑一次全量，尾部可省 **~30min**。
3. **模型生成 207 人时分钟（27%）**：见 TL;DR-3。这是四人时中最大单项，但受模型/档位约束，优化靠路由（见插件）与减少步数（分片跑减少「跑→看→再跑」往返）。
4. **T5 探针 ~28min**：并行窗口内、非关键路径（不直接加挂钟），但占用了 ai-driver 的大半活跃时间。降轮次/复用固定种子基线可省。
5. **lead wait_agent 900s 粒度**：31 次中 12+ 次打满 900s——事件静默期 lead 平均多睡 ~7min/次。16:46-17:22 的裁决空窗与此叠加。
6. 工具错误 54 次/1105（4.9%）：重试损耗存在但非主导。

### 反直觉发现（推翻任务书两条预估）

- **「build ~10s」不成立**：22 次 build+lua 门合计仅 5.2min，avg 7s——不是瓶颈。
- **「~20 次 commit/验证轮、每次全量 268-292s」只对了后半**：runner.mjs 调用合计 57 次（core 30/ai 9/modes 18），其中真全量（≥100s）仅 ~11 次——core 早就自发改用了选择性跑法；慢在 modes 的 9 次后台全量 job。

---

## 三、插件推荐（均已抓 README 验证；未验证不推荐）

### ① HapyRain/dsh-router-laya ⭐27 —— 思考档自动路由（命中慢因#3：模型生成 27%）

- **能力（README 证据）**：对无明确档位指令的消息自动选 thinking 档（low/high/max）；本地 842MB 微调分类模型 CPU 推理 **<1s**；README 附 120+ 次对照实验：简单任务 low 档 96% 成功、15 任务连吃 low 档 42% 翻车→升档后 17%；DeepSeek V3.2 thinking-budget 机制、o3-mini 分档、《Thoughtology》预算饱和曲线为理论依据。
- **安装**：`npm i -g dsh-router-laya && npx dsh-router-laya setup`（setup 建 venv、下 846MB checkpoint、起判定服务，然后按打印的 snippet 在 profile 注册插件行）。
- **风险**：需 Python venv + 846MB 模型；README 主打交互会话（输入栏档位芯片），对 teammates 子会话是否生效需装后实测一条验证。

### ② SeverusZh/dsh-plugin-subagent-director ⭐22 —— 子代理级模型选择（命中慢因#3 的多代理形态）

- **能力（README 证据）**：为 subagent 指定 provider/model + 角色模板（职责+可选 preset+可选模型绑定）；四级回退链（单次调用参数 > 角色绑定 > 插件默认 > 继承主代理）；只从官方 `subagent-model-selection` 的 `allowedModels` 授权列表选、不与官方双重写路由；配置热更新；`close_subagent` 释放驻留子代理。
- **用法对本例**：core-mechanics 这类「机械执行+轻决策」角色可绑定快模型/低档，lead 保留强模型——直接砍「重思考轻执行」代理的生成时间。
- **安装**：`dsh plugin --profile <name> add dsh-plugin-subagent-director`（npm 发布版含构建产物，开箱即用）。

### ③ toolclub/dsh-agent-team-gui ⭐283 —— 可复用团队 + 有界 DAG（命中慢因#1：编排）

- **能力（README 证据）**：团队作为可复用对象（每成员独立 model/工具策略）；对话内模型动态按当前请求分派任务与依赖；有界 DAG、重试、质量门、后台运行；官方 provider 口径 Token 用量观测；v1.3.0。
- **注意**：版本窗口 `>=0.1.5-rc.1 <0.1.6-0`（装前核对 `dsh --version`）；本次任务用的内置 Agent Teams 已够用，此插件是编排增强/替代，迁移有成本——**先修流程（见四）再考虑换工具**。
- **安装**：见 README（Web profile 插件市场）。

### 反结论（搜过、无货，别再找）

- **「bash 缓存/命令去重」「工具批处理/并行工具」**：3 组关键词（parallel tools tool batching / bash cache command caching / speculative decoding inference proxy）扫 topic:dsh-plugin 1000 仓均无直接命中——**DSH 生态暂无现成的工具往返优化插件**，这块只能靠流程（分片跑、减少全量次数）。
- 「context compression/session speed」：dsh-session-manager（⭐99）是会话管理 UI（含压缩阈值设置）非提速件；powercontext（⭐1378）非 DSH 插件。

---

## 四、流程优化建议（我们自己可控，按收益排）

1. **runner 选择性跑 + 单次全量门**（省 ~30min 挂钟）
   - 规则：改哪个任务跑哪组用例（`node qxqy/runner.mjs 16-hold 17-lock …`，core 已在用）；**仅 commit 前跑一次全量**。
   - commit 拆分流程（备份混合态→checkout→重放→验证→commit→恢复→再验证）的双全量改「重放后只跑受影响面 + commit 前 1 次全量」。
2. **T0 提前解锁**（省 ~25-30min 挂钟）：T0 收表前置与 T1-T3 无依赖，波 1 即可派给 modes——把 15:50-17:22 的 92min 空窗填上，尾部相应缩短。
3. **尾部双代理并行**（省 ~20min 挂钟）：T6（四模式）与 T7（垃圾行）函数区不同，仿 T5/T8 先例先定接口隔离带，双代理并行；T-spin 正向用例（挂波 3 尾的那个）与 T0 参数化后的 board 注入一起做。
4. **T5 探针降本**：固定种子基线快照复用 + 轮次 减半 + 后台 job 化（modes 的 job_output 形态），~28min → ~12min。
5. **wait_agent 超时 900s→240s**（或 lead 在等待窗口穿插档案/复盘任务）：裁决空窗 36min 里 lead 平均多睡 ~7min/次； teammates 的 `agent-status` 变更会提前唤醒，缩短超时只影响静默期。

---

## 附：复算命令

```bash
# 1) 定位会话（两种形态都要认：session-<uuid> 主会话 + 裸 <uuid> 子代理）
ls -t ~/.dsh/sessions/--home-h-genshin-ts--/ | head -12
# 2) 全量解析（本文所有数字的来源；脚本已入库）
python3 workspace/tetris/docs/v2-perf-analysis.py
# 3) 抽查单条 top 工具调用（例：modes 的 9 次全量 job）
zstd -dc ~/.dsh/sessions/--home-h-genshin-ts--/cc2f390b-e749-4d26-9181-08ff2c2e40da/session.v4.jsonl.zstd \
  | grep '"tool/call"' | grep -c 'runner.mjs'   # → 18（bash 直跑，另 9 次为后台 job 由 job_output 等待）
```

口径注：生成时长=assistant/message 与前一实质事件（tool/result、user/message、turn/start、inbox）的到达间隔（<1h 截尾）；工具时长=tool/call→同 callId 的 tool/result（callId 在 `data.message.toolCallId`）；闲置=turn/end→turn/start 间隙（含 >1h 大空窗单列）；DSH 的 turn 为长跨度语义（子代理一个 turn 可跨 2h+），故「等 lead 指令」以 turn 间隙+inbox 到达前间隙度量。
