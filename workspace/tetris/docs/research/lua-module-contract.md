# Lua 模块化契约调研（`require` / 多脚本 / 挂载 vs 未挂载 / GIA 落地）

> 状态：已验证（模拟器实现 + 官方文档面 + 我方真机差分知识图谱）／待验证（真机侧「未挂载脚本能否被 `require`」）
> 最近校验：2026-10-28
> 目的：为 tetris 把 `lua/main.lua` 拆成多文件提供**可直接照做**的契约，不做代码改动。（行数在变：任务书 3838 行 → 本轮 07:5x 实测 3899 → 07:54 并行会话又写到 **3942**；以现场 `wc -l` 为准，本文结论与行数无关。）

---

## ① 结论摘要（可执行）

1. **模拟器的 require key = 注册路径归一化**：`\`→`/`、去掉**结尾小写** `.lua`、剩余所有 `.` 换成 `/`；命中不了就再查别名表（注册时自动为每条路径加了 `default_import_file/<key>` 别名）。所以模拟器里 `default_import_file/lua/main` 与裸 `lua/main` **都能命中**。
2. **真机侧路径事实**：编辑器导入 GIA 时自动给 `file_path` 补 `default_import_file/` 前缀（D257/D268 真机差分），`script.path` 真机实测返回 `default_import_file/levelScript`（HR-11）。⇒ 主文件加载器**先试带前缀、再兜底裸路径**，两者都要覆盖。
3. **一个存档可放任意多份 Lua**：`assets.scripts` 是数组，每条 `{id,guid,path,source,controlId,controlAsset}`。`addScript` **省略 `controlId` 或给空串 = 只注册不挂载**（可被 require，但**不跑** OnInit/OnEnable/OnStart）；只有挂载脚本才跑生命周期。
4. **模块 chunk 在 `require` 那一刻执行，且必须 `return` 恰好 1 个值**；模块不跑任何生命周期钩子；模块 `_ENV` 是独立的（看不到主脚本全局，`_G` 指向模块自身），模块内 `script` 是一个 dummy（`script.object == nil`）。
5. **主脚本 chunk 的 `return` 值被丢弃**（`runChunk` 用 `lua_pcall(L,0,0,0)`）——主文件与模块的返回值契约不同，别把主文件写成模块。
6. **`InstantiateClientUIControl` 在 `phase=='OnInit'` 返回 nil**；而 `require` 发生在主 chunk 执行期（此时 `lifecyclePhase` 已置 `OnInit`）⇒ **模块顶层不许实例化控件**，实例化必须由 `OnStart`（或 running 期回调）调用模块函数完成。
7. **导出 GIA 时 `file_path` 必须带 `.lua`**（无扩展名真机按非法路径拒导入）；`SCRIPT_MOUNT_WARNING` 只在「存档里存在任何已挂载脚本」时产生，而**整合包 GIA 显式过滤掉该警告**（整合包会把挂载 GUID 写回两棵控件树，不沿用该警告）。
8. **真机每轮重新导入整合包 = 留下重复脚本映射**（guid+1、name 加数字尾、path 加 `_1`）；tetris 地图已有 `main/main_1/main_2` 三条印证。日常更新源码走 `gsts assets:scripts update --guid <执行中>`，不要靠重复导入。

---

## ② 逐条问题答案

### Q1 官方/契约层面的 `require` 语义

**(a) 官方文档面：只字未提 `require`。**
- `research/千星知识图谱/learn-lua71/官方API文档-客户端控件.md`、`官方教程-客户端控件和客户端脚本.md` 全文 grep `require` **零命中**。
- 官方只记载三条相邻能力：`print(...)`／`printerr(...)`（`官方API文档-客户端控件.md:534`、`:547`，printerr 写错误级日志且不抛错）；脚本类型字段 `path`（string，只读，「脚本路径」，`:823`）；跨脚本调用走映射 ID：`GetScriptByPath(scriptPath)`、`GetScript(scriptMappingId)`、`GetScripts()`（`:5044`、`:5057`、`:5070`），教程侧对应 `官方教程-客户端控件和客户端脚本.md:299「可以通过脚本映射ID在脚本中调用其他脚本」`。
- 官方唯一与「打包范围」相关的硬规则：`官方教程-客户端控件和客户端脚本.md:273`——「**只有在千星沙箱里建立了映射的 lua 文件才会被打包上传，仅在本地创建文件但未建立映射的脚本，无法在运行时正常上传**」。（⇒ 挂载不是上传条件，**映射**才是。）
- 二手官方线索：`learn-lua71/知识提炼.md:82`「require 复用：脚本之间 require 引用（≈复合节点功能），**入参为客户端脚本中显示的文件路径**」[BV1qYeF6nEiq 03:27-03:48]。

**(b) 模拟器实现（可执行的那份契约）** —— `client/lua-runtime/src/runtime.js`：

- 注册：`registerScriptFile(path, source)` `:175-183`
  ```
  key = normalizeRequirePath(path); scriptFiles.set(key, source)
  if (!key.startsWith('default_import_file/')) requireAliases.set('default_import_file/'+key, key)
  ```
  注释原文（`:178-179`）：DSH 导入文件统一放虚拟 `default_import_file` 根下；裸路径是旧存档兼容层，**新脚本应显式 `require("default_import_file/<映射路径>")`**。
- 归一化：`normalizeRequirePath(path)` `:185-193`
  ```
  p = String(path).replace(/\\/g,'/'); if (p.endsWith('.lua')) p = p.slice(0,-4); p = p.replace(/\./g,'/')
  ```
  注意三点：**只**去结尾 `.lua`（`ENDSWITH` 大小写敏感，`.LUA` 不去）；剩余 `.` 一律变 `/`（`a.b.c` ⇒ `a/b/c`）；不补前缀、不改大小写、不解析 `..`。
- 缓存：`requireCache: Map<ownerThread, Map<path,{loading}|{ref}>>`（`:89`、`:1157-1159`）——**每个挂载脚本一个 VM**（`newLuaThread()` `:1191-1205`），模块在**同一 VM** 内以独立 `_ENV` 执行、缓存按主线程归属；键是**别名解析后**的 `path`，故同一模块经别名与裸路径 require 只执行一次。
- 循环检测：缓存里 `loading` 即报错（`:1161-1165`）——这是模拟器策略，不是官方证明。
- 报错形态（逐字）：
  - 找不到：`failed to load script '<requestedPath>'`（`:1172-1174`，注意报的是**请求串归一化后**形态）
  - 循环：`failed to load script '<requestedPath>': cyclic require`（`:1163`）
  - 模块运行/语法错：`failed to load script '<requestedPath>': <err.message>`（`:1184-1186`），并**删缓存**（可重试）
- 独立 `_ENV`：`loadModule` `:1240-1274`——环境取自 `moduleBaseEnvironments`（`newLuaThread` 在安装完沙箱/宿主面、**且主脚本还没执行**时快照的全局表，`:1198-1203`），再 `lua_setfield(env,'script',dummy)`、`lua_setupvalue(chunk,1)`。`_G` 指向模块自身；模块**看不到**主脚本定义的任何全局。
- 被 require 的脚本**不会自己跑生命周期**：`loadModule` 只 `lua_pcall(L,0,1,0)`（`:1271`）；`OnInit/OnEnable/OnStart` 只由 `mountScript` 触发（`:1276-1326`）。
- 模拟器文档同口径：`client/lua-runtime/docs/architecture.md:26`（表格行：映射路径 `子目录/文件名`、无 `.lua`、独立 `_ENV`、缓存、不跑生命周期、失败 `failed to load script '…'`）、`:62`（模块值进本 VM registry）；`docs/observed-contract.md` 第 4/11/20 条。

**(c) 前缀该不该写？** 模拟器 skill 手册把结论写成硬规则：`skill/SKILL.md:185`（同 `dsh-plugin/skill.md:185`）——「脚本映射路径去掉 `.lua` 后前面加 `default_import_file/`，例 `pcall(require,"default_import_file/workspace/flappy-fish/draws")`；**裸路径只为旧存档兼容，新脚本一律使用该前缀**」。

> 结论：**带 `default_import_file/` 前缀、不带 `.lua`、子目录用 `/`** 是唯一同时被「真机路径实测 + 模拟器别名 + 我方手册」三方支持的安全写法；裸路径与带 `.lua` 只是模拟器友好，真机未验证。

### Q2 一个存档多份 Lua；「挂载」与「未挂载」

**能多份。** 存档 `assets.<asset>.scripts` 是数组，每条经 `normalizeScriptEntry`（`studio/index.js:136-149`）归一成 `{id,guid,path,source,controlId,controlAsset}`；`controlAsset` 只接受 `client-control-template`/`server-control-template`（否则空串）。

**tetris 现状**（`tetris.save.json`）：`scripts` 长度 1，`{path:'lua/main.lua', controlId:'n1', controlAsset:'server-control-template'}`，由 `qxqy/build.mjs:158-166` 的 patch op 生成：
```js
patch({ op:'addScript', path:'lua/main.lua', name:'tetris', source:lua,
        controlId:'n1', controlAsset:'server-control-template' })
```

**patch op 的确切形态**（`studio/index.js:509-522`）：
- `addScript`：`adoptScript({path:String(op.path||''), source:String(op.source||''), controlId:'', controlAsset:''})`，随后 **仅当** `op.controlId !== undefined && op.controlId !== ''` 才 `setScriptMount(script, op.controlId, op.controlAsset)`。
  ⇒ **省略 `controlId` 与 `controlId:''` 效果相同 = 未挂载（只注册、可 require、不跑生命周期）**。
  - `path` **原样存**：不补 `default_import_file/` 前缀、不改 `.lua`、不校验存在性。
  - `source` 允许空（`applyScriptOp` 不校验）；但导出 GIA 时 `scriptGraphUnits` 会 filter 掉 `path` 与 `source` 都空的条目，`source` 为空则 mapping 不带 `source`。
  - guid 由 `allocateScriptGuid` 自动分配（`:249-256`）。
- `updateScript`：**只要** `op.controlId !== undefined` 就 `setScriptMount`，传 `''` 即解挂（`setScriptMount` `:496-508` 在空值时把 `controlAsset` 一并清空）。改 `path`/`source` 用 `op.path`/`op.source`。
- 挂载目标校验：`setScriptMount` 内 `resolveScriptTarget` 必须能在存档内找到该节点且 `kind !== 'server-container'`，否则抛 `挂载目标必须是存档内的客户端控件或客户端控件模板`（`:500`）。
- 也支持 `importData('lua')` 导入单个 lua 文件（`studio/index.js:874-880`）——注意它 **`path` 只取 basename**（`basename(filename||'imported.lua')`）且 `controlId:''`，目录信息会丢；要保留 `lua/tetris/<mod>.lua` 结构请走 `addScript`。

**未挂载脚本能被 require 吗（模拟器：能）。** `playStart`（`studio/index.js:974-1014`）把**全部**脚本（含 `controlId==''`）映射成 `{id,guid,path,source,controlId,controlAsset}` 传入 `startPlay` 的 `options.scripts`；运行时 `createRuntime` 对 `options.scripts` **全量** `registerScriptFile(path, source)`（bundle 内 `fu()`：`for(let o of i){let a=o.path||o.id, s=o.source||''; a&&s&&r.registerScriptFile(a,s)}`），而真正 `mountScript` 的只有 `sceneScripts`/`templateScripts`（按 `controlId` 过滤的 `byAsset('server'|'client')`）。⇒ **未挂载 = 在 `scriptFiles` 里、可 require，但不在 `mountedScripts` 里、不跑生命周期**。

**附带能力（很有用）**：存档里 `source` 留空时，试玩会按 `workspacePath` **从磁盘读** `path` 指向的文件（`resolveScriptSource` `studio/index.js:962-972`）；读失败则把 `error([==[ … ]=])` 作为源码注入（`:995-997`）——这给「磁盘为唯一真源」留了路，但**导出 GIA 不带源码**，真机包必须内嵌 `source`。

**`SCRIPT_MOUNT_WARNING` 的触发条件**（`studio/gia/codec.js`）：
```js
const SCRIPT_MOUNT_WARNING = '脚本挂载关系不进入 GIA：官方 script.gia 只含映射（ID/名称/路径/源码），导入后需重新挂载。'  // :694
// scriptGraphUnits() :717-759
if ((scripts || []).some((script) => script.controlId)) warnings.push(SCRIPT_MOUNT_WARNING)   // :735-737
```
即：**存档里存在至少一条 `controlId` 非空的脚本** ⇒ 触发。但——
- `exportCombinedGia` 显式过滤：`warnings.push(...extra.warnings.filter(w => w !== SCRIPT_MOUNT_WARNING))`（`:664`），因为整合包通过 `withScriptMounts`（`:558-574`，服务端 `:618-620`、客户端 `:589`）把映射 GUID 写回两棵控件树的挂载槽，挂载关系**确实**随包走。
- 独立 `exportGia`（`:630-646`，`warnings.push(...extra.warnings)` 在 `:641`）与 `exportScriptGia`（`:761-775`）**保留**该警告。

### Q3 真机侧：GIA 里多条脚本映射如何落地

**GIA wire 形态（模拟器 codec 实证，含 proto3 注释）**：每条映射一个 graph unit，`which=69`（`SCRIPT_MAPPING_WHICH`）、`id={class:30, id:guid}`、`script.mapping={id,name,filePath,source}`（`codec.js:716-759`）。`name` = 文件名去 `.lua`（`scriptDisplayName` `:696-700`）；`filePath` 不合法补 `.lua`：
```js
const filePath = /\.lua$/iu.test(rawPath) ? rawPath : `${rawPath || name}.lua`   // :743-748
```
注释原文：真机把无扩展名值当非法文件路径、导入失败。

**真机落地（已确证）**——`docs/knowledge-graph/d/d3d-客户端Lua脚本.md` §10.1（真机差分 D257/D260/D268 + 我方 CLI 结构层往返）：
- 编辑器导入 GIA 时对每条映射做**三处改写**：① guid 重新编号（GIA 内 1073742105 → 槽内 1073741825）② **`file_path` 自动补 `default_import_file/` 前缀** ③ 源码全文内联保存进登记表 `f50`。
- 同时把源码提取到 `<槽目录>/external_lua_file/<file_path>`（UTF-8 BOM）——**导入的自动行为**。
- **重复导入去重铁律**：guid+1、name 加数字尾（`main`→`main2`）、path 加 `_1`（`main.lua`→`main_1.lua`）。tetris 地图 `hl`(`1073741834`) 现存 `main/main_1/main_2` 三条即历次导入残留（D632）。**多模块时这会放大成「每模块 × 每轮」的重复映射**，务必按 D632 的判据先 `gsts assets:scripts mounts` 看活跃挂在哪个 guid，再 `update --guid <执行中> --source-file … --map-id …`。
- 挂载关系落 `f74`（容器节点 data 组件链），条目 11B `b21f 08 0a06 08 <5B guid>`；**`f74` 只出现在容器类节点**，普通控件（如文本框）无槽（§10.2）。tetris 挂在服务端容器 `n1` 上，符合该约束。
- 我方设备同步目录实证（`qxqy/deploy.mjs:33-37`）：`…/Beyond_Local_Save_Level/<mapId>/external_lua_file/default_import_file/lua/main.lua` —— 即真机侧 `default_import_file/` 既在 file_path 里、也在磁盘目录结构里。多模块时对应 `external_lua_file/default_import_file/lua/tetris/<mod>.lua`。

**真机侧 `script.path`（已确证一次）**：`docs/observed-contract.md` 第 20 条——2026-09-27 用户真机故障日志明确返回 `default_import_file/levelScript`（正式服 PC），**不是**短名。同条记录：`af397ac` 曾把挂载脚本路径截短、该结论已被取代，恢复「保留目录、统一斜杠、去结尾 `.lua`」。（原件未归档 = 单次观察，不是全格式矩阵。）

**未挂载脚本能否被 require（真机：未验证）**：
- 官方只保证「**建立了映射**的 lua 会被打包上传」（`官方教程-客户端控件和客户端脚本.md:273`），**没说** require 的可见范围是「全部映射」还是「已挂载集合」。
- 已知：真机各脚本**共享同一 Lua state**（`observed-contract.md` TWSEM 条「未对齐」项），而模拟器是**每脚本一台 VM** ⇒ 即使真机 require 可用，跨脚本 `Invoke` 身份、table 身份一致性仍与模拟器不同（值会往返，`rawequal` 可能 fake）。拆模块后如果只做「同 VM 内 require」则不受此影响；一旦跨脚本传 table 需另测。
- 备用通道（官方文档支持，不依赖 require 语义）：`GetScriptByPath(scriptPath)` / `GetScript(scriptMappingId)`（`官方API文档-客户端控件.md:5044/5057`）。

**结论口径**：真机「多映射 + 未挂载模块 + require」这条链 = **推断可行、未验证**（详见 ④）。

### Q4 模拟器 require 解析实现 + 能命中的确切字符串

链路：`require(x)` → `normalizeRequirePath(x)`（`runtime.js:185-193`）→ `requireAliases.get(p) || p`（`:1153`）→ 查 `scriptFiles`（key 由 `registerScriptFile` `:175-183` 写入）。

**命中清单**（设存档里挂载脚本 `path = 'lua/tetris/main.lua'`，并新增未挂载模块 `path = 'lua/tetris/rules.lua'`）：

| `require('…')` 实参 | 归一化后 | 命中方式 | 模拟器 |
|---|---|---|---|
| `lua/tetris/rules` | `lua/tetris/rules` | 直接 key | ✅ |
| `lua/tetris/rules.lua` | `lua/tetris/rules` | 去尾部 `.lua` | ✅ |
| `lua\tetris\rules` | `lua/tetris/rules` | 反斜杠归一 | ✅ |
| `lua.tetris.rules` | `lua/tetris/rules` | 点→斜杠（**这是「点路径」被接受的机制，不是 Lua 惯例**） | ✅ |
| `default_import_file/lua/tetris/rules` | `default_import_file/…` | 别名反转（`:180-182`） | ✅ |
| `default_import_file/lua/tetris/rules.lua` | 同上（去 `.lua`） | 别名 | ✅ |
| `lua/tetris/rules.LUA` | `lua/tetris/rules/LUA` | ❌ 大写不剥 ⇒ 点被换成 `/` 后必然 miss | ❌ |
| `./lua/tetris/rules` / `lua//tetris/rules` | 原样 | ❌ 不做路径规范化（无 `.`/`//` 折叠） | ❌ |
| `rules`（只写文件名） | `rules` | ❌ 除非该文件名本身是某条注册路径 | ❌ |

要点：**子目录用 `/` 表达**（就是映射路径原样去掉 `.lua`），**不要用 Lua 惯用的点号**（虽然模拟器恰好也能命中，因为点被当分隔符；但真机无此保证，且会与「文件名里本来有点」冲突）；**`..` 相对路径不支持**（真机同样未见记载）。

### Q5 落地建议：主文件加载器骨架

见 ③。设计要点：①路径候选来自 `script.path`（同目录）+ 显式 `default_import_file/…` 根 + 裸路径兜底；②`pcall(require, …)` 全程包住，失败**打印每个试过的路径和原始错误**；③加载失败不抛（降级到 `nil` + 错误表），主脚本仍能起来并打出可读诊断；④**模块返回表**，主文件持有引用，不在模块间用全局变量。

### Q6 边界：`InstantiateClientUIControl` 与模块环境的 `script`/`game`

- **相位**：`game.InstantiateClientUIControl` 把**运行时**相位传进去：`rt.instantiate(prefabIndex, parent, rt.lifecyclePhase)`（`runtime.js:418-421`），而 `instantiate` 首行 `if (phase === 'OnInit' || phase === 'OnDestroy') return null`（`:652-653`）⇒ 只有 `OnStart` 与 `running` 期成功（HR-03 一致）。
- **require 发生在哪个相位**：`mountScript` 先 `this.lifecyclePhase='OnInit'`，再 `runChunk`（主 chunk，`require` 在这里跑），然后才 `OnInit`/`OnEnable`/`OnStart`（`:1291-1308`）。⇒ **主文件顶部 require 的模块，其顶层代码相位恒为 `OnInit`，顶层调 Instantiate 一定拿 `nil`**。（若在 `OnStart` 里 lazy require，模块顶层看到的是 `OnStart`/`running`——但别依赖这一点，行为随时序而变。）拆模块时：模块只**定义**函数，实例化留到 `OnStart` 里调用。
- **模块里 `script` 是什么**：dummy `{__kind:'Script', alive:true, scriptMappingId:resolveScriptMappingId(), object:null, path:<模块key>, …}`（`:1240-1259`）。⇒ 模块内 `script.object` 为 **nil**（不能靠它反推宿主控件）；`script.path` 是**模块自己的** key。需要宿主控件请由主文件显式传参。
- **模块里 `game`/`print`/`printerr`/`typeof`/`Enum`/`Color`/`require`**：都在（模块环境 = 沙箱/宿主面快照，`newLuaThread` `:1198-1203`；`game` 注册于 `:572`、`require` 于 `:310`）。**主脚本自己定义的全局不在**（这是独立 `_ENV` 的实际含义）。
- **真机口径未验证**：模拟器「每挂载脚本一台 VM + 模块独立 `_ENV`」是模拟器实现；真机各脚本共享同一 Lua state（`observed-contract.md` 未对齐项）。HR-04 里「独立 `_ENV`」是第三方真机回传的结论，但**模块之间是否共享 `_G`、模块的 `script` 是否与官方一致**没有逐项真机证据——写代码时按「模块只见宿主面、不见主脚本全局、`script.object` 不可依赖」的保守面写，两种实现都成立。

---

## ③ 推荐 `main.lua` 加载器骨架

> 用法：放在 `lua/main.lua` **最顶部**（在任何 OnStart 之前）；模块文件放 `lua/tetris/<name>.lua`，**每个模块 `return` 一张表**。
> 兼容面：模拟器（别名 + 裸 key）／真机（`default_import_file/…`，推断）；失败降级 + 逐路径日志。

```lua
--==========================================================================
-- 模块加载器（tetris）：模拟器 / 真机双形态探测
--   真机：script.path ≈ 'default_import_file/lua/tetris/main'  (HR-11 实测形态)
--   模拟器：script.path  = 'lua/tetris/main'（normalizeRequirePath 保留目录、去 .lua）
--   两条路径都试；每个失败候选都记原文，便于真机排错。
--==========================================================================
local MOD = {}            -- 主文件持有的模块表；业务代码一律走 MOD.xxx
MOD.loadErrors = {}

local function dirOf(p)
  local s = tostring(p or ''):gsub('\\', '/')
  return (s:match('^(.*)/[^/]*$'))
end

local function pushUnique(list, seen, v)
  if v and v ~= '' and not seen[v] then seen[v] = true; list[#list + 1] = v end
end

local function candidates(name)
  local list, seen = {}, {}
  local dir = dirOf(script and script.path)              -- 与主文件同目录（最稳：模块就在旁边）
  pushUnique(list, seen, dir and (dir .. '/' .. name))
  pushUnique(list, seen, 'default_import_file/lua/tetris/' .. name)  -- 显式导入根（手册指定写法）
  pushUnique(list, seen, 'lua/tetris/' .. name)                      -- 裸路径兜底（模拟器恒命中）
  pushUnique(list, seen, name)                                       -- 仅映射名（无子目录时）
  return list
end

local function loadModule(name)
  local tried = {}
  for _, path in ipairs(candidates(name)) do
    local ok, mod = pcall(require, path)
    if ok and mod ~= nil then
      print('[tetris] module OK: ' .. name .. ' <- ' .. path)   -- 低频，不进热路径
      return mod
    end
    tried[#tried + 1] = path .. (ok and ' => nil' or (' => ' .. tostring(mod)))
  end
  local msg = '[tetris] module FAILED: ' .. name .. ' | ' .. table.concat(tried, ' | ')
  MOD.loadErrors[#MOD.loadErrors + 1] = msg
  if printerr then printerr(msg) else print(msg) end           -- printerr = 官方错误级日志（API 文档 :547）
  return nil
end

-- 只定义、不实例化（此相位 = OnInit，InstantiateClientUIControl 必返 nil）
MOD.rules  = loadModule('rules')
MOD.board  = loadModule('board')
MOD.render = loadModule('render')
MOD.input  = loadModule('input')
MOD.ai     = loadModule('ai')

-- 【示意】模块名清单按实际拆分调整；主文件 OnStart 里再实例化控件
--  真机的 OnStart 保留原主体，只在开头插入「缺失诊断 + 调模块函数」
function OnStart()
  if #MOD.loadErrors > 0 then
    print('[tetris] 模块缺失 ' .. #MOD.loadErrors .. ' 个，进入降级模式')
  end
  if MOD.board and MOD.board.build then MOD.board.build(script.object) end
end
```

**模块文件形态**（`lua/tetris/rules.lua`）：
```lua
local M = {}
function M.rotate(shape)                   -- 纯逻辑：不碰 script / game
  return shape
end
function M.spawn(board, kind)
  board[kind] = true
  return board
end
return M                                   -- 恰好 1 个返回值（chunk 必须 return 1 值）
```

**验收判据（模拟器侧，命令可跑）**：
1. `node qxqy/build.mjs` 后 `tetris.save.json` 的 `assets.scripts` 出现多条（主 + 各模块，**模块条目 controlId 为空**）。
2. 用独立试玩 case 断言日志里出现 `[tetris] module OK: <name> <- <path>`，且**没有** `module FAILED`。
3. 负对照：故意把某模块名写错，日志必须出现 `module FAILED: … | …`（否则说明 pcall 把错误吞了、判据假绿）。
4. 真机侧另需用户操作（见 ④）。

**导出侧注意**：脚本条目的 `path` 决定 GIA 的 `file_path`（导出自动补 `.lua`），也决定真机 `external_lua_file` 的目录；建议统一 `lua/tetris/<name>.lua`，让真机落地为 `default_import_file/lua/tetris/<name>.lua`，与上面加载器候选顺序一致。

### ③.5 拆分时的四条硬约束（避免踩我们自己的坑）

1. **改完必须 rebuild 再跑用例**：`qxqy/runner.mjs` 读的是 `tetris.save.json` 里**内嵌的 Lua 副本**，不是 `lua/main.lua` 磁盘文件 ⇒ 正确顺序 `改 lua → node qxqy/build.mjs → node qxqy/runner.mjs`；顺序错了会得到「改完还全绿」的假绿（历史事故 D591）。
2. **每个模块都要有一条 `addScript`**（`qxqy/build.mjs`，**不带 `controlId`**），否则模块不进存档 ⇒ 模拟器 `registerScriptFile` 里没有它 ⇒ require 必失败（`failed to load script '…'`）。
3. **200 个 local 的编译上限**：单 chunk 超限直接 `too many local variables (limit is 200)`（历史事故 D591）。拆模块正好给每个模块**独立 200 预算**——这是模块化除可维护性之外的实打实收益；建议主文件只留「加载器 + 生命周期回调 + 一处 setmetatable/self 引用」。
4. **零成本语法门禁**：`lua5.3 -e 'assert(loadfile("lua/main.lua"))'`（本机 `/usr/sbin/lua5.3` 可用；07:53 与 07:54 两个版本各跑一次均 `compile OK`）。拆分前后都跑一遍，比 `build.mjs` + 试玩快两个数量级。

---

## ④ 真机未验证项（需用户做一步才能验证）

| # | 未验证项 | 为什么未验证 | 用户要做什么才能验证 |
|---|---|---|---|
| 1 | **未挂载脚本能否被 `require`**（真机） | 官方只说「有映射才会打包上传」，未定义 require 可见范围；模拟器实现对全部注册脚本开放 | 导入含 1 主 + 1 未挂载模块的整合包 → 进关试玩 → 若日志出现 `module OK` 即通过；出现 `failed to load script '<path>'` 即否决（此时模块必须挂到某容器上） |
| 2 | **`require` 实参到底要不要 `default_import_file/` 前缀**（真机） | 只有 `script.path` 返回带前缀这一条观察（单次、原件未归档），require 侧无真机样本 | 在真机主脚本里 `print(pcall(require,'lua/tetris/rules'))` 与 `print(pcall(require,'default_import_file/lua/tetris/rules'))` 各打一行，看哪条返回 true |
| 3 | 真机是否支持**点号路径**、`..` 相对路径、大写 `.LUA` | 无任何真机样本；模拟器只验证了归一化里的三种（反斜杠/去 `.lua`/点→斜杠） | 同 #2 的探针脚本加三行即可一次性收口 |
| 4 | 真机 `require` 的**错误文案**是否与模拟器同为 `failed to load script '…'` | HR-04 的文案来自第三方真机回传，未逐字复现 | 真机故意 require 一个不存在路径，把日志原文贴回 |
| 5 | 真机**模块是否共享 `_G`**、模块 `script.object` 语义 | 模拟器每 VM 独立 `_ENV`；真机各脚本共享同一 state，模块 `_ENV` 无真机样本 | 模块里 `print(script.object == nil)`、`print(rawget(_G,'主脚本全局名'))` 两行日志 |
| 6 | 多映射导入的**重复映射**在多次导入后的去重/命名 | D257 已确证「guid+1 / name+n / path 加 `_1`」，但多脚本 × 多轮的组合后果只在单脚本 tetris 上观察过 | 首次导入多模块整合包后，在编辑器「客户端脚本映射」里核对条数与路径，并把截图/清单回传 |
| 7 | 性能影响（~3900 行拆多文件后，模块 chunk 数量对首帧的影响） | 无测量；模拟器 require 是同步 `lua_pcall`，真机 VM 行为未测 | 拆完后按 D635 的 headless `playStep` 帧耗时探针交替对照旧版基线（真机另看进关耗时日志） |

---

## ⑤ 参考清单（文件:行）

**模拟器源码**
- `client/lua-runtime/src/runtime.js:85-92`（scriptFiles/requireAliases/requireCache/moduleBaseEnvironments）
- `runtime.js:175-183`（`registerScriptFile` + `default_import_file/` 别名）
- `runtime.js:185-193`（`normalizeRequirePath`）
- `runtime.js:1151-1189`（`luaRequire`：别名、缓存、循环检测、三种错误文案）
- `runtime.js:1191-1205`（`newLuaThread`：沙箱快照成模块基环境）
- `runtime.js:1240-1274`（`loadModule`：dummy `script`、独立 `_ENV`、`pcall(0,1)`）
- `runtime.js:1276-1326`（`mountScript`：相位序列、失败摘除）
- `runtime.js:418-421` + `runtime.js:652-653`（Instantiate 相位闸门）
- `runtime.js:1328-1348`（`runChunk`：主 chunk `lua_pcall(L,0,0,0)`，返回值丢弃）
- `studio/index.js:136-149`（`normalizeScriptEntry`）、`:249-256`（`allocateScriptGuid`）、`:290-300`（`resolveScriptTarget`）、`:496-522`（`setScriptMount`/`applyScriptOp`）
- `studio/index.js:962-972`（`resolveScriptSource`：`source` 空则读磁盘）
- `studio/index.js:974-1014`（`playStart`：全部脚本 vs `sceneScripts`/`templateScripts`）
- `studio/gia/codec.js:541-574`（`scriptMounts` / `withScriptMounts`）
- `studio/gia/codec.js:630-647`（`exportGia` 保留该警告）/ `:648-682`（`exportCombinedGia`，过滤在 `:664`）
- `studio/gia/codec.js:694`（`SCRIPT_MOUNT_WARNING`）、`:696-700`（`scriptDisplayName`）、`:717-759`（`scriptGraphUnits`：`.lua` 补全 `:743-748`、warning 条件 `:735-737`）
- `studio/gia/codec.js:761-775`（`exportScriptGia` 保留警告）、`:793-816`（`extractScriptMappings`：缺 `.lua` 警告）、`:1133`（导入侧）

**模拟器文档**
- `client/lua-runtime/docs/architecture.md:26`（require 契约表行）、`:62`（模块值与 `_ENV`）、`:64-69`（require 回归与未覆盖范围）
- `client/lua-runtime/docs/observed-contract.md` 第 4（require）、11（无 `package`）、20（`script.path` 保留目录，真机 `default_import_file/levelScript`）条；TWSEM 条「跨脚本 Invoke 未对齐（真机共享 state / 模拟器每 VM）」
- `skill/SKILL.md:185`（同 `dsh-plugin/skill.md:185`）：「映射路径去 `.lua` 后加 `default_import_file/`；裸路径只为旧存档兼容」
- `agent/wonderland-lua-builder/skills/qxqy-game-studio/references/07-device-validation.md:68`：「只同步存档登记的 Lua 脚本（**含未挂载的 require 模块**）」

**官方文档面**
- `research/千星知识图谱/learn-lua71/官方API文档-客户端控件.md:534`（print）、`:547`（printerr）、`:823`（Script.path 只读）、`:5044/5057/5070`（GetScriptByPath / GetScript / GetScripts）
- `research/千星知识图谱/learn-lua71/官方教程-客户端控件和客户端脚本.md:236/242`（脚本映射路径 ↔ 本地文件关联）、`:273`（**上传规则：只有建立了映射的 lua 才打包上传**）、`:297-301`（用脚本映射 ID 调用其他脚本）
- `research/千星知识图谱/learn-lua71/知识提炼.md:82`（require 复用，入参=客户端脚本中显示的文件路径）
- **官方 API/教程全文 grep `require` 零命中**——require 语义没有任何官方条文，只有真机观察与模拟器实现。

**我方真机差分知识**
- `docs/knowledge-graph/d/d3d-客户端Lua脚本.md` §三 HR-03/HR-04/HR-11；§10.1（GIA 导入三改写、重复导入去重、`external_lua_file/<file_path>` 提取）；§10.2（`f74` 挂载槽只在容器节点）；§10.3（`gsts assets:scripts` 命令面与安全写回）
- tetris 侧：`qxqy/build.mjs:158-166`（当前 `addScript` op）、`qxqy/deploy.mjs:33-37`（真机 `external_lua_file/default_import_file/lua/main.lua`）
- 记忆：D257/D268（挂载 wire 与 f50 登记表定谳）、D632（tetris 三条重复映射 + 正确更新通道）、D635（帧耗时交替对照法）
