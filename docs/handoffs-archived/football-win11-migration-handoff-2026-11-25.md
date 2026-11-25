# 交接：真实足球迁入 Win11 + 仓库 Win11 开箱就绪（2026-11-25）

```text
mode: task-complete / awaiting-user
focus: football 线——地图「真实足球v3」(1073741827) 已迁入 Win11 游戏存档并通过结构层验证；仓库在 Win11 上的工具链已固化；根注入文件已瘦身
status_at_handoff: 部署与固化完成并已提交；游戏内玩法行为未验证（等用户试玩）；6 个被路由的全局技能在本机缺失，待用户裁决
durable_goal: 让「真实足球」成为能玩通的完整 3D demo（线 football；判据见 docs/longtask/dossiers/football-v3.md 第一节）
```

> 状态：已验证（结构层；行为层未证，见第 4 节）｜最近校验：2026-11-25 23:33（仓库 HEAD `4fa4c479`）
> 本文件是**索引**：细节都在下列仓库产物与记忆日记里，不在此重复。仓库内同内容副本：`docs/handoffs-archived/football-win11-migration-handoff-2026-11-25.md`。

## 1. 先读什么（按顺序，总量很小）

1. 本文件。
2. 根 `AGENTS.md`、`CLAUDE.md`——每次会话自动注入，头部已有「运行环境」口径（Win11）。
3. `examples/football/AGENTS.md` 第〇节——进入该目录会自动注入；存档路径、命令入口、提交方式都在里面。
4. `docs/longtask/LINES.md` 的 `football` 行 → `docs/longtask/dossiers/football-v3.md` 文末「断点（2026-11-25）」。
5. 记忆日记（`memo_read` 按 D 号取全文）：**D3** 地图迁移与引擎回写读数／**D8** Win11 工具链固化与两次自造 git 事故／**D9** 根注入文件瘦身方法与全局技能缺失。

## 2. 这次做了什么（一句话 + 去处）

| 事 | 结果 | 完整记录 |
|---|---|---|
| 真实足球迁入 Win11 | 3 文件与 Linux 源逐字节相同后落位；两处存档一致；已注册进地图列表；引擎已加载并回写（与源仅 42 B 局部差异）；门禁全绿 | `examples/football/DEPLOY-WIN11-20261125.md` |
| 仓库 Win11 开箱就绪 | `scripts/py.mjs` 统一找 Python；提交钩子改走它（零设置）；`scripts/setup-win-esbuild.mjs`；安装脚本自检 | 复盘 `docs/maintenance/retrospective-2026-11-25-win11-migration-toolchain.md` 第二部 |
| 文档门禁修复 | 子进程输出显式 UTF-8（旧实现下子检查 FAIL 时门禁会自己崩）；带自测与注入用例 | 同上第一部；账本 `F-20261125-96` |
| 根注入文件瘦身 | `AGENTS.md` 14,946 B（余 1,438）、`CLAUDE.md` 11,223 B（余 1,065）；规则零删除，三条下沉到技能 | `.agents/skills/agents-md-auditor/references/audit-log.md` 末节 |

本会话提交（按时间）：`99774abd` `929bec4d` `b80a16a0` `b6da5110` `f3169792` `59c4a35d` `6576947f` `c6066a9e` `96e11909` `7fa9d992` `296db044` `78d2da98` `4fa4c479`。
用户裁决原话与决策链：`docs/longtask/04-timeline.md` 的 11-25 两节。

## 3. 在这台机器上怎么干活（只给入口）

| 要做的事 | 命令 |
|---|---|
| 跑仓库里的 Python 脚本（门禁、`gil-guard`、账本……） | `node scripts/py.mjs <脚本> [参数]` |
| 跑 `gsts` CLI | `node examples/football/gsts-win.mjs <子命令>`（例：`maps`、`assets:mounts list --gil <图>`） |
| 提交 | 直接 `git commit`（钩子自己找 Python，不用设任何环境变量） |
| 新机器首次就绪 | `bash scripts/install-git-hooks.sh`，然后 `node scripts/setup-win-esbuild.mjs` |
| 改地图前 | 加载 `genshin-ts-asset-operations`，走其安全写回七步；写后 `maps:resync` |

写前备份与回滚说明在 `examples/football/DEPLOY-WIN11-20261125.md`「回滚」节。

## 4. 未闭合 / 下一步（按建议顺序）

1. **用户进图试玩「真实足球v3」**——玩法行为在 Win11 上零证据。用户 22:0x 对「日志判读」的回复是「目前不需要」；**等用户发起再做**。
   日志目录：`%USERPROFILE%\AppData\LocalLow\miHoYo\原神\BeyondLocal\110170759\Beyond_Debug_Log\`（已有 6 份，21:07–22:37；最大一份 2 MB，哪张图未判读）。
   判读要点在 `examples/football/DEPLOY-WIN11-20261125.md`「在 Win11 上继续开发」节。
2. **6 个被路由的全局技能在本机不存在**（`bilibili-learn`、`isolated-model-evaluator`、`oneshot-prompt-builder`、`pkc-project-operator`、`qxqy-simulator`、`task-command-center`）——
   `node scripts/py.mjs scripts/skills-health.py` 报 6 死引用。**等用户裁决**：从 Linux 迁移，还是标成仅 Linux。删除或改链接属破坏性操作。登记在 `docs/longtask/03-state.md` 第五节第 9 条。
3. **football 工程断点**（与本次迁移无关、原本就在）：引擎 v3 四件事手感、票 27 的 #2/#3/#4/#6、多人联机 M 线——见 dossier 文末断点；票文件 `.scratch/football-v2/issues/27-multiplay-feedback-six.md`。
4. **Win11 上仍不可用**：PKC 知识树（报 `locked PKC runtime is missing`）、耗时监控 `cmdmon`、失败账本的 `check` 整体编排、Linux 侧 GUI/试玩工具链。

## 5. 环境事实（新代理最容易踩的）

- 仓库在 **Btrfs 卷** `H:\@home\h\genshin-ts`（原 Linux 家目录）；git 是 PortableGit；`core.filemode=false` 已设。
- PATH 里没有 `python` / `python3`；实际解释器在 `%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe`（3.12），由 `scripts/py.mjs` 自动找到。
- **有另一个会话在并行提交**（俄罗斯方块 / sim-2d 线）。`git add` 偶尔撞到瞬态 `index.lock`——带重试（最多 3 次、间隔 2 秒）即可；只有「0 字节 + 无 git 进程 + 时间戳对得上已结束命令」才是陈旧锁，且删除前要问用户。
- PowerShell 5.1 的三个坑：读中文文件要 `Get-Content -Encoding UTF8`；git 等会写 stderr 的命令不要包 `2>&1`、不要开 `$ErrorActionPreference='Stop'`；不要用 `| Select-Object -First N` 截断会刷新索引的 git 命令（会留下 0 字节 `index.lock`）。
- 游戏本体在 `E:\ys\Genshin Impact Game\`，存档在 `%USERPROFILE%\AppData\LocalLow\miHoYo\原神\BeyondLocal\110170759\`——两者不在一处。地图「真实足球v3」= `1073741827`。
- 技能发现不完整：`composite-docs-*`、`genshin-ts-project-adapter` 在项目里存在，但本会话的可用技能列表里没有；第 4 节第 2 条的 6 个技能**不可调用**。

## 6. 建议技能（按下一步；用 Skill 工具加载）

| 场景 | 技能 |
|---|---|
| 新会话发现细节缺失、需要找回上下文 | `context-loss-recovery` |
| 用户发起日志判读 | `debug-log-investigator`（日志在 Win11；解析脚本经 `node scripts/py.mjs` 跑） |
| 需要真机取数或试玩闭环 | `device-playtest-loop`（只取其判据知识——它的工具链是 Linux 的，Win11 未迁移） |
| 任何写回地图之前 | `genshin-ts-asset-operations` |
| 足球玩法 / 节点图开发 | `dsl-nodegraph-development`、`client-nodegraph-development`、`lua-2d-ui-game-build` |
| 处理「6 个全局技能缺失」 | `agents-md-auditor`（审计路由表与死引用） |
| 提交被文档门禁拦下 | `document-governance` |
| 收尾更新长期任务档案 | `longtask-dossier` |
| 一波任务闭环后 | `task-retrospective` |

## 7. 用户偏好（本会话原话，决定了做法）

- 「需要固化，我们目前切换到了win11，首次是需要花时间来优化的，这些是后续其他人工作的保障。」→ 环境问题要固化成仓库件，不留临时做法。
- 「配合我看一起看，然后优化瘦身」→ 挪动用户令内容时，先列候选（位置 / 大小 / 是否改变语义 / 预计节省）让用户逐项选。
- 「目前不需要」→ 日志判读不要主动做。
- 对「顺手做的其他优化」持肯定态度（「利于项目的，值得表扬。继续保持」）。
