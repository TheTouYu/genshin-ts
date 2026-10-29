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

**新地图也是 CLI 做的**：`maps:clone --from <已导入的图.gil> --name <名>` 克隆成新地图 ID
（只改写 root 1/2/39/40，其余资产段/脚本登记表原样；内联 Lua 会物化到 `<新图目录>/external_lua_file/`），
之后照上面 ②③④ 走。

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
# 期望：CONTAINER-FLOW-RESULT fixtures=3 assertions=19 verdict=PASS
```

**它证明什么（19 断言）**：
1. 发现结果 = 源 `.gil` 推导的容器模板集合（ID/名字/子控件数全部**由记录推导**，CLI 里没有任何 donor/常量）；
2. 每个模板都能生成布局实例：`f504=布局`、族 3 描述符引用模板组、布局 `f503` 追加、模板 `f14` 追加、
   子控件逐条复制（子 `f504=新节点`）、`assets:ui list` 读回子树与源容器同构；
3. 脚本挂载从模板节点复制到布局实例节点（`assets:scripts mounts` 读回同 script guid）；
4. **两组黄金差分**：CLI 产物 vs **编辑器自己**造的实例（`1073741840.after-layout-templates` 的 2049/2050+16 子）
   与 after-save-template（1852/1853）→ 归一化 ID 后**逐字段 0 差异**；
5. 写回闸门：`--write` 不带 `--yes` 必须拒绝，且拒绝时不改源文件；fixture sha 全程不变。

**判断"我造的和编辑器一样"的正确做法**：不能只比子树形状（形状同构也可能字段写错——
本轮就抓到"把所有 `f502` 族描述符都替换成实例描述符"，形状仍同构但 8 行字段差异）——
**按字段路径归一化 ID 后逐行比对**。

### 9.2 两张新地图（2026-10-29 交付，可复现）

| 地图 | ID | 名称 | 内容 |
|---|---|---|---|
| A | `1073741844` | 花间茶会·一条龙 | 花间茶会 GIA 导入快照 → 克隆 → 容器模板（含 1×1 占位子控件）→ 布局实例 → `main` 挂载 |
| B | `1073741845` | 霜华纪·容器一条龙 | 霜华纪地图克隆 → 旧布局实例删除 → **新 CLI** 实例化 → `ganyu_main` 挂载 + 1×1 占位 |

路径：`<LocalLow>/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/<ID>.gil`
（Save_Level 与 Temp 同 sha；sha 见仓库交付记录 `docs/`/提交说明）。

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
### 9.3 干净导入差分（服务端控件模板不在 GIL 的证据；2026-10-29，地图 1073741843）

干净图 `maps:init` 21,272 B → 只导入完整 GIA 后 146,255 B（+124,983）。root 级增量：

| root | 变化 | 内容 |
|---|---|---|
| 50 | 0 → 120,895 B | GIA 脚本资产（f1=120,889，内含 main + Lua 源码） |
| 9 | 2,738 → 6,410 B | 客户端模板 1845/1846/1847/1848/1849 + 特殊根 1843/1844 |
| 6 | 1,216 → 1,599 B | 资产浏览器文件夹 |
| 15 / 21 / 35 | +2 / +3 / +4 B | 小索引 |
| 46 | 22 → 44 B | 保存审计 |

**关键结论：服务端控件模板 `客户端控件容器` 不在 `.gil` 任何 root 里。** root50 只是 GIA 脚本资产；root9 只有客户端模板；root6 是文件夹。它只存在于编辑器的服务端控件模板库/GIA 导入过程中，所以**纯 CLI 无法凭空生成**，必须由编辑器导入一次完整 GIA。CLI 能一条龙做的是导入之后的客户端布局、脚本挂载和写回。
