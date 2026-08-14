# 协作经验手册（Collaboration Handbook）

> 跨项目通用的工具使用规范与工作方法论。来源：2026-08-14 魔方 P4 复合闭环 + #12 系列
> 修复全过程的高频错误复盘（用户要求：错误积累成知识，不再重复）。
> 适用范围：任何使用本工具链（DSH + gsts）的项目；与项目特定知识（docs/game-engine-knowledge/）
> 分开维护。

## A. 工具调用规范（高频错误复盘）

这些错误在本轮会话中反复出现，每一条都对应至少一次真实故障：

### A1. run_code 是唯一可直接调用的工具

> **⚠ 最高频错误（2026-08-14 复盘后仍复犯）：任何工具调用都必须写在 run_code 的 code 参数里**——模型层只能发起 run_code；bash/read/write/edit/grep/glob 都不允许作为独立工具调用出现。写 code 时第一步就写好包装函数：const bash = async (cmd, desc) => (await tools.bash({command: cmd, description: desc})).stdout?.text ?? ""，之后所有 shell 都走它。
- bash / read / write / edit / grep / glob 等只能在 run_code 的程序体内用
  await tools.xxx(...) 调用；直接调用会报 "unknown tool ... only run_code is callable directly"。
- 任何"先用哪个工具"的犹豫都在 run_code 里解决：程序体里写 const r = await tools.read({...})。

### A2. run_code 的 code 是 TypeScript 程序体，不是 shell

- 在 code 里写 bash heredoc（python3 - <<EOF）或多行 shell 会报 TS 解析错误
  （"Expected ',' got 'import'"）。
- 正确姿势：多行脚本先用 tools.write 写成文件（.ts/.py/.sh），再用
  tools.bash({ command: "node script.ts" }) 执行。

### A3. TS 模板字符串内不能裸用反引号

- 模板字符串（...）里出现未转义的反引号（如 markdown 代码标记）会截断字符串，
  报 "Expected ',' got 'ident'" 等解析错误。
- 正确姿势：模板字符串内避免反引号；需要嵌入代码片段时改用普通字符串 + 换行拼接，
  或把带反引号的内容转义。

### A4. bash 返回字段可能缺失、长输出会被截断

- 封装必须防御：r.stdout?.text ?? ""（stdout/stderr 可能为 undefined，直接 .text 会崩）。
- 长输出（如 1000+ 帧的日志）工具只保留尾部——先重定向到工作区文件再分块读，
  不要依赖回显。
- 判断成败看返回的 exitCode，不要用 grep | tail 的管道退出码（恒为最后命令的）。

### A5. /tmp 不跨 bash 调用持久

- 沙箱每次调用独立，/tmp 文件会丢。中间产物一律写工作区（如 .gsts/ 或项目内临时目录）。

### A6. read 工具也有行数上限

- 大文件只返回部分行（曾 1131 行文件只回 268 行）。先 wc -l / grep 统计规模，
  再按 offset/limit 分块读；或 grep 精确取行。

### A7. 改 src 必须重建 dist 才生效

- bin/gsts.mjs 等入口跑的是 dist 编译产物——改 src 后不重建，修复"不生效"（#12 踩过：
  IR 还是 undefined 源）。
- 重建流程：删 .tsbuildinfo 增量缓存 → ./node_modules/.bin/tsc -p .gsts/tsconfig.src-only.json
  → node scripts/postbuild.mjs（复制 .proto/.d.ts）。TS5055 报错可忽略（JS 已产出），
  但 postbuild 必须跑，否则 .proto 缺失。
- 长构建用 run_in_background: true + job_output 等待，避免前台超时。

### A8. tools.edit 的 old_string 必须逐字精确

- 文件里的转义（如 R<K> 反斜杠）、全角标点、反斜杠都要一致——先 tools.read 拿精确文本
  再 edit；edit 前必须先 read（fs-observation-policy 要求）。

### A9. 沙箱写保护与审批

- /mnt（Win 数据盘）默认只读；写游戏目录需 sandbox_permissions: "danger-full-access"
  带 justification 重试（审批可能超时——先小命令探测可写性，再升级）。
- 被拒绝的命令不换方式硬绕；升级权限是唯一例外，且一次申请一次用。

### A10. 输出要克制

- 打印前先评估规模（wc -l、head、grep -c）；默认只输出摘要和 PASS/FAIL，
  不加载完整大文件进上下文。

## B. 跨项目工作方法论（本轮验证有效）

### B1. 每轮一个可归因变量

- 差分/实验只改变一个因素；before/after 快照物理复制 + hash 锁定（不只记 hash——
  先物理复制 BEFORE 再操作，2026-08-14 教训）。
- "一个变化"按编辑器最小原子操作定义；多个变化能逐项断言才组合。

### B2. 红绿测试先证后修

- 新回归测试先验证"revert 修复后测试失败"（红），再修复（绿）——证明测试真的覆盖 bug。
- 可靠退出码：tsx test && echo PASS || echo FAIL。

### B3. 证据分层，不混淆

- 自动回归通过 ≠ GIA 生成正确 ≠ 注入成功 ≠ 游戏行为验证。逐层报告，每层独立证据。
- 游戏行为以 Beyond_Debug_Log 帧证据为最终裁判；修复后必须日志复验才闭环。

### B4. 编辑器保存会破坏注入内容

- 编辑器用内存状态整体重写 .gil：注入的 flow pin 等结构可能被丢（轮 12b 实证）。
- 对策：注入后测试前不让用户保存；差分样本尽早物理捕获；编辑后必须重新注入生产版。

### B5. 不先改生产代码做实验

- 规则未闭合前，优先设计差分/核验（用编辑器操作或现有状态做天然实验），
  改生产代码"猜"是低效且危险的（用户明确纠正：差分多次核验效率更高）。

### B6. 小步提交

- 每完成一个可验证的步骤就提交（用户授权）；避免大批文件堆积后一次提交。

### B7. 修复后同族扩展检查

- 单点修复不是终点：检查同族（双后端 / 同 API 入口 / 同模式），一次修一组 + 一组回归。
- 未覆盖项显式登记（无证据/超范围不静默跳过）。

### B8. 先查权威再动手

- 先读根 AGENTS.md、匹配技能、知识树/文档、现有测试，再动手；避免重复调查。
- 冷启动 vs 续作模式区分（editor-incremental-gia-investigator 的最小恢复路由）。

### B9. 用户面板核对是合法证据

- 编辑器/GUI 面板展示的参数名与值（如"监听该实体全部自定义变量"）是 wire 之外的重要
  语义证据——wire 解释不了时请用户面板核对，不要猜。

## C. 领域知识指针（项目特定，不在此重复）

- 游戏引擎复合/节点规则：docs/game-engine-knowledge/composite-nodes.md
- 日志解码规则：docs/game-engine-knowledge/debug-log-format.md
- 修复方法论文档：docs/architecture/composite/testing.md
