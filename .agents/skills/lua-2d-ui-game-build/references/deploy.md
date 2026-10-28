# 真机部署与写回（阶段 7）

> 本文件从 SKILL.md 拆出（2026-10-28 模块化，防单文件过长被截断）。
> 主入口 `../SKILL.md` 有索引与「动手前自查清单」；本文件是细节全文。

## 10. 阶段 7：真机交付

### 10.1 写回安全门（整图级）

五条同时过才交给编辑器（D558、D559）：

| # | 判据 | 怎么验 |
|---|---|---|
| 1 | root9 字段序不变：`501(索引) | 记录×N | 503(varint)` | 重建后重新 `parseWireMessage` 打印并比对 |
| 2 | 索引 501 的 id 序列 == 记录物理序列 | 逐条 diff |
| 3 | 成员列表无悬空引用 | `extractMemberIds` 逐条对照，dangling=0 |
| 4 | `Save_Level/<mapId>/<mapId>.gil` 与 `Temp/<mapId>.gil` **双写** | 两边都存在且内容一致 |
| 5 | 三方 sha 一致（Save_Level / Temp / 内存候选） | `sha256sum` 三条比 |

**整图剪枝前先做逆运算对拍**：在一次性新图上「造→删」，删完必须**逐字节回到原 sha**（实测 691290cc → 22,317B → 691290cc）。另外两条：`root9.501` 是**森林根集**（只过滤不重建，重建会索引错位）；`f503` 里既有 id 也有小序号，**只剔除 ≥1073741824 的值**（D559）。

### 10.2 编辑器写回纪律（顺序本身就是资产）

编辑器把地图常驻内存，**离开一张图时先把内存版写回磁盘** ⇒ 跨窗口的 CLI 改动会被下一次写回静默抹掉（D314，连节点图挂载一起洗掉）。

```
① 先离开我的图（切到别的存档，让它把旧内存写回，无所谓）
② CLI 一个窗口内做完所有 .gil 改动（实体/注入/挂载/变量）
③ 再切回我的图 → 从磁盘载入新内容
④ 然后才允许试玩
```

判据：每步记 SHA。**「改动没生效」和「改动被抹掉」是两种病**——前者查载入路径，后者必须比写入前后 SHA（D314 教训）。

### 10.3 部署与导入后核对

**首选路线：零导入直写（2026-10-27 定案，tetris v2 实测）**——改完 lua 后不让用户碰编辑器导入/实机脚本同步，CLI 一步到胃：

```bash
# ① 查游戏实际执行哪条脚本（挂载指向 ≠ deploy 写的那条！tetris 实测：活跃容器挂 main_2，而 deploy.mjs 只写 main_1 的 external ⇒ 白写）
gsts assets:scripts mounts --gil <图.gil>          # 看 host=<活跃容器节点> 的 script guid
# ② 把新 lua 直写进执行中的脚本（f5 内嵌 source + external + Temp 三同步 + 自动备份，一条龙）
gsts assets:scripts update --guid <执行中的> --source-file <注入版.lua> \
  --gil <图.gil> --map-id <id> --write            # --map-id 必带，否则 temp-sync=skipped（编辑器读 Temp！）
#    ⚠️ --source-file 必须用 **build 注入过的版本**，不是 lua/main.lua 原文！
#    原文里的 `__GUID_CELL__` 占位符=未定义全局 nil ⇒ TPL_GUIDS 表构造 {nil, …} 被 ipairs 在首个
#    nil 截断 ⇒ 候选表空 ⇒ 模板探测无声失败 ⇒ error() 无声死（真机症状=canvas/device 打完就没下文，
#    2026-10-27 实测）。注入版从 build 产物取：JSON.parse(save.json).assets.scripts[0].source。
#    验收判据用 `/cell = \{ \d+/`（数字形态）——**别用 includes('__GUID')**（注释里的文字提及会误报）。
# ③ 验收：sha256sum 双址一致（Save_Level/<id>.gil == Temp/<id>.gil）+ gil-guard 对比写前备份
#    （guard 若报悬空，先对备份跑同一检查——存量悬空是历史状态编辑器一直接受，只要「写前写后同样 FAIL」即本次未引入）
```

- 用户侧操作 = **打开地图直接试玩**，零导入零同步（模板/控件首次部署才走 GIA 导入，增量改 lua 一律走本路线）。
- 写盘前提：确认编辑器/游戏没开着该图（开着=内存版会在离开时覆盖写盘，D314）；用户开着时先请其切出，写完再切回。
- 多条脚本记录的图（main/main_1/main_2 并存是常态——历次导入各留一条）：把执行中的与易被切回的都 update 到同一内容，消除歧义。
- **多模块 Lua 的真机部署（2026-10-28 实测：v2.7 单文件拆 4 模块，真机漏部署 = 用户玩到旧版）**：
  官方口径「脚本资产可建多份映射，**未挂载的只作 require 模块**（不跑生命周期）」；require 路径 = 映射路径去 `.lua`，引擎自动补 `default_import_file/` 前缀。
  部署清单（缺一条就白部署）：
  1. `update` 主脚本（挂在宿主上的那条，如 main_2）——二重身 main_1 也同步，防切回；
  2. **每个模块都要 `register`**（f50 登记 + external 提取 + Temp 同步）：`assets:scripts register --name tetris_<mod> --path lua/<proj>/<mod>.lua --source-file <注入版> --gil <图> --map-id <id> --write`；
  3. **判据：`assets:scripts list` 的 registryEntries 数 == 主脚本数 + 模块数**（例：2 主 + 3 模块 = 6），且每个模块的 `external=<字节数>` 非 MISSING；
  4. 模块文件必须落在 `<槽>/external_lua_file/default_import_file/lua/<proj>/`（`ls` 核对文件名）；
  5. 部署后**必须让用户切出地图再切回**（编辑器/游戏内存版否则仍是旧的）——「CLI 回显全绿 ≠ 真机加载了新代码」。
  **注入点也可能搬进模块**（v2.7 把 `TPL_GUIDS` 移进 config.lua）：注入版判据要扫**所有模块**（`grep '= { \d\+'`），别只看 main。

**备用路线：GIA 导入（首次部署/模板变更时）**

- `node qxqy/deploy.mjs`：重建 + 复制 GIA 到 `Beyond_Local_Export` + 写地图 `external_lua_file`；`--calibrate` 先读真机 GIL 实际 guid 写进 `TPL_GUIDS` 再重建。
- 导入后核对三件事（`README.md` §10.8）：
  1. 模板 guid 是否又变（变了加到 `TEMPLATE_GUIDS` 首位）；
  2. 10 个服务端控件名是否都在（`GetChild` 按名取，名字变了就不显示）；
  3. 真机日志应有：`canvas WxH` / `tpl guid=…` / `cellCount=200` / `listen ok` / `guide stage=1`。
- **本机是 Arch + Wine prefix（2026-10-28 用户纠正），不是 Win11**：真实存档根目录 = `/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow/miHoYo/原神/BeyondLocal/`；`/mnt/wingames` 是只读旧镜像，不要写。
- CLI 口径：`GSTS_LOCALLOW_DIR` 要 `…/AppData/LocalLow`（源码自己拼 `miHoYo/原神/BeyondLocal`）并 `unset LOCALAPPDATA`；`deploy.mjs` 要 `…/LocalLow/miHoYo/原神`（它自己拼 `BeyondLocal`）（D585）。
- 本机 `flower-tea` 的模板重编号校准用 `qxqy/calibrate-device.sh <mapId> <scriptGuid>`（读模板名 → 重生成 device Lua → update → guard）。

### 10.4 试玩验收（三栏报告的上游）

- 新手：结算页「用时」∈[2:00,4:00]。
- 强玩家：消行率 ≥35% 且到 12 级。
- 红线：不出现「1 分钟内死」或「10 分钟不死」，各 3 局取中位。
- `elapsed` 只在 `guideStage == 1` 累加 ⇒ 结算页用时 = 玩家真实时长（不污染）。
