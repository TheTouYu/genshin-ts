# 2026「一轮出好项目」提示词特征分析报告

> **研究问题**：2026 年的大模型已经很强。想要模型**单轮（one-shot）就做出效果不错的完整项目**，提示词有什么讲究？
> **方法**：抓取人类测试/使用大模型沉淀的真实提示词语料，做量化统计与多维度编码。一手语料：① OpenAI 官方 `gpt-5-coding-examples` → with-logic/model-arena 多模型对比的 **51 条**单轮生成提示词（GPT-5/Claude/Gemini/Kimi 均用同一提示词单轮生成完整应用）；② XSCT Bench（中文场景化评测）**181 条网页生成用例 × Basic/Medium/Hard 三级**同题递进语料；③ 单提示词产出 7,145 行 3D 游戏的开源项目 TIDEWRIGHT；④ CNET 三模型横向实测（2026-03）；⑤ GPT-5 prompting guide（OpenAI 官方）；⑥ Anthropic prompt engineering 官方最佳实践。

---

## 0. 一句话结论

**模型不缺能力，缺的是"什么算好"的信息。** 能让模型一轮出好项目的提示词，本质是把**决策点（交付形态、范围、验收标准、技术边界、审美方向）全部替你锁定**——单轮模式下你无法中途纠偏，所以凡是你不锁定的决策点，模型都会用"训练分布里的平均数"替你决定，而平均数往往平庸。所有高分语料都是"决策点密度"高、语言质量无关紧要的文本。

---

## 1. 核心数据与证据

### 1.1 语料统计（本文档一手统计，口径见附录）

| 语料 | N | 平均长度 | 关键特征出现率 |
|---|---|---|---|
| **arena 官方语料**（英文，OpenAI 官方示例 + 多模型实测） | 51 条 | 60 词 / 379 字符（最短 85 字符） | 锁定交付形态 48/51（**94%**）；列表/分节结构 41/51（**80%**）；UI 氛围指令 35/51（**69%**）；验收式标准 19/51（37%）；内置演示数据 9/51（18%）；参照物锚定 7/51；视觉参数（px/ms/色值）**0/51** |
| **XSCT-W 中文语料**（181 条用例 × 三级难度） | 543 条提示词 | Basic 平均 581 字符 → Medium 827 → Hard 1194 | 机制数值 147/180（**82%**）；视觉/时序参数 132/180（**73%**）；所有用例锁定单文件交付形态 |

**统计发现**：英文官方流派走"机制 + 审美氛围 + 验收语言"（几乎不给像素参数，靠模型的审美先验）；中文评测流派走"工程参数全锁死"（px/ms/色值/概率全给）。两条路线都能让多模型一轮通过评测——共同分母是**交付形态、分节结构、验收标准**，而非细节总量。

### 1.2 模型差异 vs 提示词差异（2026 年最关键的实证）

- **CNET 实测（2026-03-05，Blake Stimac）**：用同一个"epic prompt"让 Gemini 3 Pro、免费版 ChatGPT、Claude 分别单轮重建同一应用（Tome Reader，单 HTML 电子阅读器：TTS 朗读 + 实时高亮 + 按内容分类背景音乐 + 触发词音效），结论原话：*"the model didn't matter as much as the prompt"*、*"I was unable to distinguish differences in performance or function between the app created by Gemini 3 Pro versus the free versions of ChatGPT or Claude"*。附带的教训：提示词未指定的决策点（触发词音效每句触发几次），Claude 会自作主张"每句一次防止打扰用户"——**未锁定的决策点模型必自行补全，且不一定合你意**。
- **model-arena**：GPT-5 家族 / Claude Opus/Sonnet/Haiku / Gemini / Kimi 在**同一批 51 条提示词**下全部能单轮生成可运行应用（single-shot, no manual editing）→ 下述特征对主流模型是**通用**的。
- **XSCT Bench**：多 Judge（Claude/Gemini/Kimi 按 50/30/20 加权）对同一提示词的多模型产物自动打分，评测方法论开源（评分与被测分离：requirements/criteria 只给裁判、不给被测模型）。

### 1.3 "一轮"的两种形态（先分清你要哪种）

| 形态 | 例子 | 提示词角色 |
|---|---|---|
| **单响应产出**：一次回复给出完整可运行产物 | arena 51 条、XSCT 181 条 | 提示词即全部规格（本文重点） |
| **单指令长跑**：一句话启动 agent 自主干 7 小时 | TIDEWRIGHT（Claude Opus 5，单条提示词 → 7 h 47 m、2,596 轮、7,145 行、**0 依赖**） | 提示词锁方向/标准/边界，其余授权模型自主 |

TIDEWRIGHT 原始提示词（原文照录，注意语法破碎但信息密度高）：

> *"Create me a fully playable release-ready game. On GPU. Game about sandcastle simulator, where I can build things with sand and etc. I need it in 3D and not a voxel game. Make it with maximum effort, show me best what you can create. Use all your power, knowledge and make best graphics and best game design. Surprise me with graphics, lore and everything."*

一句话里锁定了 **5 个决策点**：完成度标准（release-ready / fully playable）、技术路线（GPU）、排他项（3D **not** voxel）、努力档位（maximum effort）、创意授权（surprise me）。产出 7,145 行 WebGL2 + GLSL，0 依赖。

---

## 2. 样本库精选（原文 + 点评）

### A. 极简高授权型（<100 词：交付形态 + 锚点，其余交给模型）

- **Tic Tac Toe**（arena，126 字符）：
  > Create a single-page app, in a single HTML file: a Tic Tac Toe game that is Roman Empire themed, fully responsive, and modern.
  点评：交付形态一句锁死；"Roman Empire themed" 用模型先验做审美锚点（省去整段美术描述）；"fully responsive, modern" 是验收词。

- **OpenAI.fm inspired**（arena，85 字符，最短样本）：
  > Create a single-page app in a single HTML file that is inspired by https://openai.fm/
  点评：**参照物 URL 锚定** = 一句话顶一段规格（模型见过该站点，知道其交互与质感）。验证了"锚定 > 描述"。

- **Espresso 落地页**（arena，453 字符）：
  > …landing page for a service that provides… $200/month subscription… equipment rental and coaching for coffee roasting… target audience is a bay area middle-aged person who might work in tech and is educated, has disposable income… Optimize for conversion for a 6 month signup.
  点评：商业类提示词范本——把**目标用户画像 + 商业模式 + 转化目标**写成规格，让模型做营销决策而不是拼素材。

### B. 结构化清单型（厂商官方最常用形态：定位句 + 编号功能点 + 氛围句）

- **CSV → Charts**（arena）：
  > Create a single-page app in a single HTML file with the following requirements:
  > - Name: Data Visualization Playground
  > - Goal: Upload CSV and generate charts.
  > - Features: Chart type selector, color customization, save as image.
  > - The UI should be modern with a focus on charts.
  点评：**Name / Goal / Features / UI 氛围** 四段式——51 条语料中工具类反复出现的骨架。功能点 3±1 个（单轮做好的范围控制）。

- **Micro Habit Tracker**（arena，515 字符）：
  > - Goal: Track up to 7 daily habits with streaks and simple charts.
  > - Features: Add, edit, delete… "Skip day" option; export/import JSON.
  > - The design should be concise… but it should inspire and energize the user
  > - Must be compatible with both laptop and mobile screens
  > - For demo purposes, include a few days of example data by default.
  点评：机制数值（7 habits）、**跨设备验收**（laptop + mobile）、**开箱演示数据**——三个高价值细节同现。

- **Event Feedback**（arena，1,057 字符，业务场景代表）：
  > …large table view… 30 entries… search bar… "AI summary" section… sort by column… Pay attention to details: ensure the layout and UI remain intact, colors are used effectively… and **no part of the interface appears broken**.
  点评：业务应用提示词范本——数据规模（30 条仿真数据）、交互清单、以及显式的"完整度红线"（nothing appears broken）。这类验收句几乎等价于让模型"交付前自测"。

### C. 参数化工程型（中文评测流派：把物理/视觉参数写进规格）

- **XSCT Flappy Bird Basic**（956 字符，节选）：
  > 三个状态：等待开始 → 游戏中 → 游戏结束… 建议 480×640… 缺口 150px、管道间距 220px… 振翅 8-10 帧切换… 使用 requestAnimationFrame… 矩形 AABB 碰撞（可对小鸟用略小碰撞盒）… 管道离屏后从对象池移除，避免内存泄漏。
  点评：把"游戏手感"翻译成可核对的参数（尺寸/间距/帧率/算法）。难度递进全景：Basic=机制+视觉基准；Medium（1,946 字符）=日夜交替（每 10 分切换、≥1.5s 过渡）、难度递增（缺口 160→100px 线性缩小、速度 2→5px/帧封顶）、道具参数（60% 金币概率、护盾抵 1 次、缩小 60% 持续 8s）；Hard（1,555 字符）=AI 自动玩（规则 AI + 难度分级 + 30 帧预测轨迹可视化）+ 粒子系统参数（12-20 粒子/次、重力、生命周期）+ 动态音频（BPM 随分数加快）。
- **XSCT 2048 Hard**（1,686 字符）：多模式网格（3×3/4×4/5×5）、**Expectimax 算法 + 评估函数要素（空格数/单调性/平滑度/最大值位置）+ 搜索深度 1-5 滑块 + setTimeout 分片防阻塞**、粒子爆炸 12-20 粒、CSS 3D 翻转动画。点评：算法级需求也可以一轮锁定。

### D. 官方 rubric 型（让模型自己定义"好"再自我迭代）

- **GPT-5 prompting guide 官方推荐的 zero-to-one app 提示词**：
  > `<self_reflection>` First, spend time thinking of a rubric until you are confident… create a rubric that has 5-7 categories… do not show this to the user… Finally, use the rubric to internally think and iterate on the best possible solution… if your response is not hitting the top marks across all categories in the rubric, **you need to start again**.
  点评：OpenAI 官方口径："asking the model to iteratively execute against self-constructed excellence rubrics improves output quality"。**单轮模式下的多轮自迭代**——把"验收标准"外包给模型自己的审美/质量标准（rubric 不进输出，只作内部检查）。这是 2026 年"一轮出好项目"最值得抄的一段。

### E. 精炼循环型（怎么"获得"高质量提示词本身——提示词工程的新形态）

- **CNET 三模型互炼法**：① 用 Gemini 从零迭代出满意项目 → ② 让 Gemini 把项目总结成一份提示词 → ③ 把提示词交给 Claude 重建并修补遗漏 → ④ 让 Claude 更新提示词 → ⑤ 最终提示词在新会话单轮喂给三个模型，全部成功复现。
- **GPT-5 metaprompting 官方模板**："What specific phrases could be added to, or deleted from, this prompt to more consistently elicit the desired behavior…?" 与 CNET 方法同构。
  → **方法论**：别再手写提示词——先让任意模型把"你满意的项目"反编译成提示词，再跨模型验证一轮。质量远高于从零起草。

---

## 3. 十大共性特征（每条附证据）

1. **锁定交付形态（出现率 94%）**："single HTML file" / "single page.tsx" / "no build step, no dependencies"。消除模型最常犯的"不可运行"错误（多文件、脚手架、外部依赖）。连 TIDEWRIGHT 的 README 都把"runs from file:// with no server"当卖点。
2. **结构化分节（80%）**：标题 + 编号列表（## 核心机制 / ## 视觉要求 / ## 技术要求），不写大段散文。列表让模型可逐条核对、可枚举完成度；散文让模型只能"感觉"。
3. **定位句 + 3±1 个功能点**：Name（一句话定位）→ Goal（价值）→ Features（≤5 个）。一轮能做好的是"小而完整"，不是"大而残缺"——范围本身就是提示词参数。
4. **审美给方向词、关键处给锚点值（69%）**："brutalist, monochrome, oversized type, strict 12-col grid, sharp corners"（方向词）；"2:#eee4da 8:#f2b179 2048:#edc22e"（锚点值）。arena 语料 0 个 px/ms 参数但产物视觉普遍在线——**审美方向词调用模型先验，锚点值只给"你敢错的地方"**；XSCT 流派则把手感参数全锁（150px 缺口、300ms 过渡、90%/10% 概率）。
5. **验收标准写进提示词（37%）**："Ensure the gameplay works and is fun" / "release-ready" / "no part of the interface appears broken" / "Must be compatible with both laptop and mobile screens" / "fully responsive & fast"。没有验收标准的生成任务，模型按训练分布的最低可接受水平收敛；给验收句 = 告诉模型"什么叫做完"。
6. **完成度档位词**："maximum effort" / "world-class" / "fully featured" / "beyond basic" / "Surprise me"。对推理型模型（Claude thinking / GPT-5 reasoning effort）这等价于**努力档位信号**——TIDEWRIGHT 的 maximum effort 直接对应其 7 小时自主长跑。
7. **开箱即演示（18%）**："include a few days of example data by default" / "Populate the table with…30 entries" / "an example markdown should be filled in"。没有演示数据的一轮产物是"空壳正确"——填了数据的才是"看起来像成品"。
8. **排除项（负面约束）**："3D and **not** a voxel game" / "no external APIs" / "only SVGs" / "local-only" / "no bundler"。排除项用一句话杀掉一整类跑偏方向，比正面描述省 token 且更精确。
9. **参照物锚定（14%）**：URL（openai.fm）、主题（Roman Empire、esports tournament）、风格流派（brutalist、hand-drawn watercolor）。模型对著名站点/风格的先验远比你的文字描述精确。
10. **输出协议**："Please output the code directly, do not attach any explanation" / "直接输出完整 HTML 代码，不要附加任何解释文字"。把回复预算 100% 留给产物；也避免首轮闲聊式应答。

**未入选但常见的误区**：51 条官方语料中**没有一条**依赖"你是顶级前端专家"类角色扮演——官方指南明确反对过度角色设定（见 §5）。

---

## 4. 长度与粒度的规律（数据说话）

- **长度分布**：arena 平均 60 词即可出完整应用；XSCT 按难度给 581 / 827 / 1194 字符；TIDEWRIGHT 用 69 词启动 7 小时工程。
- **粒度规律：细节应加在"新增决策点"上，而不是均匀铺开**。XSCT 三级递进就是证据：Basic→Hard 增加的字符全部花在新功能参数（AI 算法、道具数值、粒子参数），原有机制描述几乎不变。学术侧亦有印证：*Instruction Granularity for Coding Agents*（2026 工作论文）对比"高层约束 vs 全细节代码规格"，及坦佩雷大学 *Improving reliability of LLM-generated frontend applications through workflow-driven input design*——"给什么层级的信息"比"给多少信息"更决定产物可靠性。
- **越短越好吗？** 不。极短提示词（85 字符）能成功的前提是有强参照锚点或超常见任务；每新增一个"你会验收的新维度"（移动端、键盘可达性、导出、演示数据）就值得一行规格。**最短 = 锁完所有你在意的决策点之后的长度**。
- **给粒度时的坑**：arena 语料刻意不给像素参数，因为那会把模型困在"执行参数"而放弃整体设计；XSCT 流派给全参数是为了**可自动评测**（LLM-as-Judge 按 rubric 打分）——你的提示词粒度应与你的验收方式匹配。

---

## 5. 反面对照：一轮失败的提示词长什么样

1. **模糊无锚**："帮我做个好看的网站" → 模型输出"平均水平的网站"，因为"好"没有进入决策空间。
2. **矛盾指令**：GPT-5 官方给出反例（"未经患者同意不得预约" vs "高优先级自动分配最早时段"并存）。**推理型模型对矛盾极其敏感**——官方文档：contradictory/vague instructions "can be more damaging to GPT-5 than to other models, as it expends reasoning tokens searching for a way to reconcile the contradictions"。写完提示词请自查指令层级冲突。
3. **过度角色扮演**：Anthropic 官方："你是只讲术语、从不犯错的世界级专家"式的角色设定会**限制模型有用性**；"更有效的做法是直接描述你想要的视角"，而非堆砌人格。
4. **对新模型用过时技巧**：Cursor 调优实录——对旧模型有效的 "Be THOROUGH when gathering information" 前缀，对 GPT-5 反而造成**重复搜索、过度工具调用**（GPT-5 天然会深思熟虑和收集上下文）。提示词技巧有代际保质期。
5. **不锁交付形态**：产物带构建步骤/多文件/外部 CDN → 换环境即"跑不起来"，一轮体验直接失败。
6. **负面框架**："不要用列表"不如正面框架"用连贯散文段落"（Anthropic：说该做什么，别只说别做什么）。
7. **"别问问题"一刀切**：GPT-5 官方对 agent 场景建议明确写出**允许模型在什么不确定性下继续/回问**（工具分级：删除文件类低阈值须确认，搜索类高阈值不必问）——一轮任务里"哪些点可以假设、哪些点必须问"本身就是规格的一部分。

---

## 6. 模型差异适配（跨模型通用 + 各家偏好）

**通用层（占收益大头，与模型无关）**：交付形态、结构分节、验收标准、范围控制、审美方向词、演示数据——在 GPT-5/Claude/Gemini/Kimi/XSCT 全部被测模型上同样有效（model-arena 与 XSCT 的数据都支持）。

**各家偏好（次要但免费）**：

| 维度 | 证据来源 | 实操 |
|---|---|---|
| 结构化标记 | OpenAI（Cursor 实测 "structured XML specs improved instruction adherence"）vs Anthropic（"新 Claude 不需要 XML，markdown 标题+明确指代即可，XML 只在复杂混合内容时有用"） | 复杂提示词用 `<self_reflection>` 式 XML 分区对 OpenAI 系更稳；Claude 系用 markdown 分节即可——两者都不排斥编号列表 |
| 推荐技术栈 | GPT-5 guide：Next.js(TS)/React/HTML + Tailwind + shadcn/ui + Lucide + Motion + Inter | 用**模型训练分布内最熟的栈**（官方点名的栈），能显著降低一轮成功率风险；arena 51 条也印证"单文件 HTML"是各模型的舒适区 |
| 努力档位 | OpenAI reasoning_effort / Anthropic extended thinking | API 场景直接调档；chat 场景用提示词语言（maximum effort / world-class rubric） |
| 自我迭代 | GPT-5 guide 推荐 `<self_reflection>` rubric 段 | Claude/Gemini 同样吃这套（rubric 自评是其推理链的一部分） |
| 中文模型 | XSCT 全平台评测（DeepSeek/Kimi/Qwen/GLM/MiMo 均被测）+ 中文评测语料本身 | 中文提示词直接给"编号清单 + 具体参数 + 直接输出代码"效果最好（XSCT 语料全为中文结构化规格）；DeepSeek 社区实验同样显示结构化优于散文（证据层级：社区文章，非官方） |

---

## 7. 可直接套用的模板

### 模板 A：单文件应用 / 小游戏（arena 式，约 60-100 词）

```
Create a single-page app in a single HTML file with the following requirements:
- Name: <一句话定位>
- Goal: <用户得到什么价值>
- Features:
  1. <核心功能>
  2. <第二功能，含一个具体数值/机制细节>
  3. <加分功能>
- The UI should be <2-4 个审美方向词>; <1 个关键视觉锚点，如配色/参照风格>
- <验收句：Ensure … works / nothing appears broken / responsive on mobile>
- <排除项：no external dependencies / local-only>
- <可选> For demo purposes, include <示例数据> by default.
Please output the complete code directly, without explanation.
```

### 模板 B：复杂应用（分层区块式，arena 复杂样本形态，200-400 词）

```
Build a single HTML file for <一句话定位 + 风格基调>。
按以下区块组织，每区给关键交互细节：
- Hero: <文案要素 + 背景交互>
- <核心功能区>: <功能 1 到 3，带参数：行数/条目数/时长/阈值>
- <数据区>: <表格/图表要求，排序/筛选等交互>
- <附加区>: <模态、导出、分享等>
细节红线: <no part of the interface appears broken / 键盘可操作 / prefers-reduced-motion>
性能与边界: <lazy-load / 无外部 API / 数据全本地>
```

### 模板 C：自反思 rubric 前缀（贴在任何生成任务前，GPT-5 官方推荐）

```
<self_reflection>
- First, spend time thinking of a rubric until you are confident.
- Then, think deeply about every aspect of what makes for a world-class <产物类型>.
  Use that knowledge to create a rubric with 5-7 categories. Do not show this to the user.
- Finally, use the rubric to internally iterate on the best solution to the prompt.
  If your response is not hitting top marks across all categories, start again.
</self_reflection>
```

### 模板 D：单指令长跑型（agent 场景，tidewright 式）

```
Create me <完成度标准> <产物>. On <技术路线>.
<一句话玩法/功能定义>.
I need it <形态 + 排他项，如 3D and not voxel / single file>.
Make it with maximum effort, show me best what you can create.
Use all your power, knowledge and make best <质量维度 1> and <质量维度 2>.
Surprise me with <你愿意被惊艳的方面>.
```

### 写前自检清单（10 项）

1. □ 交付形态锁定了吗（单文件/框架/无构建/依赖边界）？
2. □ 功能范围 ≤5 项、有 1 句定位句吗？
3. □ 每个你在意的机制决策点都有值（数量/时长/概率/阈值）？
4. □ 审美给了方向词（+必要锚点值），还是留白给了方向？
5. □ 验收标准写了吗（能玩/无破损/响应式/可访问/性能）？
6. □ 完成度档位词（maximum effort / fully featured / beyond basic）？
7. □ 开箱演示数据安排了吗？
8. □ 排除项覆盖了吗（不要什么技术/风格/依赖）？
9. □ 有参照物/先验锚点可用吗（著名站点/风格/既有代码形态）？
10. □ 通读一遍：有没有矛盾指令、负面框架、过时技巧（be-thorough 式说教、堆角色）？

---

## 附录：数据源与统计口径

**一手抓取语料**（curl 直下原文件，存于会话工作区 .tmp-prompt-research/）：
- `arena-yaml/*.yaml`（51 条）：github.com/with-logic/model-arena → examples/（fork 自 OpenAI gpt-5-coding-examples，各模型同一提示词单轮生成；截图源 cdn.openai.com/devhub/gpt5prompts/）
- `xsct-w.jsonl`（181 条 × 3 级）：github.com/itshen/XSCT_Bench_Dataset → data/xsct-w（CC BY-NC-SA 4.0）
- `tidewright.md`：github.com/winchxyz/tidewright（README，MIT）
- `cnet-epic-prompt.txt`：cnet.com，*I Made Claude, Gemini and ChatGPT Build the Same App With an Epic Prompt*（2026-03-05）
- `gpt5-guide.txt`：openai-cookbook examples/gpt-5/gpt-5_prompting_guide.ipynb
- `anthropic-blog-ko.txt`：claude.com/ko/blog/best-practices-for-prompt-engineering（正文提取）
- `agentic-zero-one-n.md`：tweag/agentic-coding-handbook PROMPT_ZERO_ONE_N_SHOT_PROMPTS.md

**统计口径**：按 YAML `prompt:` 块 / JSONL user 消息原文逐条正则统计；"列表结构"=出现行首 -/*/数字 的行；"UI 氛围"=含 UI should/theme/aesthetic/style 等词；"验收"=含 works/fun/enjoyable/broken/responsive/accessible/keyboard 等词；"演示数据"=含 demo/example data/sample/random dataset 等词。

**引用链接**：
- [with-logic/model-arena](https://github.com/with-logic/model-arena)（prompts 见其 examples/ 目录）
- [itshen/XSCT_Bench_Dataset](https://github.com/itshen/XSCT_Bench_Dataset)、[XSCT Bench 官网](https://www.xsctbench.com/about)
- [winchxyz/tidewright](https://github.com/winchxyz/tidewright)
- [CNET 三模型实测](https://www.cnet.com/tech/services-and-software/i-vibe-coded-an-app-with-3-popular-chatbots-the-real-winner-is-a-good-prompt/)
- [GPT-5 prompting guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide)（OpenAI）
- [Claude prompt engineering 最佳实践](https://claude.com/blog/best-practices-for-prompt-engineering)、[Be clear and direct](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/be-clear-and-direct)（Anthropic）
- [tweag/agentic-coding-handbook](https://github.com/tweag/agentic-coding-handbook/blob/main/PROMPT_ZERO_ONE_N_SHOT_PROMPTS.md)
- 研究参考：[Instruction Granularity for Coding Agents](https://github.com/user-attachments/files/26448902/Instruction.Granularity.for.Coding.Agents_.High-Level.Constraints.vs.Fully.Detailed.Code.Specificati.pdf)、[Improving reliability of LLM generated frontend applications](https://trepo.tuni.fi/handle/10024/237852)（坦佩雷大学）、[Why Your Prompts Fail at Scale: The Vibe Code Problem](https://www.sashido.io/de/blog/prompting-with-structure-vibe-code-without-losing-control)
- 社区精粹：[nipe0324/awesome-vibe-coding-prompts](https://github.com/nipe0324/awesome-vibe-coding-prompts)、[DeepSeek 提示词效果对比实验](https://cloud.tencent.cn/developer/article/2507450)（腾讯云，社区实验）
