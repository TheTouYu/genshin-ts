# 12 部署（让用户真的看到新版）

> **本章的目标只有一个**：消灭「**还是老板版**」。
> 本次会话里它出现了 **4 次**（T3/T4/T24/T48），每次都是用户先发现、我们后补救。
> 用户原话（T24）：「我去真机试玩了，感觉还是老板版，我给你提的问题，全部都在呀。你仔细检查一下，是不是id，挂载等等我老是和你强调的问题又犯了。」
>
> 出处：`18-evidence.md` F 组；日志锚点：`hud inst n=` / `module ok` / `tpl guid=` / `registryEntries`。

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
> 源文件里的 `__GUID_CELL__` 是 build 时注入的占位符；用原文 → 占位符是 `nil` → 表构造 `{nil, 1073741849, …}` 被 `ipairs` 在首项截断 → 候选表空 → 模板探测失败 → `error()` **无声死** → 白屏，日志只打到 `canvas`/`device` 就断。

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
| `canvas <W>x<H>` | 画布尺寸探测成功 |
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
