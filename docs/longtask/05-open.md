# 缺口清单：未满足 / 待拍板 / 已否决（L2）

> 状态：当前实现（**每次收尾核对一遍**；解决了的移到底部"已关闭"并写证据）
> 来源：用户诉求核对 + 复盘文档 + 门禁读数
> 最近校验：2026-10-29（新增 [sim-2d] O-2026-10-29-1..5：手柄真机键名 / 移动端安全区 / 局外养成无持久化 / 文案两条锁死用例 / 技能系统接线）
> 编号规则：`O-YYYY-MM-DD-n`；关闭时保留编号与证据
> **线 id**：`[football]` / `[sim-2d]` / `[gui-agi]` / `[global]`（跨线或基础设施）。只关自己那条线的条目。

---

## A. 用户诉求未满足（最优先）

| 编号 | 线 | 诉求（用户原话） | 状态 | 说明 |
|---|---|---|---|---|
| O-2026-10-17-1 | `[global]` | 「交付三个游戏」 | ⬜ 0/3 | 现在**分线推进**（见 `LINES.md`）：足球=活跃线，另两个游戏未开线 |
| O-2026-10-21-1 | `[gui-agi]` | 「通用的操作，给我只需要 5s 就完成了」 | ⬜ 未达 | 一次 `ys-act` 实测 **6.88s**；注入/抬窗/抓帧未分层量过 |
| O-2026-10-21-2 | `[gui-agi]` | 「操作应该是毫秒级别的」 | ⬜ 未分层 | 需要给出"注入本身"的 ms 读数，而不是端到端 6.88s |
| O-2026-10-22-1 | `[gui-agi]` | 「真机验证哪些功能真好用」（C 任务） | 🔄 等用户给第一个点 | 断点：`dossiers/gui-agi.md`；该线暂停 |
| O-2026-10-22-2 | `[gui-agi]` | 「验收上限=用户在环」 | 🔄 机制在，验收未跑 | 反馈轮四步已定型 |
| O-2026-10-23-1 | `[sim-2d]` | 「下一步就是去游戏里面打通并试玩」 | 🔄 **等用户 P1** | 整合包**已**在导入目录（10-23 17:20）；待编辑器资产导入 + 放 UI 空间 + 试玩；导入后模板 guid 重编号，需回传 5 个值才能校准 `workspace/hmlt-qixia/lua/main.lua:241` |
| O-2026-10-23-2 | `[sim-2d]` | 「现在缺素材」 | 🔄 13/13 图元拟合已制 | 待补：敌机 8 型（路线 A）、UI 面立绘/星带背景/面板底（路线 B，需先在真机确认自建图能否被图片控件选中）、音效 `473/982/529.mp3` 试听 |
| O-2026-10-23-3 | `[sim-2d]` | 图鉴/特性进度原来是 localStorage，现在是同局 META，**跨会话不保留** | ⬜ 未做 | 改关卡变量；进真机后才有意义 |
| O-2026-10-24-7 | `[football]` | 用户 2026-08-30：「远远不及足球_2 即不通过」 | ⬜ 未测 | 手感对照一次都没做过；能力层闭环不算（`dossiers/football-v3.md` §一） |
| O-2026-10-27-1 | `[sim-2d]` | tetris v2 **八点反馈**（原话逐字见 `workspace/tetris/docs/v2-plan.md` §一）：出块保底/双预览/Hold/AI 通用链路/AI 增强+难度/四模式/对抗因素/进阶操作 | 🔄 T9 真机交付中 | 模拟器侧 **43/43 用例全绿**（v2.7 又加 7 条：H 真键/V 回主页/结算 R 两模式/点击不重开/AI 死亡链路/模式卡三态/模式主题）；剩真机导入试玩（等用户）+T-spin 正向用例 |
| O-2026-10-27-2 | `[global]` | **线表模型与体检器不支持多会话并发驱动多线**：2026-10-27 实测两会话并行各推一线（football 会话 + tetris v2 会话，用户各自驱动），「同时最多一条活跃」是单会话假设，两会话都正确遵守「只改本线行」时断点无覆盖、体检却 FAIL | 用户裁决：①升级体检器支持 per-session 活跃（需改 longtask_check.py+--selftest）②或接受双活跃并加状态词「并行」③或规定同时只开一个驱动会话 | 2026-10-27 19:0x 两会话实测撞上；用户未裁决前 sim-2d 行状态词保持 football 会话所写「暂停」、断点文字双方各自维护 |
| O-2026-10-28-1 | `[sim-2d]` | tetris ⑨ 多 lua 文件拆分的**真机侧三项未验证**：①未挂载脚本能否被 `require` ②`require` 路径是否真带 `default_import_file/` 前缀 ③重导整合包后脚本挂载是否还在/会不会生成重复映射 | ⬜ 等用户重导 + 看日志 | 判据：真机日志出现 `module ok <path>`（4 级候选走哪级一目了然）；`module FAIL` 会带每条候选的错误原文。若真机不支持，回滚方式=revert 拆分那次 commit（`1202a7fa`） |
| O-2026-10-28-2 | `[sim-2d]` | tetris ⑤ 菜单三态的**真机派发未验证**：cursor 热区的 `CursorEnter/Exit/Down/Up/Click` 在真机是否都派发（容器模板已证不可实例化，cursor 模板真机可实例化性也只在模拟器验过） | ⬜ 等用户真机 | 判据：鼠标移入/移出模式卡看日志 `menu hover i=` / `menu hover out i=`；点卡能进模式 |
| O-2026-10-28-3 | `[sim-2d]` | ~~⑦ 口径待拍板~~ → **用户 2026-10-28 已复评**「四种模式要设计四种主题的背景的。偷懒啦」⇒ 已返工成四套构图（commit `2baf1111`，`v28-theme-*.png`）。**遗留待确认**：①是否继续加层（纹理/光晕/模式水印）②还是改走「导入真背景图」（需先闭合真机能否选中自建图片）③`V` 局内回标题要不要（现在只在结算态生效） | ❓ | 三问都在 `workspace/tetris/docs/README.md` §11.5；①改一张表 ②要动 `gsts image:import` + 模板 imageId ③一条监听 |

## A2. 造物线（2026-10-24 收尾带来的开放项；全属 `[football]`）

| 编号 | 线 | 事项 | 状态 | 下一步 |
|---|---|---|---|---|
| O-2026-10-24-1 | `[football]` | 造物技能链**频率未在近距验证**（远距实测 0.8/s 是节流值） | ⬜ | 把史莱姆挪进玩家活动范围复测，验证 15~16/s |
| O-2026-10-24-2 | `[football]` | 造物**真实行为**未开始（决策图只切状态、状态图只 executeSkill(1)、技能图只发信号） | ⬜ | 在 `examples/football/src-zaowu/` 改三图内容（追玩家/攻击） |
| O-2026-10-24-3 | `[football]` | `assets:entities import` 遇到 **def/页面实例同号跨段**会把别人的装饰物克隆给新实体（无守卫） | ⬜ | 可选：加不阻断警告（检出 id 同时在 root4/root8） |
| O-2026-10-24-4 | `[football]` | `assets:entities delete` **没有字节级回归** | ⬜ | 照抄 `tests/gil_creations_config_test.ts` 加删除用例（无孤儿 aux / 登记清干净） |
| O-2026-10-24-5 | `[football]` | 槽 82（自主逻辑参数）**填入后语义未闭合** | ⬜ | 用户口径：不填=不巡逻；要巡逻再做一轮编辑器差分 |
| O-2026-10-24-9 | `[football]` | ✅ **已关闭（2026-10-24 14:03 用户验收）** 技能变量 CLI 写回：**原因已定位**——不是 wire，是整文件重建时 header 两个长度字段未更新（坏文件 `hdr[16:20]=365163` vs 实际 `365209`）。已改用 `injector/binary.buildFile` + 新增检查器 `tools/gil-header-check.py`（门禁 `gil-header-selftest`）；**已验收**：实验图 1073741837 写入 `kit_exp` 后编辑器打开正常、游玩正常（用户原话「存档正常了，kit_exp也写进去了，游玩也正常」） | ✅ | 已完成；`--write` 已解封（仍带内联头部不变量断言） |
| O-2026-10-24-10 | `[football]` | **客户端射线检测在 DSL 里编不过（enum_list 参数）** — ✅ **已关闭 2026-10-24**：真因是**项目没有 tsconfig.json 时 `genshin-ts/*` 导入在类型层退化成 any**，枚举数组被包成 `assemblyList` ⇒ `Generic parameter not matched`。修复 = `loadTsConfig` 兜底注入指向本 CLI 包的类型别名（`src/compiler/genshin_ts_paths.ts`）+ `parseValue` 的 `enum_list` 分支给明确文案；回归 `npm run test:client-raycast`。编辑器差分确认：两个 enum_list 参数**只能靠构造节点连线**（视觉证据见工单 §3.6）。**工单：[issues/27-client-enum-list-param.md](../issues/27-client-enum-list-param.md)** | ✅ | 遗留：枚举数值映射（用户选的槽值 2606 vs 三方表 `ray_filter_type_scene`=2602）待一轮差分确认 |

## B. 已知缺陷 / 技术债

| 编号 | 线 | 问题 | 影响 | 下一步 |
|---|---|---|---|---|
| O-2026-10-22-9 | `[gui-agi]` | 状态判据硬编码在 `tools/ys-editor/ys-state`，无法按任务配置 | 加一个状态 = 改代码 = 为产品适配，违背通用性 | ✅ **已关闭 2026-10-22**：状态包 `state_pack.py` + `look --pack` |
| O-2026-10-22-10 | `[gui-agi]` | `act` 不自行借屏：`focus` hold 2s 后自动交还，`act` live 取帧报 `LIVE_NOT_ATOP` | 看见 ≠ 点得动；真机动作卡在第一步 | ✅ **已关闭 2026-10-22**：act 动作前自动 focus（hold 8s）+ 有界重试 |
| O-2026-10-22-11 | `[gui-agi]` | `wait` 无多帧稳定确认（单帧满足即 reached） | 过渡帧抖动 → 假到达 | 加 `require_stable: N` |
| O-2026-10-22-12 | `[gui-agi]` | 后台帧与前台是否同步**未实测** | 后台观察若读到陈旧帧，判据全废 | 用户已定：**待会实测** |
| O-2026-10-22-13 | `[gui-agi]` | 千星奇域大厅没有状态名（`GAME_ACTIVITY` 是活动一览页，不是大厅） | 三终态断言缺一 | 等用户给大厅特征 |
| O-2026-10-22-3 | `[gui-agi]` | `free_text` 字段名与语义不符 | 模型误读字段含义 | 改名或加 `unattributed_text` 别名 |
| O-2026-10-22-4 | `[gui-agi]` | 文字按 y 行硬合并 → 跨栏混串（一行 bbox 2336px） | 按文字定位会错到别的栏 | 按 x 间隙切列后再合并 |
| O-2026-10-22-5 | `[gui-agi]` | `--format png` fail-closed（`FORMAT_NOT_READY`） | 取帧偶发失败 | 提高 ring 深度或同步返回预编码帧 |
| O-2026-10-22-6 | `[global]` | 三个游戏看板状态表停在 10-17 04:00 | 接手者把 5 天前当现状 | 回三游戏伞目标前刷新（已有顶部横幅兜底） |
| O-2026-10-22-16 | `[global]` | **`dsh-game-mode.sh --on` 会被 30s timer 悄悄撤销**：stop 后建 STATE，`auto` 见「无游戏 ∧ 有 STATE」→ `start_services` 拉回 | 想停 AI 服务腾显存，30 秒后自己回来 | 脚本 `--on` 分支同时 `stop dsh-game-mode.timer`，或写 `manual` 标记；恢复清单=服务+STATE+timer 三件 |
| O-2026-10-22-17 | `[gui-agi]` | 显存预检 `_MIN_FREE_MIB=900` 与「原神在跑」实测余量 **856–903 MiB 重叠**；daemon 通道曾把 `engine` 写死 `'daemon'`（已修） | 同一配置重启一次可能随机落 cuda/cpu | 加 daemon 侧引擎选择门禁：回执给出选择理由 + 阈值边界用例 |
| O-2026-10-22-18 | `[gui-agi]` | OCR 单会话显存无上限（arena 可涨到 694 MiB/会话） | 与游戏共存时被撑大、挤兑 | ocr-vram 提案 `kSameAsRequested` + `gpu_mem_limit=512MiB`（−24%）；**待验收后定默认** |
| O-2026-10-22-19 | `[gui-agi]` | A 段（原神在跑）**改后** OCR 读数缺失 | 无法回答"优化在真实负载下值多少" | 下次开游戏补测，不混报 |
| O-2026-10-23-5 | `[global]` | `dsh-sentinel.service` **failed**（10-23 00:00 status=1）；手动 `--dry` rc=0 且无输出 | 每日自检静默失效 | 先看 `journalctl --user -u dsh-sentinel` 与 `~/.cache/dsh-sentinel.*` |

## C. 待用户拍板

| 编号 | 线 | 问题 | 备选 |
|---|---|---|---|
| O-2026-10-22-7 | `[gui-agi]` | C 的第一个能力点选哪个 | ①`worldsvc look/act/wait` ②`ys-scroll` ③焦点与交还 ④`ys-probe` 未知界面 |
| O-2026-10-22-8 | `[gui-agi]` | C 的产出形态 | 只出读数 / 出可复跑证据 `round.json` |
| O-2026-10-22-14 | `[gui-agi]` | `machine` 驱动循环做不做、做单步还是链式 | 先单步 + 包内 `transitions` 表达链式 |
| O-2026-10-22-15 | `[gui-agi]` | 状态包放哪 | 通用包 `tools/`、任务包 `.scratch/gui-profiles/<task>/`（两级继承） |
| O-2026-10-23-4 | `[global]` | 2D 产线与 GUI C 任务的关系 | ✅ 已被 **O-2026-10-24-6 取代**：不再二选一，改为多线并行（`LINES.md`） |
| O-2026-10-23-6 | `[sim-2d]` | 「把控件模板挂到布局上」缺 CLI：`assets:ui create-from-template --target <模板> --on layout` 在 `ui/DESIGN.md:77`/`ui/mappings.md:52`/`ui/design-trace.md` 标 ✅，但 `src/cli/assets_ui.ts`/`ui/src/cli.ts` grep 0 命中；内核 `instantiateToLibrary`（`ui/src/templateize.ts:954`）只覆盖库实例 | ①用户 1 分钟差分（编辑器里把库里控件组拖进默认布局→保存）出 wire 后接 CLI ②直接复用内核把父引用改成布局 |

## D. 已否决 / 已证伪（**别再走**）

| 线 | 路线 | 为什么否决 | 出处 |
|---|---|---|---|
| `[global]` | **把档案写成一条串行线**（"当前活动分支"+ 单组断点） | 多线并行时会互相覆盖断点，接手者只拿到一条任务 | 2026-10-24 用户：「现在没有考虑多任务并行…你得到的就只有一个任务」 |
| `[global]` | 按 mtime / 最新提交自动判断"该做哪条线" | 会挑到别的会话正在推的线（2026-10-19 踩过） | `LINES.md` §一 |
| `[gui-agi]` | 用像素阈值判"是不是目标窗口" | 与"通用"冲突，且截图相似度到 8 之后就没噪声 | 2026-10-21 22:22 裁决 |
| `[gui-agi]` | 单帧判"界面没变" | 过渡态会拍到混合帧 | 2026-10-19 复盘、AGI-BAR §七 |
| `[gui-agi]` | 文本 Jaccard 代像素判据 | 0.78 判"没变" vs 实际变 0.6553 | 2026-10-19 复盘 |
| `[gui-agi]` | 为取一个读数抬窗 | 抢用户屏幕，代价远超收益 | AGI-BAR 形态 A 契约 |
| `[global]` | 交接文档放 `/tmp` | 重启即失 | 2026-10-22 实证 |

## E. 已关闭

| 编号 | 结论 | 证据 |
|---|---|---|
| O-2026-10-24-8 | simulator-2d.md §四.1 矛盾已修：改为「整合包 GIA 已进导入目录且清成唯一一个（见 §三），待用户执行 P1」 | 2026-10-27 本线收尾改 `docs/longtask/dossiers/simulator-2d.md` §四.1，与 §三 读数一致 |
| O-2026-10-24-6 | **多线并行改造落地**：新增 `LINES.md`（线表/进门协议/共享资源仲裁/收尾规则），`INDEX.md` §二 删除"单一活动分支"，`03-state.md` 改为共享面 + 标线 id 的分节，`05-open.md` 每条标线，足球线建 `dossiers/football-v3.md`，技能 `longtask-dossier` 与体检器同步支持多线 | 提交 `9ed58de3`/`e259b0cd`；`longtask_check.py --dir docs/longtask` = PASS，`--selftest` = PASS（6 类注入各被抓到）；**已接主链**：`scripts/doc_health.py` 在暂存区含 `docs/longtask/` 时自动跑该体检（pre-commit 拦得住），实测注入"状态词表破坏"→ doc_health FAIL + rc=1 |
| O-2026-10-22-9 | 状态包落地：`state_pack.py`（validate/eval/list）+ `packs/gn-start-v1.json` + `look --pack` 接入；判据是数据，加状态不改代码 | 提交 `9c4a1ee0`；`state_pack.selftest.sh` 7/7 PASS；真机后台帧 `state=START` conf 1.0 |
| O-2026-10-22-10 | act 借屏竞态已修：动作前 `ys-session focus`（hold 8s）+ 抬窗后按 TTL 有界重试（≤2 次）；`ys-session focus` 快速路径验真实栈顶 | 真机 dry-run `focus_raise={ok:true,raised:true,ms:2907}`；离线 `selftest.py` 123/123 |
| O-2026-10-29-1 | `[sim-2d]` | tetris 手柄真机键名未知（Lua 侧读不到编辑器「按键映射-手柄」） | ⬜ 等真机 | 我们的对策=24 条 Controller 探针 + `NUM.PAD.KEYS` 表驱动。判据：真机按一遍手柄，日志读 `pad ev ControllerXxxKeyDown`，与 `KEYS` 不一致就改表（不改逻辑） |
| O-2026-10-29-2 | `[sim-2d]` | tetris 移动端控件是否被刘海/圆角遮挡 | ⬜ 等真机 | 按钮簇 `MARGIN=16`；真机截图判定，必要时按设备加 margin。同时取 `GetControllerLeftStickAxis` 的 y 轴正负口径（`pad stick down y=`） |
| O-2026-10-29-3 | `[sim-2d]` | **局外养成无法真持久化**：模拟器 `game` 表共 32 函数，自定义变量只有 `GetGlobalCustomVariableValue`（读），无 Setter；全仓无 localStorage/SaveData | ❓ 需用户裁决是否单独立项 | v1 已按「会话内跨盘（R 重开不清、刷新归零）」设计（`lua/tetris/skills.lua`）。真持久化需新的存档通道（局内存档/自定义变量写侧）——单独立项才做 |
| O-2026-10-29-4 | `[sim-2d]` | 文案层两条用例锁死旧串（`tests/29-menu-cards.json:39-43` 常驻键位串、`tests/07-guide-stages.json:96,109`「堆满一行即消除」）；且 `H1/H2` 接管提示写死在 `main.lua`（config 里那份是副本） | ⬜ 未做 | 接线顺序：先改这两条用例 → 再按 `docs/copy-v4.md` §6 的 46 行表接线 → 最后把写死文案收口到 config（单一真源） |
| O-2026-10-29-5 | `[sim-2d]` | 角色技能系统（第 3 项）只完成**纯逻辑模块 + 111 断言**，未接进 `main.lua`（两角色队伍/局内加点/AI 档位接管/HUD） | 🔄 断点 | 接口契约见 `docs/characters-design.md` §6.6；模块 `lua/tetris/skills.lua`（`loadModule('skills')`），单测 `lua5.3 tests-lua/skills_test.lua` |
| OCR-1（定位结论） | **全帧 OCR 地板 = 529ms（游戏退出）/ 929ms（游戏在跑）**，不是回归 | `docs/maintenance/ocr-perf-2026-10-22.md`；commit `0856fb0e`/`92f88c14`/`265fabdc` |
| OCR-2（定位结论） | **2.6GB 不是泄漏也不是权重**：det 全帧输入是主导项（694/852 MiB 单会话） | `docs/maintenance/ocr-vram-2026-10-22.md`；D514 |
