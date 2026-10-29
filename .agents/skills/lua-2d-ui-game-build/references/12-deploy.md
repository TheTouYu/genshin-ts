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


## 9. 2D UI 容器一条龙边界（2026-10-29 真机闭环）

**布局 = 游戏开始就渲染的实例；模板 = 可复用、可动态创建，不放进布局就不渲染。**

CLI 已覆盖：

```text
maps:create / maps:init
template clone
client-container 四件套（模板组/节点 + 布局实例组/节点；
  ID 从 1073742500 起，避开编辑器 2002/2003 特殊根与 2004+ 模板实例；
  清空 donor f74，避免旧 main_1/main_2 挂载被复制）
scripts register / update / mount
maps:resync
```

**纯 CLI 仍做不到的一步**：服务端控件模板（`客户端控件容器`）。它不是 root9 的 client container；只有编辑器导入完整 GIA 时才生成。只写客户端半边，编辑器保存会把低 ID 容器重解释成 `ClientUIRootHierarchyRoot`，模板和挂载一起消失。

可靠的一条龙顺序：

1. 新图 → `maps:init`；
2. **编辑器导入完整 GIA**（生成服务端控件模板 + 客户端模板 + 脚本）；
3. 把客户端控件容器模板加入默认布局（生成布局实例组/节点）；
4. CLI `assets:scripts update/mount` 挂到布局节点；
5. 用户切出再切回地图，试玩看 `[tea]`。

**删除语义**：删布局里的客户端容器，编辑器会连带删模板组/节点和布局实例，不是只删布局；CLI 不能只删一半。

**真机两个高频坑**：

- `AddKeyEventListener` 第一参必须是 `Enum.KeyEventType`（不是 `Enum.KeyCode`），否则所有键静默失败；
- 结算 `T.after(0.45, fn)` 要传 `ui=true`；否则玩家一按暂停/设置，计时器冻结，赢了却永远不弹结算，表现为“棋盘突然点不动、暂停/设置还能点”。

**模拟器日志**：Web 试玩页有 Logs 视图（客户端 Lua 最近 100 条、服务端日志、变量/信号、运行时树），是事后排查面板；真机排障仍以 `Beyond_Debug_Log/*.gia` 的 `[tea]` 行为准。


### 9.1 干净导入差分（2026-10-29，地图 1073741843）

干净图 `maps:init` 21,272 B → 只导入完整 GIA 后 146,255 B（+124,983）。root 级增量：

| root | 变化 | 内容 |
|---|---|---|
| 50 | 0 → 120,895 B | GIA 脚本资产（f1=120,889，内含 main + Lua 源码） |
| 9 | 2,738 → 6,410 B | 客户端模板 1845/1846/1847/1848/1849 + 特殊根 1843/1844 |
| 6 | 1,216 → 1,599 B | 资产浏览器文件夹 |
| 15 / 21 / 35 | +2 / +3 / +4 B | 小索引 |
| 46 | 22 → 44 B | 保存审计 |

**关键结论：服务端控件模板 `客户端控件容器` 不在 `.gil` 任何 root 里。** root50 只是 GIA 脚本资产；root9 只有客户端模板；root6 是文件夹。它只存在于编辑器的服务端控件模板库/GIA 导入过程中，所以**纯 CLI 无法凭空生成**，必须由编辑器导入一次完整 GIA。CLI 能一条龙做的是导入之后的客户端布局、脚本挂载和写回。
