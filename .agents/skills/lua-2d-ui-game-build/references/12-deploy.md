# 12 部署（让用户真的看到新版）

> **本章的目标只有一个**：消灭「**还是老板版**」。
> 本次会话里它出现了 **4 次**（T3/T4/T24/T48），每次都是用户先发现、我们后补救。
> 用户原话（T24）：「我去真机试玩了，感觉还是老板版，我给你提的问题，全部都在呀。你仔细检查一下，是不是id，挂载等等我老是和你强调的问题又犯了。」
>
> 出处：`18-evidence.md` F 组；日志锚点：`hud inst n=` / `module ok` / `tpl guid=` / `registryEntries`。

> **先解决"文件在哪"**（零上下文实测的卡点）：
> - **地图 `.gil` 路径**：`<LocalLow>/miHoYo/原神/BeyondLocal/<uid>/Beyond_Local_Save_Level/<mapId>/<mapId>.gil`
>   （`<uid>` = 110170759，`<mapId>` 见编辑器标题；**漏掉 uid 这层**会报"没有那个文件"）。
> - **注入版从哪来**：`node -e "const s=JSON.parse(require('fs').readFileSync('<proj>.save.json','utf8'));require('fs').writeFileSync('/tmp/inject-main.lua', s.assets.scripts[0].source)"`
>   —— 这就是要喂给 `--source-file` 的**注入版**（源文件原文会白屏，见 §2）。
> - **试玩服务**：`http://127.0.0.1:4173/editor`（`/play` 直开 404，必须从编辑器点「▷ 试玩 ↗」）。

## 1. 部署三处（缺一处用户就看不到新版）

| # | 位置 | 谁读它 | 漏了会怎样 |
|---|---|---|---|
| 1 | 仓库 `workspace/<proj>/<proj>.save.json` | `node qxqy/runner.mjs`（用例） | 用例测的是旧代码（假绿） |
| 2 | 模拟器工作区 `~/qxqy-workspace/<proj>.save.json` | **网页 4173 的试玩页** | 你自己/用户网页里看到旧版 |
| 3 | 真机地图脚本记录 + external 文件 | 游戏本体 | 真机跑旧版（最常见） |

**判据**：
```bash
sha256sum workspace/<proj>/<proj>.save.json ~/qxqy-workspace/<proj>.save.json   # 1 和 2 应一致
# 真机：Save_Level 与 Temp 同 sha（见 §3 的 update 输出）
```

> 真实踩坑（2026-10-28）：只更新了 ①（369,644 B）没碰 ②，工作区那份还是 `327,506 B / 10-27 23:05`、只有 1 条脚本映射 → 用户在网页里看到的是上一版。

## 2. 零导入直写（首选路线，不用手动导入 GIA）

**为什么**：v1 时代每次都要用户手动「导入 GIA → 放 UI 空间 → 保存」，因为 `deploy.mjs` 只写了 `main_1` 的 external，而**游戏实际执行的是挂载在活跃容器上的 `main_2`**。

**一条龙（三步）**：

```bash
# ① 查"游戏实际执行哪条脚本"——这是最容易错的一步
gsts assets:scripts mounts --gil <地图.gil>
#   → 看活跃容器挂的是哪条（可能不是 deploy.mjs 写的那条）

# ② 直写（f5 内嵌 source + external + Temp 三同步 + 自动备份）
gsts assets:scripts update \
  --guid <执行中的脚本 guid> \
  --source-file <注入版.lua> \
  --gil <地图.gil> \
  --map-id <地图 id> \
  --write
#   → --map-id 必带，否则 temp-sync=skipped（编辑器读 Temp，不同步等于没写）

# ③ 验收
#   · 输出里 temp-sync=success
#   · Save_Level 与 Temp 文件同 sha
#   · gil-guard 的悬空报告要与"写前备份"对比：备份也有 = 存量，不是本次引入
```

**注入版铁律**：`--source-file` 必须是 **build 产物**（`JSON.parse(save.json).assets.scripts[0].source`），不是源文件原文。
> 源文件里的 `__GUID_CELL__` 是 build 时注入的占位符；用原文 → 占位符是 `nil` → 表构造 `{nil, 1073741849, …}` 被 `ipairs` 在首项截断 → 候选表空 → 模板探测失败 → `error()` **无声死** → 白屏，日志只打到**启动链最前面的两行**（`canvas <W>x<H>` 与其后一行设备/画布信息）就断。

**验收判据（必须用数字形态，不能用字符串包含）**：
```bash
# ✅ 正确：看是不是数字
grep -E '/cell = \{ [0-9]+/' <注入版.lua>
# ❌ 错误：includes('__GUID') 会被注释里的说明文字误报为"已注入"
```

## 3. 多模块 Lua（最容易漏的一步）

**官方形态**：脚本可以建多份映射，**未挂载的只作 `require` 模块**；`require` 路径 = 映射路径去掉 `.lua`（引擎自动补 `default_import_file/`）。

**部署清单（少一步就白屏/跑旧版）**：
1. 更新**主脚本**（挂在宿主上的那条）——如果有两条记录（`main_1`/`main_2`）都要更新成同一内容（否则编辑器切回哪条都不确定）。
2. **每个模块都 `register`**：
   ```bash
   gsts assets:scripts update --name <proj>_<mod> \
     --path lua/<proj>/<mod>.lua \
     --source-file <注入版模块.lua> --map-id <id> --write
   ```
3. **判据：`registryEntries == 主脚本数 + 模块数`**（这是唯一可靠的数字判据）。
4. 模块 external 文件落在 `<槽>/external_lua_file/default_import_file/lua/<proj>/`。
5. **让用户切出地图再切回**（编辑器/游戏内存版否则仍是旧的）。
6. **注入点可能搬进模块**（例如模板 GUID 常量放在 `config.lua` 里）→ 检查时要扫**全部**脚本，不是只看 `main.lua`。

**日志验证**：真机启动日志出现 `module ok config` / `module ok widgets` / `module ok audio`（每个模块一行）。

> 真实事故（T24）：v2.7 拆成 main+config+widgets+audio，但真机登记表只有 3 条旧脚本 → 游戏跑的一直是拆分前的单文件旧版。修完后的日志：`module ok ×3`。

## 4. 版本指纹（自查"跑的是哪版"）

在启动日志里留**稳定前缀**，越具体越好：

| 指纹行 | 含义 |
|---|---|
| `canvas <W>x<H>` | 画布尺寸探测成功（**启动链第一行**；日志只到这里就断 = 之后立刻死了，见 §2 注入版 / `13-device.md` §1） |
| `tpl guid=<n> / hit=<n>` | 模板探测成功（数字形态，不是占位符） |
| `cellCount=<n>` | 批量实例化元素数 |
| `listen ok ×N` | 键位注册数 |
| `module ok <mod>` | 模块加载（每个一行） |
| `hud inst n=<k> (textbox hidden)` | HUD 双写生效 |
| `menu stage n=<k>` / `menu cards n=<k> style=<X>` | 标题页版本 |
| `bg pool n=<k>` | 背景池 |

**用法**：用户说"还是旧版" → **先取真机日志看指纹**，再决定改不改代码。
- 指纹是旧的 → 问题在部署（本章），不是代码。
- 指纹是新的 → 问题在代码/渲染（`17-symptoms.md`）。

> 本次：`menu stage n=22` 证明 v2.7 生效；`hud inst n=9 (textbox hidden)` 证明双写生效。这两行曾各救过一次误判。

## 5. 写盘纪律（别把编辑器/队友的东西抹掉）

- **编辑器/游戏开着该图时先让用户切出**——编辑器把地图常驻内存，离开时会把**内存版写回磁盘**，可能覆盖你刚写的。
- **Temp 必须同步**（`--map-id` 必带）。
- **写前留备份**（`update` 自带备份；手工路径要自己留）。
- **guard 报的悬空要和写前备份对比**：备份也有 = 历史存量（编辑器一直接受），不是本次引入。

## 6. 环境变量（两个口径，会连着踩两次）

**跨系统迁移（2026-11-25，Linux/Wine → Win11，已验写盘与回读，游戏行为待验）**：
- 先按当前系统探测真实存档根；本轮 Windows 为 `C:/Users/Administrator/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/`。游戏安装在 E 盘不代表存档也在 E 盘；下方 Wine 路径只适用于旧 Linux 环境。
- 已有可用部署版可整体迁移 `<mapId>/`（`.gil` + 完整 `external_lua_file/`），保留已校准 GUID；先查目标 ID 无冲突、备份目标玩家目录，禁止整份覆盖 Windows 玩家 `.gip`。
- 复制后用 Windows 存档根运行 `maps:resync --map-id <id>`，合并注册列表并同步 Temp；逐文件 SHA 对账、`assets:scripts list/mounts` 回读、`gil-guard.py --temp` 验收。保留原部署版无需重建玩法。
- `node_modules` 是 Linux 装的（只有 linux-x64 esbuild）⇒ Windows 上跑 `gsts` 前执行一次 **`node scripts/setup-win-esbuild.mjs`**（幂等，`--check` 可查）：把与 `node_modules/esbuild` 同版本的官方 win32 `esbuild.exe` 装到 `node_modules/.cache/gsts/esbuild-win32-x64-<版本>/`，不碰依赖树（先复用已有副本，否则从 npm registry 下载并按元数据校验 sha512）；`ESBUILD_BINARY_PATH` 可覆盖。别再手工解包到 `%TEMP%`（会被清理）。
- 本轮完整记录：`workspace/tetris/docs/deploy-win11-20261125.md`。磁盘迁移通过仍需用户重新进入地图；编辑器已打开时勿保存旧内存覆盖新注册表。
- **搬运脚本（同日足球二次实证，`examples/football/DEPLOY-WIN11-20261125.md`）**：`scripts/deploy-map-dir.ps1` —— fail-closed（目标 `<mapId>/` 已存在即拒绝，不做覆盖式更新）；先落 `<mapId>.deploy-tmp/` 逐文件校验 SHA256，全过才同卷原子改名；只搬地图目录、不碰 `.gip`/Temp（`maps:resync` 是独立的下一步）；`-DryRun` 只盘点，`-ManifestPath` 写逐文件清单。`.gsts/`（CLI 备份历史）不搬——游戏不读，CLI 下次写回自建。
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File <skill>/scripts/deploy-map-dir.ps1 `
    -SourceSaveLevel <源>/Beyond_Local_Save_Level -TargetSaveLevel <目标>/Beyond_Local_Save_Level `
    -MapId <id> -ManifestPath <备份目录>/deployment-manifest.json [-DryRun]
  ```
  系统执行策略为 Restricted 时 `.ps1` 一律被拦：`-ExecutionPolicy Bypass` **只对该子进程生效**，不改系统设置。
- **`.gip` 验收升级为字节级**（别再用"大小变了"当注册成功）：写前备份玩家级与 Temp 两个 `.gip` → `maps:resync` → 把写后文件去掉「页签链接 `2A 09 08 C0 0C 10 <图ID varint>`（11 B）」与「新增条目 `12 <len> …`」后与写前逐字节比较，**只允许差 4 个长度字段**（文件总长 / payload 长 / field1 长 / 「未分类页签」容器长）；旧条目与 field 3「最近地图」必须原样。足球实测 153→194 B＝11＋30（条目＝2＋6 id＋2＋名字 UTF-8＋6 时间戳）。`maps:resync` 幂等，重跑只刷新该图条目的时间戳。
- **编辑器开着时的竞争**：引擎进图/退图会重写 `.gip`（实测 21:07:22 / 21:26:40 / 21:41:46 三次）。CLI 注册后要复核条目仍在——足球实测条目扛过了后两次重写（194 B，逐字节含条目），但只证明这一种重写路径；列表看不到就重跑 resync，或退出千星编辑器再进。
- **Win11 跑仓库的 Python 件**：PATH 里没有 `python3`/`python` ⇒ 一律 **`node scripts/py.mjs <脚本.py> [参数]`**（`GSTS_PYTHON` → PATH 里的 python3 / python / py -3 → DSH 运行时，逐个 `--version` 实测，子进程固定 `PYTHONUTF8=1`）。提交钩子已走同一条路——新机器先 `bash scripts/install-git-hooks.sh`，提交时无需任何设置；禁止 `--no-verify`。教训：只设 `PYTHONIOENCODING=utf-8` 会让门禁子进程读取线程抛 `UnicodeDecodeError`，旧实现下子检查 FAIL 时门禁自身崩溃（账本 F-20261125-96，门禁 `doc-health-utf8`）。
- CLI 环境包装范例：`examples/football/gsts-win.mjs`（football 专用；别的工程照抄改路径）——免得每条命令重复两个环境变量。新 Win11 机器的首次就绪＝两条命令：`bash scripts/install-git-hooks.sh` ＋ `node scripts/setup-win-esbuild.mjs`。

```bash
# CLI（gsts assets:*）要的是 LocalLow 这一层
export GSTS_LOCALLOW_DIR=/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow
unset LOCALAPPDATA

# qxqy/deploy.mjs 要的是 LocalLow/miHoYo/原神（它自己会拼 BeyondLocal）
# 传错会报 BeyondLocal 找不到
```
**记忆法**：**CLI 吃到 `LocalLow`，deploy.mjs 吃到 `原神`。**

## 7. 交付前的部署自查（复制粘贴）

```bash
# ① 三处同步
sha256sum workspace/<proj>/<proj>.save.json ~/qxqy-workspace/<proj>.save.json

# ② 真机执行的是哪条
gsts assets:scripts mounts --gil <地图.gil>

# ③ 注入版判定（数字形态）
grep -E '/cell = \{ [0-9]+/' <注入版.lua>

# ④ 200-local 余量
grep -cE '^local ' lua/main.lua                    # ≤150

# ⑤ 登记数对账
#   registryEntries == 主脚本数 + 模块数

# ⑥ 双址同 sha（update 输出里看 Save_Level / Temp）
```
**然后**：让用户**切出地图再切回**，取真机日志逐项对指纹。

## 8. 反模式

1. **只用字符串包含判占位符** → 注释误报。
2. **只更新仓库 save 就通知用户看网页** → 用户看的是工作区那份。
3. **多模块只部署主脚本** → require 全失败或跑旧版。
4. **`--map-id` 省掉** → Temp 不同步，编辑器/游戏读到旧的。
5. **写完不切图重载** → CLI 全绿但真机没变。
6. **"CLI 说成功"就当已生效** → CLI 只证明写盘成功，不证明真机加载了。
7. **`deploy.mjs` 成功就当真机更新** → 它可能写的是没被挂载的那条脚本。


## 9. 2D UI 容器一条龙（模板 → 布局实例 → 脚本；2026-10-29 CLI 闭环）

**三层关系（先记这三句，后面所有判断都从这里推）**

| 层 | 谁渲染 | wire 判别 | 动态创建 |
|---|---|---|---|
| **布局实例** | 进游戏就渲染（`f504=布局ID`） | 族 `f13{f501=模板组}`+`f501=3` + `f504=布局` | 不参与 |
| **容器模板** | 不进布局就不渲染 | 族 `f501=4`，**无 f504** | 运行时 `InstantiateClientUIControl(tplGuid, root)` 从模板克隆 |
| **容器节点** | 挂载点（`script.object`） | 组/实例组的成员，**无 f504**；子控件在节点顶层 `f503` | — |

> 关键事实：**容器模板节点下的子控件是直接 client 控件（各有自己的记录与 `f504=节点ID`），不是模板引用**；
> 把模板拖进布局 = **整棵子树复制**（编辑器实测：16 个文本框在实例侧是 16 条新记录）。

**命令（`gsts assets:ui container …`；默认 dry-run，写回须 `--write --yes`）**

```bash
export GSTS_LOCALLOW_DIR=/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow
unset LOCALAPPDATA
GIL=<地图.gil>

# ① 发现：从导入后的图里自动找容器模板（--baseline 给导入前的图 = 只认新增的）
node dist/src/cli/gsts.js assets:ui container discover --gil "$GIL"   --baseline <导入前.gil> --format json
#   → template=<组ID> name=<名> node=[<节点ID>] children=<n> kinds={client-textbox:16} mounts={host->script}

# ② 实例化到默认布局（复制整棵子树 + 布局 f503 追加 + 模板 f14 实例列表追加 + 挂载随记录复制）
node dist/src/cli/gsts.js assets:ui container instantiate --gil "$GIL"   --container <组ID|名字|all> --layout 默认布局 --write --yes
#   → instance template=… -> group=… node=… records=<n> children=<n> mounts={…} selfCheck=pass

# ③ 脚本：新实例节点若没继承到挂载，就手动挂（宿主 = **布局实例的容器节点**，不是模板节点）
node dist/src/cli/gsts.js assets:scripts mount --gil "$GIL"   --host <实例节点ID> --script <脚本guid> --write

# ④ 保存 + 同步（写 .gil 与写 external lua 都要落到 Temp，否则编辑器/游戏读旧的）
node dist/src/cli/gsts.js assets:scripts update --gil "$GIL" --name <脚本名> \
  --source-file <注入版.lua> --map-id <地图ID> --write
node dist/src/cli/gsts.js maps:resync --map-id <地图ID>

# ⑤ 验收读数
node dist/src/cli/gsts.js assets:ui list --gil "$GIL"
node dist/src/cli/gsts.js assets:scripts mounts --gil "$GIL"
sha256sum <Save_Level>/<地图ID>.gil <…>/Temp/<地图ID>.gil   # 必须同 sha
```

**存为模板**（库/布局实例 → 容器模板；编辑器同款语义）：
```bash
node dist/src/cli/gsts.js assets:ui container save-template --gil "$GIL" --instance <实例组ID> --write --yes
#   → 新模板组/节点新建，实例 f13 改指新模板、实例改名去重 _1，旧模板 f14 摘除该实例
```

**交付前的四条硬前提（2026-10-29 B 图事故 + 首存丢源码事故后固化，缺一条要么子树被剪、要么脚本失效）**：
1. **两个容器节点都必须至少有一个子控件**（模板节点 + 布局实例节点）。空节点会被编辑器保存时剪掉，
   `f74` 脚本挂载随之消失 → 真机 `mounts=0`、界面空白。`container instantiate` 现在会自动补
   **占位子控件**（默认名 `gsts_anchor`，1×1 @ `-2000,-2000`，可用 `--placeholder-name` 改名）。
2. **占位件/新建记录 ID 必须 ≥ `1073742500`**。低位段是编辑器的动态分配区
   （`ClientUIRootHierarchyRoot` / `ClientUIPrototypeHierarchyRoot` / 模板实例都会占它），
   低 ID 会被改分配 → 子件消失 → 节点变空 → 整棵子树被剪。
   `assets:ui create --on container:<节点>` 已强制走该安全段。
3. **地图必须已有 ClientUI 层级根（族 87/88）**：`ClientUIRootHierarchyRoot` / `ClientUIPrototypeHierarchyRoot`。
   缺这两条根的地图（如 `1073741842` 霜华纪原始图），**编辑器一打开就会自建它们**（占用的正是容器节点
   用过的 ID），随后整棵客户端容器子树被丢弃/重编号、挂载全没。`container instantiate` 现在会先 preflight：
   ```bash
   # 缺根时把这两条根从一条已有根的地图（只读）复制进目标图
   node dist/src/cli/gsts.js assets:ui container instantiate --gil "$GIL" \
     --container <模板组ID> --system-donor <已有87/88根的图.gil> --write --yes
   #   没有 donor 又确知后果时才用 --allow-missing-roots（默认 fail-closed 拦下）
   ```
   查目标图有没有根：`node dist/src/cli/gsts.js assets:ui container discover --gil "$GIL" --format json`，
   JSON 里 `templates/instances` 之外看记录的 `familyTypes` 是否含 87/88（或直接看
   `assets:ui list` 里是否有 `ClientUIRootHierarchyRoot`）。
4. **写脚本必须同时落「外置 Lua」**：编辑器保存时会把 root50 的内联源码外置成
   `external_lua_file/<filePath>`。只写内联 = 首次保存后**两边都没有源码**
   （实测 150,410 B → 29,947 B、root50 剩 46 B、`assets:scripts list` 报 `external=MISSING`、脚本静默不执行）。
   判据：`externalLuaDestOf(<地图.gil>, <entry.filePath>)` 那个文件存在、含 UTF-8 BOM、
   里面写死的模板 GUID 已是本图真实模板 ID。详见 §9.3。


**新地图也是 CLI 做的**：`maps:clone --from <已导入的图.gil> --name <名>` 克隆成新地图 ID
（只改写 root 1/2/39/40，其余资产段/脚本登记表原样；内联 Lua 会物化到 `<新图目录>/external_lua_file/`），
之后照上面 ①②③④ 走（或直接用 §9.3 的 `sim:import --apply` 一步到位）。

### 9.1 三组 fixture 差分验收（禁止写死模板/ID 的判据）

输入 = 三组真机 GIA 导入快照（`workspace/flower-tea/device-package/`，只读）：

| fixture | 容器模板 | 子控件 | 用来证明 |
|---|---|---|---|
| `1073741843.after-import-20261029.gil` | 1 个（空容器） | 0 | 空容器也要生成布局实例 |
| `1073741843.after-import2-20261029.gil` | 3 个 | 0 / 0 / **16 个 client-textbox** | 子树规模随 GIA 变化 |
| `1073741843.after-import3-20261029.gil` | 4 个 | 0 / 0 / 16 / **7 个 HUD 文本框** | 再换一种 GIA 仍然对 |
| 基线 | `1073741843.before-import-20261029.gil` | — | `--baseline` 差分只认新增 |

```bash
npm run test:ui-container     # = npm run build && npx tsx ui/tests/container-from-import-assert.ts
# 期望：CONTAINER-FLOW-RESULT fixtures=3 assertions=24 verdict=PASS
```

**它证明什么（24 断言）**：
1. 发现结果 = 源 `.gil` 推导的容器模板集合（ID/名字/子控件数全部**由记录推导**，CLI 里没有任何 donor/常量）；
2. 每个模板都能生成布局实例：`f504=布局`、族 3 描述符引用模板组、布局 `f503` 追加、模板 `f14` 追加、
   子控件逐条复制（子 `f504=新节点`）、`assets:ui list` 读回子树与源容器同构；
3. 脚本挂载从模板节点复制到布局实例节点（`assets:scripts mounts` 读回同 script guid）；
4. **两组黄金差分**：CLI 产物 vs **编辑器自己**造的实例（`1073741840.after-layout-templates` 的 2049/2050+16 子）
   与 after-save-template（1852/1853）→ 归一化 ID 后**逐字段 0 差异**；
5. 写回闸门：`--write` 不带 `--yes` 必须拒绝，且拒绝时不改源文件；fixture sha 全程不变；
6. **B 图事故回归（4 条）**：用 `workspace/ganyu/device-package/1073741842.final.gil` 复现 B 流程——
   ①缺 87/88 根必须被 preflight 拦下（不产出候选）；②容器节点下 `create` 的子控件 ID ≥ 2500；
   ③`--system-donor` 补齐两条层级根后，**模板节点 + 布局节点 + 两个占位子控件 + 双向引用 + 索引**全在；
   ④`scripts mount` 后 `mounts` 读数只有布局实例节点那一条、`list` 视图能看到 `gsts_anchor`。
   **注意**：断言里没有任何写死的模板/容器/子控件 ID，期望值全部由源 `.gil` 推导。

**判断"我造的和编辑器一样"的正确做法**：不能只比子树形状（形状同构也可能字段写错——
本轮就抓到"把所有 `f502` 族描述符都替换成实例描述符"，形状仍同构但 8 行字段差异）——
**按字段路径归一化 ID 后逐行比对**。

### 9.2 两张新地图（2026-10-29 交付，可复现）

| 地图 | ID | 名称 | 大小 | Save/Temp sha256（两址同 sha） |
|---|---|---|---|---|
| A | `1073741844` | 花间茶会·一条龙 | 149,594 B | `1c7c3f1a4371dd6ecfb079e6e3e3ffd80cf0a55bb557d65687e709bfaa7bc477` |
| B | `1073741845` | 霜华纪·容器一条龙 | 240,111 B | `46e54f3353dbdb958ec36a8c5ff7b9c78b214092fa0325944ea6bd8d5f9bd7e0` |

路径：`<LocalLow>/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/<ID>.gil`
（Save_Level 与 Temp 同 sha；两份都已注册进 `.gip`，编辑器存档列表可见）。交付提交：`4db3fdc6`。

**地图 A（花间茶会）资产**

| 资产 | ID |
|---|---|
| 容器模板组 / 节点 | `1073741845` / `1073741846` |
| 模板占位子控件 `tea_anchor`（1×1 @ -2000,-2000，防编辑器剪空容器） | `1073741850` |
| 布局实例组 / 节点（`f504=默认布局 1073741825`、族 3 引用模板组） | `1073742500` / `1073742501` |
| 实例子控件 `tea_anchor`（随模板复制） | `1073742502` |
| 脚本 `main`（guid `1073741825`）+ 挂载 | 只在布局实例节点 `1073742501` 上 |
| 设备版 Lua 烘焙模板 ID | `prim=1073741847 / label=1073741848 / hit=1073741849`（本图真实模板） |

**地图 B（霜华纪）资产**

| 资产 | ID |
|---|---|
| 容器模板组 / 节点 | `1073742500` / `1073742501` |
| 布局实例组 / 节点（新 CLI 生成） | `1073742502` / `1073742503` |
| 占位子控件 `ganyu_anchor`（1×1 @ -2000,-2000） | `1073742499` |
| 脚本 `ganyu_main`（guid `1073741825`）+ 挂载 | 布局实例节点 `1073742503` |
| 三个客户端模板 | `ganyu_prim=1073741930 / ganyu_label=1073741931 / ganyu_hit=1073741932` |

**复现命令（A/B 同一套，B 多一步删除旧实例）**

```bash
GSTS="node dist/src/cli/gsts.js"
# A
$GSTS maps:clone --from workspace/flower-tea/device-package/1073741843.after-import-20261029.gil \
  --name '花间茶会·一条龙'
$GSTS assets:ui create --type client-textbox --on container:1073741846 --name tea_anchor \
  --gil <新图.gil> --write --yes        # 占位子控件（防剪）
$GSTS assets:ui container instantiate --gil <新图.gil> --container 1073741845 --write --yes
$GSTS assets:scripts update --gil <新图.gil> --name main --source-file <烘本图模板ID的.lua> \
  --map-id <新图ID> --write            # 设备版 Lua 的 T.tpl 必须换成本图模板 ID
$GSTS assets:scripts unmount --gil <新图.gil> --host 1073741846 --script 1073741825 --write  # 只留布局节点挂载
$GSTS maps:resync --map-id <新图ID>
# B
$GSTS maps:clone --from workspace/ganyu/device-package/1073741842.final.gil --name '霜华纪·容器一条龙'
$GSTS assets:ui delete <旧布局实例组> --gil <新图.gil> --write --yes
$GSTS assets:ui container instantiate --gil <新图.gil> --container 1073742500 --write --yes
$GSTS assets:ui create --type client-textbox --on container:1073742503 --name ganyu_anchor \
  --gil <新图.gil> --write --yes
$GSTS assets:scripts mount --gil <新图.gil> --host 1073742503 --script 1073741825 --write
$GSTS maps:resync --map-id <新图ID>
```

**试玩步骤（用户）**：编辑器打开该图 → **切出再切回**（编辑器内存版否则仍是旧的）→ 试玩。
- 图 A 期望：花间茶会 2D 界面（Lua 从 3 个模板 `prim/label/hit` 动态创建全部控件；脚本已把 `T.tpl` 重新烘成本图真实模板 ID）。
- 图 B 期望：霜华纪 5 层界面（`ganyu_main`）。

**两个必须注意的点**
1. **空容器节点会被编辑器保存时剪掉、挂载随之消失**（2026-10-28 真机实测）→ 交付图里给容器节点放一个
   `1×1`、位置 `-2000,-2000` 的占位子控件（`tea_anchor` / `ganyu_anchor`）保住节点；
2. **模板节点与布局实例节点都挂载 = 可能重复执行**（编辑器复制挂载是它自己的行为）：
   交付地图里只保留**布局实例节点**上的挂载（`assets:scripts unmount --host <模板节点>` 去掉模板侧）。

**跑偏时的排查顺序**：`assets:scripts mounts` 是不是只剩布局节点那条 → `assets:ui list` 里布局实例子树在不在
→ `external_lua_file` 是否存在（`assets:scripts list` 的 `exists/size`）→ 真机日志里 `T.tpl guid=` 是否等于本图模板 ID。
### 9.3 GIA 一键落地（`gsts sim:import --apply`；2026-10-29 真机闭环）

**核心事实（省掉整类逆向）**：GIA 的 `UiControlGroup.content` 与 `.gil` 的 root9 记录**字段号完全一致**——
`guid=501 / info=502 / children=503 / parent=504 / data=505`（子消息同样 501/502/503…，
见 `src/cli/client_ui/gia_proto.proto:16-20`）。编辑器做一次「GIA 导入」实际只做三件事：

1. **重新分配 ID**（guid、成员表 `rootChildRef`、nodeRef 自引用 `f504.f4`）
2. **改写模板序号**（`f502[1]{f501=2,f502=6} → f12{f501}`，全图自增计数器）
3. **重名去重**（`客户端控件容器 → 客户端控件容器_1`；**容器节点不去重**，同图多个「容器节点」并存）

实测：`prim/label/hit` 三段 content 与编辑器产物**逐字节同尺寸**（810 / 755 / 715 B），
归一化 ID 后**非 ID 差异 = 0**。⇒ 落地 = **克隆 content 字节 + 打这三处补丁**，
不需要逐类解释控件内容块（"支持一种新控件类型"从逆向工程降级成查表）。

**只读分析（不写盘）**：`gsts sim:import --gia <包> --gil <地图>` 输出三栏——
`[OK]/[GAP]/[HOST]` 能力栏 × 「目标图已有」栏 × `[DRIFT]` 脚本 GUID 栏，
并给出一句话结论（"会不会因为 GUID 漂移而界面空白"）。**先跑这个，再决定要不要落地。**

**一条命令落地**：

```bash
export GSTS_LOCALLOW_DIR=/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow
unset LOCALAPPDATA
GSTS="node dist/src/cli/gsts.js"
$GSTS sim:import --gia <包.gia> --gil <地图.gil> --apply \
  --root-donor <含 87/88 根的地图.gil> [--layout <ID|名>] --write --yes
#   ① 造模板侧（模板组 + 容器节点 + 各控件模板）
#   ② 登记脚本 root50 + 挂载槽 f74 重指向新脚本 GUID
#   ③ 把脚本里写死的模板 GUID 重映射（T.tpl={prim=…}）
#   ④ 实例化进布局（--layout 缺省取第一张布局）
#   ⑤ 自检：root9.f501 集合 == 「无 f504 记录」集合
```

**每一步都是踩过坑才加上的**：

| 步 | 为什么必须有 |
|---|---|
| `--root-donor` 补 87/88 | CLI 新建的地图**没有** ClientUI 层级根（编辑器首开才建）。缺了直接落地，编辑器一开就自建，**连坐把整棵容器子树丢掉** |
| 挂载槽 f74 重指向 | GIA 的 f74 存的是**源图**的脚本 GUID，不重指向 = 挂到不存在的脚本上 |
| 脚本 GUID 重映射 | 脚本写死 `T.tpl={prim=<源图ID>}`；不重映射 → 运行时 `probe ... FAIL`，靠脚本自带 `discoverTemplates` 在**写死的 ID 区间**里兜底，落在区间外就**静默空白** |
| **外置 Lua 一起写** | **编辑器保存时会把 root50 的内联源码外置成 `external_lua_file/<filePath>`**。只写内联 = 首存后两边都空（实测 150,410 B → 29,947 B、root50 剩 46 B、`assets:scripts list` 报 `external=MISSING`）。与 §2「三同步」同一条纪律 |
| 占位子控件 | 空容器节点会被编辑器保存时剪掉、挂载随之消失（§9 硬前提 ①）。**这条不能删**，2026-10-29 真机往返再次证实有效 |

**验收判据（分层，禁止合成一个 ✅）**

| 层 | 判据 |
|---|---|
| 结构 | 五条模板记录与编辑器导入产物**尺寸逐一相等**（模板组 513 / 容器节点 566 / 三个控件 810,755,715 B）；`root9.f501` == 无 `f504` 记录集；`Save_Level` 与 `Temp` 同 sha |
| 保存往返 | 编辑器打开**保存一次**后：root9 / root50 **逐字节不动**、`external_lua_file/<path>` 仍在且 `assets:scripts list` 的 `external=` 是字节数（不是 MISSING）、`T.tpl` 与挂载同值 |
| 行为（唯一硬证据） | 试玩日志里 **`probe <kind> <新ID> ok` × 3**，且**没有** `discover missing=` / `discover incomplete` —— 后者说明在走兜底，也就是重映射没对上 |
| 用户 | 界面能显示并能玩完一局（2026-10-29 实测：title 425 控件 → game 592 → 结算 784，`gameover win=true score=2340 stars=1`） |

**覆盖矩阵（"一个存档不能说明可用"）**：全新图 / 空白对照 / **重复落地**（重名 `_1`/`_2`、撞 ID、
模板序号接着涨、脚本去重成 `main2`）/ **克隆真实 UI 图**（与既有 8 个脚本共存）/ **编辑器保存往返**——
五种分支全绿才叫能用。2026-10-29 实测九张图全绿。

**两个日志观察（不是本链缺陷，别误判）**：`clear screen destroyed=N fail=k` 是脚本自身清理逻辑；
`[warn] game busy timeout :: repair board` 是脚本自带的忙等自愈被触发过。

### 9.4 干净导入差分（历史读数；结论已被 §9.3 推翻，只留 root 增量作对照）

干净图 `maps:init` 21,272 B → 只导入完整 GIA 后 146,255 B（+124,983）。root 级增量：

| root | 变化 | 内容 |
|---|---|---|
| 50 | 0 → 120,895 B | GIA 脚本资产（f1=120,889，内含 main + Lua 源码） |
| 9 | 2,738 → 6,410 B | 客户端模板 1845/1846/1847/1848/1849 + 特殊根 1843/1844 |
| 6 | 1,216 → 1,599 B | 资产浏览器文件夹 |
| 15 / 21 / 35 | +2 / +3 / +4 B | 小索引 |
| 46 | 22 → 44 B | 保存审计 |

> ⚠️ **上一段「纯 CLI 无法凭空生成」已在同一天（2026-10-29）被推翻 —— 见 §9.3。**
> 它当时显得"不在任何 root 里"，是**工具读不出**：root9 的族描述符/成员表是 packed varint
> （`95 80 80 80 04` 的真身是 packed `[1073741845]`），旧解析把它读成「字段 134217730 / fixed32 0」
> 这种根本不存在的字段，于是成员表看起来是空的。
> 修好解析后的结论：**「客户端控件容器」就是 root9 里的模板组 + 容器节点 + 各控件模板记录**，
> GIA 的 `UiControlGroup.content` 与这些记录**字段号完全一致**，`gsts sim:import --apply` 纯 CLI 一次造全。
> 本节上面的 root 增量读数仍然有效（可当"导入到底往哪个 root 写"的对照）。

**教训（比结论更值钱）**：`grep 不到` / `解析不出` ≠ 不存在。判"某东西不在这个文件里"之前，
先确认**解析器能读这种 wire 形态**（packed vs message 是同一个字节串的两种合法解释）。


## 9.5 官方结算链路（客户端只能发信号；结算必须由服务端图触发）

**事实**：客户端 Lua **没有结算能力**（`research/千星知识图谱/learn-lua71/知识提炼.md:98`「存档/结算是关卡必须，但客户端控件/脚本无法实现」）。
玩家看到"打完没有结算"的根因就是：只做了自定义结算屏，没有让服务端图调 `结算关卡`。

**五步（2026-10-29 在 1073741856 跑通，结构层）**

```bash
GSTS="node dist/src/cli/gsts.js"; MAP=<地图/地图.gil>; MAPID=<id>
# ① 注册信号（客户端 → 服务端）
$GSTS assets:signals register --gil "$MAP" --name ganyu_settle --param win:int --write
#    → sendId/monitorId/serverId/clientScriptId；参数必须与 TS defineSignal 完全一致（compile 时 schema 校验）

# ② 建空服务端图占位（拿 graphId）
$GSTS assets:node-graphs create --gil "$MAP" --name ganyu_settle --write

# ③ TS 图：onSignal → setPlayerSettlementSuccessStatus → settleStage（顺序不能反，见 concepts.md:7666）
#    examples/tetris-settle/src/graph.ts 是可直接抄的最小实现
node dist/src/cli/gsts.js --config <settle/gsts.config.ts>     # 编译并注入（inject.mapId/nodeGraphId）

# ④ 挂到关卡实体（entity 层才会被执行；def 层不执行）
$GSTS assets:mounts attach 1094713345 --graph <graphId> --entity --gil "$MAP" --write

# ⑤ 客户端发信号（两形态都 pcall，真机日志确认哪条生效）
#    game.ServerSignal('名'):AddInt(1):SendSignal()   ← 工厂形态
#    game.ServerSignal.send('名', 1)                   ← 备选形态
```

**验收**：真机日志出现 `ganyu-settle-recv` / `ganyu-settle-victory` / `ganyu-settle-stage`，随后官方结算页弹出。
只有客户端 `settle signal sent` 而没有 `ganyu-settle-recv` ⇒ 图没挂对（多半挂在 def 层或没挂）。

**UI 侧**：结算屏给一个显式「结算并结束」主按钮（本例 `hit_result_settle` + `E` 键），不要指望自动——玩家可能想先看战绩或再来一次。


### 9.6 一分钟宽限：中途退出按胜利结算（2026-10-29 用户令）

**需求**：玩家游玩超过 1 分钟后退出，按胜利结算（大部分游戏适用的留存友好规则）。
**官方语义**（`official-guide-concepts.md:7664-7678`）：结算状态是每个玩家的属性，由「逃跑合法性」+「结算状态」两个字段构成；
逃跑合法性=否 ⇒ 退出必为「逃跑」；=是 时才看结算状态（胜利/失败/未定）。**结算时读的是当前值**。

所以「1 分钟后退出=胜利」= **满 1 分钟时把该玩家的逃跑合法性置真、结算状态置胜利**，之后他退出就按胜利结算：

```ts
const graph = g.server({ id: GRAPH_ID, variables: { graceArmed: false } })
  .on('whenEntityIsCreated', (_e, f) => {          // 图起手只跑一次（变量守卫）
    if (f.get('graceArmed')) return
    f.set('graceArmed', true)
    setTimeout(() => {                              // 服务端图内的 setTimeout，毫秒
      const ps = f.getListOfPlayerEntitiesOnTheField()
      if (f.getListLength(ps) > 0n) {
        const p = f.getCorrespondingValueFromList(ps, 0n)
        f.setPlayerEscapeValidity(p, true)                    // 允许正常离开
        f.setPlayerSettlementSuccessStatus(p, SettlementStatus.Victory)  // 按胜利
      }
    }, 60000)
  })
  .onSignal(Signal.ganyu_settle, (evt, f) => { /* 主动结算：胜负由参数决定 */ })
```

**要点**
- `whenEntityIsCreated` 会为每个实体触发 ⇒ **必须用图变量守卫**，否则起 N 个定时器。
- 定时器只对**当前在场玩家**生效；多人/中途加入时要在玩家进入事件里补一次（单机模板取 list[0] 足够）。
- 顺序：先 `setPlayerEscapeValidity(true)`，再 `setPlayerSettlementSuccessStatus(Victory)`；两个都在 60s 定时器里做，不要提前做（提前置胜利会让前 60 秒失败也算胜利）。
- 判据：真机日志出现 `ganyu-grace-arm`（0s）→ `ganyu-grace-victory`（60s）；60s 后中途退出，官方结算页显示胜利。
