# 票 24 · 换机重建：Arch+wine 独立游戏路径 + 空图存档重建足球全部资产

> doc-type: A · status: in-progress（A、B 完成；前沿=C 资产重建）· updated: 2026-10-03
> 用户裁决原话（2026-09-30）：
>   ①「我们直接从空节点图建立存档。我们使用独立的游戏路径，使用wine运行的，你可以查看当前进程」
>   ② codebase-memory 技能退役（已完成提交 2f8c39a）
>   ③ 先更新看板/票据登记（本票+BOARD 即该裁决落地）
> 前置票：22（A/B 对比，定案未执行）、23（演出 v2，源码在飞未注入）——两票动作全部
> 依赖真实地图资产，随本票重建后在新存档上恢复执行。

## 0. 环境事实（2026-09-30 探测，进程+存档实据）

- 机器：WSL2 → Arch Linux。`/mnt/c` 不存在、无 LOCALAPPDATA → gsts 报
  `[error] LOCALAPPDATA not found; set GSTS_LOCALLOW_DIR`（src/cli/gil_paths.ts:75）。
- 游戏载体：anime-game-launcher（runner spritz-wine-tkg-staging-wow64-11.14-1，
  prefix=/home/h/.local/share/anime-game-launcher/prefix；游戏目录 /home/h/.ys → bwrap 沙箱 /tmp/sandbox/game）。
- 存档根（GSTS_LOCALLOW_DIR）：
  `/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow`
  （China 区拼 miHoYo/原神/BeyondLocal，与 gil_paths.ts:84 口径一致）。玩家 110170759 不变。
- 存档现状：仅一张近空地图 `Beyond_Local_Save_Level/1073741825/1073741825.gil`
  （21889B，09-27/28 建，含 external_lua_file/ 目录）+ Temp 同名副本。
  **足球地图 1073741908 在新存档不存在**——旧机全部资产（信号/变量/实体/挂载/技能配置/
  造物/假人/四服务端图+客户端图）不可迁，须从空图重建。
- 🔴 工具链缺口：新版存档为**子目录式** `Save_Level/<mapId>/<mapId>.gil`，而
  gil_paths.ts:176 只认平铺 → 已登记 open-items O-2026-09-30-01，本票 A 步先修。

## 1. 本地仅存的足球资产事实（重建参照，非可注入状态）

- 源码：examples/football/src-fb/**（HEAD fe2d5d3 起含票 23 v2 哑执行器在飞改动，build 曾绿）
- 编译产物：examples/football/dist-fb/**.gia 停在 09-07（早于 09-16 v2 源码）→ 重建前必须重编译
- 地图备份：.gsts/backups/1073741908.*（最晚 09-02，早于最后注入 09-07 POST 358563b2，
  仅作资产 ID/结构参照，勿直接回写）
- 票据/预计算工具：.scratch/football-v2/issues/01-23；shotcalc 在 .scratch/_archive/football-v2/evidence/ab-22/
- BOARD 资产速查即重建清单（31 球变量/11 镜像/22 参数/信号 771-776+783-785/技能配置
  2337·2339·1098907653·1098907654/丘丘人 def 1082130433+5 实体/假人 prefab 1077936131/四服务端图+1830..1837）

## 2. 执行阶段

- **A 工具链适配 ✅（2026-10-03 提交 8e00f8a）**：gil_paths 新增 gilPathInSaveLevel
  （双布局解析，子目录式优先）+ saveLevelDirOf（gil 路径反推 Save_Level 根）；
  resolveGilTarget/syncGilToTemp/listMaps（含去重防 createMap 撞 ID）/renameMap/resyncMap/
  gsts·image-editor 解析点/assets_* 备份与 Temp·gip 同步基准全部改双布局。
  验证：build 绿 + tests/cli_maps_layout.ts（新回归）+ cli_maps_json.ts PASS + 真存档只读
  实测（maps 列表见「未分类页签_存档」，resolveGilTarget 指向嵌套路径，saveLevelDirOf 正确）。
  关闭 O-2026-09-30-01。附带修复：node_modules/.bin 18 个坏符号链接（换机遗留，
  0 字节文件需先删再 npm install 重建）；tests/cli_maps_ops.ts 依赖旧机
  ~/genshin-ts-evidence 夹具，Arch 无法运行（环境性遗留，非本次改动引入）。
  GSTS_LOCALLOW_DIR 尚未固化到 shell 配置（当前会话内 export；B 确认后随重建脚本落 .env 约定）。
- **B 地图落点 ✅（2026-10-03 用户裁决：沿用+改名）**：1073741825 经
  `maps:rename` 改名「真实足球」（原「未分类页签_存档」）。**SHA 基线锁定**：
  `5ab667e8d076a516695b0adf0495af8dfe2ace19922572ba3ac73f11ba884442`（21879B，嵌套路径）。
  本次同时完成新布局下首次真实写回端到端验证：备份落 `Save_Level/.gsts/backups/`✓、
  Temp 平铺同步✓、gip 双注册表名更新（xxd 核对 UTF-8「真实足球」+页签链接 1600/map id 完好）✓。
  改名前备份：`1073741825.gil.2026-10-03T08-13-28-069Z.rename.bak`。游戏未运行时写回；
  注入配置 mapId 1073741908→1073741825 待 C 段随注入链统一改。
- **C 资产重建 ✅（2026-10-03 执行，真值源=.scratch/_archive/football-v2/evidence/ab-22/
  map-2026-09-07_14-37-43_3231_110170759.gil＝换机前终版拉取快照，比 09-05 的 20-d-pre-inject
  更新：含 fb_show_* 12 变量、假人 A/B、TickManager、fb_p_dt=0.06/fb_p_drive=0.12、§10 修复A
  drop_sz=-30）**。重建方式=CLI 逐类复刻（用户裁决①「从空节点图建立存档」口径），非整图迁移：
  - 信号 10 个全部**旧 ID 精确保号**（fb_echo 771-773 / fb_ball_state 774-776 六参 vec3 /
    fb_sv_echo 777-779 / fb_idle_state 780-782 / fb20_echo 783-785 / fb20d_echo 786-788 /
    TickUpdate_60/200/1000 789-797 / **fb_ball_drive 798-800**——v2 渲染主链驱动信号，首版
    清单漏它，编译报 not registered 后补）。注册法：register --template-gil <3231> +
    显式 --send/--monitor/--server-id + --param（donor 只给 wire 布局，参数必须显式传；
    update 不能改 ID 也不能带 donor——两次返工后定案）。
  - 图槽 17 个 `create --graph-id` 显式旧号：服务端 20000=1821 fbShowDir/1830 fbRender/
    1831 fbSvlisten/1832 fbIdleListen/1833 fbSink/1834 fbRender_1(空,终版未挂)/1835 fbInput/
    1836 fb20cServer/1837 fb20dUi/1838 TickManagerAsset；客户端 20008=433 fbPhysSkill/
    436 fbLoop/437 fbPhys2、20009=434 fbPhysStatus、20007=435 fbPhysDecision、20002=439
    fb20cPhysRole/440 fb20dCalib。**旧 v5 四图 825-829 + 438 官方造物图不重建**（终版未挂载）。
  - TickManager(1838)=`node-copy-from` 从 3231 整图 28 节点复制（29 数据流+10 执行流回读一致；
    复合节点引用旧信号 ID，信号保号后无需 patch）。
  - 静态装配（assets/plans/rebuild-c4.mjs）：足球场 def 6129(84 aux)/足球门 def 6130(142)/
    足球_1 def 6138(222,无底座)+basicMotion+tabBar 9 选项 sphere r5/演出假人 def 6131(2 items)；
    操作台 def 6136 终版无实体**不重建**；gen-1 球(6131 旧义)**不重建**。
  - 实体 14 个 import（rebuild-c4-entities.json，终版坐标）：场 6132/左门 6133/右门 6134/
    球 6135([-0.634,0.25,-1.960] scale .25)/假人A 6137[5,0,1]/假人B 6141[14,0,2.5]/
    空模型 6139(scale 3×0.01×3)/丘丘 437-441+444+445/计算物理 448。实体层 aux 由 import
    自动物化（84/142/142/222/2/2 全对上）。6139 的单装饰物(1073744422)**跳过**（隐藏件，
    TickManager 不依赖）。
  - 变量：球 6135 = 终版 72 个逐字复刻（含 fb_p_dt=0.06/fb_p_drive=0.12/手感三件/fb_show_*
    12 个/§10 修复A drop_sz=-30）；玩家 def 737+九副本各 E1 寄存器 11 个；丘丘 def 433+7 实体
    各 fb_ball_entity:entity=0；6139 tm_beat_interval_s=0.06。
  - 挂载（与终版逐一核对）：球 6135←(1833,1835,1830,1821) 顺序一致；玩家 def+九副本←1837
    fb20dUi（终版=玩家侧，09-05 快照的「角色侧」是中间态）；6139←1838 TickManager。
  - 技能配置 5 个（2337→433 / 2338→436 / 2339→437 均 28 造物瞬发；1098907653→439、
    1098907654→440 均 6+瞬发 body-f5）。
  - **root15/16 移植发现+补齐**：3231 还有 50 个技能变量槽(type30, 1207959553-602)+状态
    6129/6130/6131+自定义职业(1090519041)——首版清单全漏；CLI 无对应 create，写
    /tmp/sync-root15-16.mjs 从 3231 按 root 分 donor 移植（append 56+replace 2；记录数
    72=3231 72 对齐；唯一长度差 15:1191182337 104B vs 90B=CLI 版本差异，结构等价已核）。
    **6132「定时触发技能」参数=终版原样：间隔 0.06+槽 12+技能引用空**（22 票 §8 想引
    1098907653 但终版未配——留给 22 票执行段定夺，audit 回读三方一致）。
  - UI 按钮：旧 ID 1073741843 被新图 official ClientUIRootHierarchyRoot 占用 →
    **新 ID 1073741845**，src-fb/fb20d-ui.ts BUTTON_ID 已同步改（唯一源码改动）。
- **D 链路复测可执行部分 ✅（2026-10-03）**：11 个 gsts 配置 mapId 1908→1825 批量迁移；
  fb-client 全量重编译（20 .gia 全 [ok]，含 09-16 v2 哑执行器：render 1830=8 节点）；新增
  gsts.fb-sink-inject.config.ts；**主链 9 图注入**（1833 sink 11n / 1835 input 108n /
  1830 render 8n / 1821 showdir 113n / 437 phys2 705n / 439 20c-loop 682n / 1836 20c-server
  22n / 440 20d-calib 14n / 1837 20d-ui 39n）；1838 TickManager 28n 复制件注入后存活✓；
  信号表注入后 10 个全带参✓（注入器重建 root10 未破坏信号注册——skill D 节风险已核）。
  终态 **SHA 554010acd549b0b8e743cb94b91a7e048dfd255ef349731133a7c5571e73c09e**（688952B，
  Save_Level=Temp 双址一致，2026-10-03 16:48）。maps 列表显示「真实足球」✓。
  未注入（有意留空）：433/434/435/436/1831/1832（暂停/退役线，空图不执行）；1834 空位。
- **D 用户复测部分（待用户进图）**：见票尾复测清单。

## 3. 验收

- A：gsts 对子目录式存档定位+Temp 同步实测 PASS（1073741825）。
- C：decode 断言门禁全绿（复刻 03/04 票口径：42/42+38/38 级别）。
- D：进图后按 23 票 §7 用户目视预期句复测；负载口径对照 §12（空闲 sink~600 边界）。

## 4. 用户复测清单（D 收口门槛，进图=1073741825「真实足球」，注入后需重载地图）

1. **资产目视**：球场白线/双球门/足球本体/2 假人/8 丘丘人在位；球初始位于场内
   (-0.63, 0.25, -1.96) 附近。
2. **E0 空跑**：进图后球应有落体归位（RESET 语义）；靠近球 5m 出现 9 选项 tabBar
   （轻射/重射/高吊/内旋弧/外旋弧/上旋低平/下旋/横传/复位）。
3. **22 票 A 线（PK 物理链）**：A 线当前条件=技能配置 2339(fb-phys2 437)在位+TickManager
   节拍 0.06 在位；但 6132 状态技能引用为空（终版原样）→ 若 A 线无自动踢动，属预期，
   待 22 票执行段决定引 1098907653 或 TickManager 路线后再复测。
4. **23 票演出**：进图 ~2s 后应见 ACT-1 旋转落体滚向假人 A(5,0,1)→传球→泄力→弧线抽射
   入网（§10 修复 A 已含：drop_sz=-30）；预期停点 (4.22,0.98) 附近；若球停在假人身上/
   穿模即 §10 现象复现。
5. **负载口径**：空闲时 sink ~600 边界（§12）；异常卡顿/掉信号回报日志。

预期失败信号：进图黑屏/地图异常=静态装配 wire 问题；球不动=物理链断；tabBar 不出现=
组件三层未同步；演出不动=showdir 未触发（查 TickManager/信号）。

## 5. 首轮复测反馈补遗（2026-10-03，用户进图后两项反馈）

1. **草皮缺口（已修）**：§2 重建清单漏了地形层（root7 f4，独立于实体层）——3231 真值源
   625 格（25×25，col/row 98–122）vs 新图默认 400 格（20×20）。修复：`assets:terrain
   set-range --col-min 98 --col-max 122 --row-min 98 --row-max 122 --gil <1825> --write`
   +手动 Temp 同步（terrain --write 不自动同步）。写前底稿复核：用户游戏会话已回写
   Save（SHA 554010ac→4ebacafa，688952→679511B），候选基于最新盘上状态生成。
   终态双址 SHA **425a9ffc…c8bf**（Save_Level=Temp=预验证候选）。备份：
   `.gsts/backups/1073741825.gil.2026-10-03T10-33-31-167Z.bak`。
   教训：重建完备性判据=donor 图全部 root 层枚举，实体层 26=26 会掩盖地形缺失。
2. **假人 B 坐标疑问（考古澄清，未改动）**：用户记忆"假人比现在远"正确——3221 时代
   （09-06，用户最后实测版）B=(30,0,2)（38m 长传远射）；09-06 00:31 主动改参 B→(14,0,2.5)
   +pass 13/4/2+shot 29/5/-2+b_trap=8（动机：运动段峰值 3642 帧/s 贴近 5000 边界），
   改参版用户从未玩过即换机。重建照抄 3231 终值无错。若回滚 38m 版需连动改 fb_show_*
   演出变量（预计算配套），非单纯挪实体。假人 A=(5,0,1) 全历史未动。
