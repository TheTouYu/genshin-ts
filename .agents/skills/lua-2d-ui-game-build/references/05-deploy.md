# 宿主层部署（真机脚本/模板/挂载/编译）

> 出处：复盘表 D1–D6。**用户「还是老板版」的每一次都从这里找到根因**。

## 1. 部署三处（缺一处用户就看不到新版）
1. 仓库 `workspace/<proj>/<proj>.save.json`（runner 读）
2. 模拟器工作区 `~/qxqy-workspace/<proj>.save.json`（**网页 4173 读它**）
3. 真机：地图脚本记录 + external 文件（`deploy.mjs` 或零导入直写）
判据：`sha256sum` 逐字节比对 + 版本指纹（见 §5）。

## 2. 零导入直写（增量改 lua 首选）
```bash
# ① 查执行中的脚本（挂载指向 ≠ deploy 写的那条）
gsts assets:scripts mounts --gil <图.gil>
# ② 直写（f5 内嵌 source + external + Temp 三同步 + 自动备份）
gsts assets:scripts update --guid <执行中> --source-file <注入版.lua> \
  --gil <图.gil> --map-id <id> --write          # --map-id 必带，否则 temp-sync=skipped
# ③ 验收：双址 sha 一致 + guard 对比写前备份
```
- **注入版铁律**：`--source-file` 必须 build 产物（`JSON.parse(save.json).assets.scripts[0].source`），不是源文件原文——`__GUID_CELL__`=nil → `ipairs` 首 nil 截断候选表 → 模板探测无声失败 → 白屏（D2）。
- 判据：`/cell = \{ \d+/`（数字形态）**别用 includes('__GUID')**（注释文字误报）；**注入点可能搬进模块**（如 config.lua），扫全部脚本。
- 多条脚本记录（main/main_1/main_2 并存）：把执行中的与易被切回的都 update 成同一内容。

## 3. 多模块 Lua（D1——最大的一次白测）
- 官方口径：脚本可建多份映射，**未挂载的只作 require 模块**；require 路径=映射路径去 `.lua`，引擎补 `default_import_file/`。
- 部署清单：
  1. update 主脚本（挂在宿主的那条，双身同步）；
  2. **每个模块都 `register`**：`--name <proj>_<mod> --path lua/<proj>/<mod>.lua --source-file ... --map-id <id> --write`；
  3. **判据：`registryEntries == 主脚本数 + 模块数`**；
  4. 模块 external 文件落在 `<槽>/external_lua_file/default_import_file/lua/<proj>/`；
  5. **让用户切出地图再切回**（编辑器/游戏内存版否则仍是旧的）。
- 日志验证：`module ok default_import_file/lua/<proj>/<mod>` ×N。

## 4. 真机 Lua 200-local 硬限（D4）
- 症状：真机弹「脚本编译报错: ...too many local variables (limit is 200) in main function near '('」——**整段不编译、白屏、零日志**。
- 事实：**本机 `lua5.3 loadfile` 会放过、真机不放**（真机内嵌 Lua 对主 chunk 计数更严：`local function` 占槽且近似双计、顶层循环变量也计）。
- 判据：`grep -cE '^local ' lua/main.lua` ≤150；超了就**收表**：`local FN = {}` + `FN.X = function(`，调用点 `X(`→`FN.X(`（8 个函数 141→134 实测安全）。
- 改完必须真机首试看弹窗/日志（编译错误不进 runner）。

## 5. 版本指纹（自查「跑的是哪版」）
在启动日志里留稳定前缀：`menu stage n=` / `menu cards n= style=` / `hud inst n=` / `module ok` / `tpl guid=`。
用户报「还是旧版」→先取最新真机日志看指纹行，再谈功能。

## 6. 写盘前提与编辑器纪律
- 编辑器/游戏开着该图时**先让用户切出**（内存版会在离开时覆盖写盘，D314），写完再切回。
- Temp 同步必须做（编辑器读 `Temp/`）；Save_Level 与 Temp 同 sha。
- 本机=Arch + Wine prefix；`GSTS_LOCALLOW_DIR=…/AppData/LocalLow` 并 `unset LOCALAPPDATA`；deploy.mjs 要 `…/LocalLow/miHoYo/原神`。
