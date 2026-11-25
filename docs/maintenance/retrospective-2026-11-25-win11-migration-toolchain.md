# 完整复盘：Linux/wine → Win11 平台迁移与工具链适配（2026-11-25）

> 状态：已验证（Win11 实测；证据层级逐条标注：结构层＝命令读数/字节比较，行为层未证）
> 来源：会话「把真实足球部署到 win11」（2026-11-25 20:59 起）的工具读数 + 提交 `99774abd` `929bec4d` `b80a16a0` `b6da5110` `f3169792`
> 及本轮复盘提交 + 失败账本 `F-20261125-93..96`；部署记录 `examples/football/DEPLOY-WIN11-20261125.md`
> 最近校验：2026-11-25
> 范围：单会话、单轮任务（迁移地图 1073741827 + 让仓库工具链在 Win11 跑起来）；不涉及玩法源码

## 一、生效路径表（每行都要能回答「下次它靠什么被触发」）

| 教训 | 载体 | 触发方式（不靠人读） | 验证 |
|---|---|---|---|
| 一张地图＝`.gil`＋`external_lua_file/`，整体搬运；`.gip` 只合并、不整份覆盖 | 技能脚本 `lua-2d-ui-game-build/scripts/deploy-map-dir.ps1` | 跨机搬运时执行（fail-closed：目标已存在即拒绝；暂存目录逐文件校验 SHA 后原子改名） | 3 文件 SHA 相等后落位；`.gip` 153→194 B |
| `maps:resync` 注册成功看字节不看大小 | `genshin-ts-asset-operations` 步骤 0 与 G 节（写回任务自动加载） | 任何写回地图的任务 | 去掉「链接 11 B＋条目」后与写前只差 4 个长度字段 |
| Win11 上 CLI 需两个环境变量（存档根、win32 esbuild） | 可执行件 `examples/football/gsts-win.mjs`＋`examples/football/AGENTS.md` §〇（进目录自动注入） | `node examples/football/gsts-win.mjs …` | `maps` exit 0；缺 esbuild 时 exit 2 并指路 |
| 门禁子进程输出被系统编码吞掉 | **底层代码** `scripts/doc_health.py`（显式 UTF-8）＋门禁 `doc-health-utf8`（自测＋注入用例） | 每次 pre-commit；`failure-ledger check`（Linux） | 自测四组合 PASS；注入用例 CAUGHT |
| 钩子缺 `python3`、`.ps1` 被执行策略拦、git 命令别进管道 | `lua-2d-ui-game-build/references/12-deploy.md` §6、`task-retrospective` §1.5、`examples/football/AGENTS.md` §〇 | 跨系统部署 / 复盘 / 进入 football 目录时自动加载 | 本轮 8 次提交钩子均真实执行并放行 |
| 引擎回写不是损坏，但要重新取证 | `genshin-ts-asset-operations` 步骤 5、`12-deploy.md` §6 | 写回/迁移后的回读步骤 | 与 Linux 源逐字节比较：仅 42 B / 15 段 |

## 二、失败账本快照

`tools/failure-ledger dashboard`（Win11，DSH Python）：**96 条｜已建机械防线 81｜未建 15**。本轮 +4：`F-20261125-93`（环境，open）、`-94`（静默，open）、`-95`（静默，open）、`-96`（静默，prevented，gate `doc-health-utf8`）。
`check` **未跑**：它的 gate 命令靠 shell 起子进程，Win11 的 PATH 无 `python3`，整体不可编排——新门禁与注入用例已在本机用 DSH Python 等价执行（gate exit 0 / inject exit 0），这不等于 `check` 已验证。

## 三、错误谱系

| # | 现象 | 根因层 | 处置 | 证据 |
|---|---|---|---|---|
| 1 | 追加一节后 dossier 219 行 > 200 行预算，门禁拦 | 流程：只加不压 | 合并已被取代的 10-24 旧节 → 198 行，事实与指针保留 | `b80a16a0` |
| 2 | 提交报 `Unable to create .git/index.lock` | 自造·环境：`Select-Object -First 50` 取满即掐断 `git status` 管道，后台刷新索引被中断 | 取证（0 字节/无进程/时间戳）→ 用户确认 → 带断言删除 | 账本 94 |
| 3 | 提交脚本在 C1 后中止，C2/C3 没跑 | 自造·环境：PS 5.1 `Stop`＋`2>&1` 把钩子的 stderr 包成终止错误 | git 命令不进管道；提交后回读 `git log` | 账本 95 |
| 4 | 门禁读取线程 `UnicodeDecodeError` | 代码：`subprocess(text=True)` 按系统 locale（GBK）解码 | 显式 UTF-8 ＋ 自测 ＋ 注入用例 ＋ gate | 账本 96 |
| 5 | `skill-salvage.py` 抛 `Non-relative patterns are unsupported` | 代码：路径分隔符写死 `/` | `relative_to().as_posix()` | 本轮提交 |
| 6 | `skill-salvage.py --bucket` 找不到日记 | 漂移：记忆河流桶目录已是哈希名 | 改用全桶模式；写入 `task-retrospective` | 全桶扫描 8 篇无孤儿 |

## 四、为什么反复出问题——系统性根因

1. **把旧宿主的隐含前提带进了新宿主**：`python3` 在 PATH、locale 是 UTF-8、路径分隔符是 `/`、`node_modules` 自带本平台 esbuild——
   每个仓库件第一次在 Win11 上跑都可能踩一次。对策是逐件**显式化**（`encoding=`、`relative_to().as_posix()`、包装脚本），
   而不是靠调用者记得设环境变量。本轮修了两件（doc_health、skill-salvage），`failure-ledger check` 的编排仍未适配。
2. **PowerShell 管道会「取满即停／遇 stderr 即停」地掐断原生命令**：事故 2、3 同根因。对 git 这类会写 stderr 的命令，
   直接调用后看 `$LASTEXITCODE`；要截断输出先落变量。
3. **部署类证据有时效**：对账时刻的 SHA 是部署证据；引擎一加载地图就回写（本次仅 42 B、15 段的局部重排，内容读数全等）。
   回写之后必须重新过门禁并与源逐字节比较——既不能沿用旧读数，也不能把 SHA 变化误判为损坏。

## 五、验收口径自审

- 验收标准由执行者自写；**未预写豁免**：游戏内画面/按键/物理/结算明确列为未验证。
- 门禁覆盖的是结构层（文件 SHA、信封、注册表字节、回读计数），不覆盖行为层。
- 过程可信度：「引擎已加载并回写」依据 mtime 与 SHA 实变；「注册条目存活」经两次引擎重写（21:26、21:41）逐字节确认；
  迁移 n=1，不报分布。
- 用户纠正：无方法类纠正（仅一次「删除陈旧锁」的确认）。

## 六、未闭合项

- **根注入文件余量**：`AGENTS.md` 16,282 / 16,384 B、`CLAUDE.md` 12,281 / 12,288 B ⇒ Win11 口径（`python3`、`cmdmon`、PKC）同步不进去，需先瘦身（待裁决）。
- 账本 93 / 94 / 95 三条 open（接受靠纪律的理由已写在账目 note）。
- `failure-ledger check` 在 Win11 不可编排；PKC 在 Win11 的可用性未验证（同日 tetris 记录为 `locked PKC runtime is missing`）。
- `cmdmon` 耗时监控未安装；Linux 侧 GUI/试玩工具链未迁移。
- football：Win11 玩法行为零证据；`Beyond_Debug_Log` 里 21:26:53 起的几份日志待判读（断点见 `docs/longtask/dossiers/football-v3.md` 文末）。

## 七、产出清单

- 提交：`99774abd`（搬运脚本＋部署模块）、`929bec4d`（迁入＋CLI 包装＋AGENTS 环境节）、`b80a16a0`（线档案收尾）、
  `b6da5110` / `f3169792`（`PYTHONUTF8=1` 修正）、以及本复盘所在提交（门禁修复／技能回灌／账本与本文）。
- 新增可执行件：`deploy-map-dir.ps1`、`gsts-win.mjs`、`doc_health.py --selftest-utf8` 与 `--inject-legacy`、gate `doc-health-utf8`。
- 文档：`examples/football/DEPLOY-WIN11-20261125.md`；`docs/longtask/`（LINES / dossier / 03-state / 04-timeline / INDEX）只改了 football 行与共享段。
