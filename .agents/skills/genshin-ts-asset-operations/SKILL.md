---
name: genshin-ts-asset-operations
description: 在 Genshin-TS 中操作真实地图 .gil 的“资源”类资产：设置变量（assets:custom-variables / assets:level-variables，含全部类型与 dict）、挂载节点图（assets:node-graphs create + assets:mounts attach/list/detach + GIA 注入链路）、屏幕 UI 控件（assets:ui list/clone/create/update/template）和信号（assets:signals inspect/register/update/repair）。当用户提到“设置/写/改变量”“关卡变量”“实体变量”“dict 变量”“挂载节点图/把图挂到实体/图挂载/节点图挂载”“技能配置/技能资产/创建技能”“屏幕控件/UI 空间/UI 按钮/文本框”“信号注册”“assets:xxx 写回”或任何需要修改 .gil 里非静态模型的资源数据时，必须使用本技能，即使没有点名“技能”。**写回/引用前的同类资产盘点同样走本技能**（`references/scripts/audit-map-assets.ts`，**从仓库根全路径调用**：技能变量配置 ID 段在位/空闲判定、单位状态是否已存在及其参数是否已配置）——凡涉及"技能变量 ID/单位状态 ID/状态配置/要不要请用户新建资产"的判断，先盘点再动手。它给出安全写回流程（快照备份→候选验证→回读→写回→报告备份路径）与各资源的 CLI 速查，让模型像做外科手术一样安全改真实地图资源。与 static-gil-model-builder（静态视觉模型/元件/装饰物）、gil-node-graph-editing（节点图内部读-改-写）、verify-injection（GIA 注入）、editor-incremental-gia-investigator（未知 wire 规则的编辑器差分）分工明确，不要混用。
compatibility: Genshin-TS repository with node, tsx, `gsts assets:*` CLI (assets:custom-variables / assets:level-variables / assets:mounts / assets:node-graphs / assets:ui / assets:signals), a user-verifiable real map .gil or fixture.
---

# Genshin-TS 资源操作（变量 / 节点图挂载 / UI / 信号）

把“改 .gil 里的资源数据”这件事收敛成一条可复用的安全路径。它不是节点图内部逻辑编辑，也不是静态视觉模型拼装，而是以下四类资源操作：

- **设置变量**：关卡变量、实体变量、CustomPrefab/玩家/角色初始变量，含全部类型与 dict；
- **节点图挂载**：创建空图占位 + 把图挂到实体/元件（type 3 槽），并与 GIA 注入链路衔接；
- **屏幕 UI 控件**：root 9 屏幕空间控件（文本框/按钮）的 list/clone/create/update/template；
- **信号**：根图间事件信号的 inspect/register/update/repair。

这些命令修改 `.gil` 资产结构，**不等于** NodeGraph 注入、runtime createPrefab、编辑器导入或游戏行为。写回成功后必须把“写回成功”“编辑器可见”“游戏行为验证”分开报告，绝不互相冒充。

## 任务边界（先分流，再动手）

| 用户真正要的东西 | 入口 |
| --- | --- |
| 新建/改静态视觉模型、元件、装饰物、场景实体外观 | `static-gil-model-builder`（本技能只负责实体创建后的变量写入） |
| 读/改节点图内部逻辑（节点、连线、复合、参数） | `gil-node-graph-editing` + `gil-node-graph-reading` |
| 把编译出的 `.gia` 注入游戏 | `verify-injection`（注入前如需空图占位/挂载，看本技能「节点图挂载」） |
| 设置变量 / 挂载节点图 / UI 控件 / 信号 | **本技能** |
| 列出/解析用户地图的元件资源与摆放实体 | **本技能**（`assets:resources list`） |
| 创建/转化 静态/动态元件 | **本技能**（`assets:prefabs create [--static]`） |
| 未知 wire 规则 / 编辑器 A/B 差分 | `editor-incremental-gia-investigator`（本技能假设规则已闭合） |
- **UI 控件创建最小增量红线（2026-08-27 富版贪心事故后强制）**：
  - 任何 UI 控件创建实现，必须先有「编辑器能产生的最小形态」的完整 wire 知识（落盘到 ui-controls.md）；
  - 知识不足（记录标「待差分」/只有复杂样本）→ **禁止直接复用复杂样本 hex**，先申请用户做 10 秒编辑器最小实验（加最小控件→保存→提取 wire→落盘）；
  - 实现顺序 = 最小单元（1 个）→ 逐个加状态/页签项/内容组，每步候选验证 + 用户核验后再增量；
  - 禁止一次性实现含多状态/多页签项/未闭合字段的「完整版」并写回真实地图。

## 启动路由

先判断目标资源类型，再选命令族：

| 用户意图 | 命令族 |
| --- | --- |
| 列出/解析 元件资源（root4 自定义定义 + root8 官方/静态实例）与摆放实体（root5） | `assets:resources list [--gil <map>]` |
| 创建自定义元件 / 静态元件 / 切换静态/动态 / 挂装饰物 | `assets:prefabs create [--static]` / `assets:prefabs convert` / `assets:aux attach` |
| 关卡变量（root5 关卡实体） | `assets:level-variables list\|create\|update` |
| 任意场景实体变量 / CustomPrefab / 玩家 / 角色变量 | `assets:custom-variables --entity <id>` 或配置 `assets.customVariables`（2026-09-04 起 **--entity 自动识别元件 root4 与场景实例 root5**，无变量组件槽时从零创建；配置 `syncInstances` 传导元件修改到引用实例——84819bb；注意：声明层级=客户端可见性决定因素，客户端要读的变量须声明在实例本层，见 client-nodegraph-development 三-9） |
| 把图挂到实体/元件，或查挂载关系 | `assets:mounts attach\|list\|detach` |
| 地图还没有目标图，注入找不到图 | `assets:node-graphs create`（空图占位） |
| 屏幕控件/UI 空间 | `assets:ui list\|clone\|create\|update\|template` |
| 信号注册/更新/修复/检查 | `assets:signals inspect\|register\|update\|repair` |
| 技能配置创建/列出（36/6/28 模板×普通/瞬发+绑定） | `assets:skill-config create\|list`（详见 reference 速查；28 模板固定模型遗迹守卫 10005001、root20 联动；28+普通 仅 list） |
| **写回/引用前：盘点地图既有同类资产**（技能变量段真实边界、单位状态是否已存在及其参数态） | `npx tsx .agents/skills/genshin-ts-asset-operations/references/scripts/audit-map-assets.ts <map.gil>`（只读；2026-09-04 票 20 E0 沉淀） |

命令细节与 dict 编码见 [references/asset-cli-reference.md](references/asset-cli-reference.md)。

## 通用安全写回流程（所有资源操作共用）

CLI 的 `--write` 不是“自动安全”的免检口。每次都按同一顺序走：

0. **地图定位（资产任务第一步，2026-09-03 用户点名固化）**：`node ./bin/gsts.mjs maps` 一次列出全部游戏地图+目录——游戏地图在 `/mnt/c/Users/<用户>/AppData/LocalLow/miHoYo/原神/BeyondLocal/<uid>/Beyond_Local_Save_Level/`（Windows 挂载盘，glob/find home 找不到），Temp 缓存在同级 `../Temp/`。**禁止 glob 摸索地图路径**（09-03 实证白耗多轮）。tsx 沙箱故障（`Cannot resolve tsconfig`）时 `node ./bin/gsts.mjs`（不走 tsx loader）是稳定替代通道。
1. **只读盘点并锁定源 SHA**：`sha256sum <map.gil>`，导出当前相关资源（变量 `--list`、挂载 `assets:mounts list`、UI `assets:ui list`、实体 `assets:entities --format json`），确认目标 ID 空闲、类型/容器正确。ID 分配遵守 `static-gil-model-builder` 的 ID 纪律（新元件/实体 ID 必须 ≥1077936129，且 root4/5/6 双查）。
1b. **"要用户在编辑器新建 X"前先跑同类盘点（2026-09-04 票 20 E0 实证，省一轮用户动作）**：
   `npx tsx .agents/skills/genshin-ts-asset-operations/references/scripts/audit-map-assets.ts <map.gil>` 只读输出 A) 技能变量配置 ID 哪些在位/
   哪些空闲（字节命中 1 次=仅声明零引用=可用；≥2 次=已被他图引用勿复用）B) 单位状态资产的
   配置 ID / 名称 / 效果 ID / **关键参数是否已配置**。E0 原计划请用户新建「定时触发技能」状态，
   盘点后发现**地图里已存在**（id=1077936132）只是参数为空 → 用户动作从"新建+配置"降为"配置 3 项"，
   并顺带暴露该状态指向**槽位 12**（不是常规槽 1）的错配——若直接按槽 1 装配，定时触发找不到技能
   = 结构层全绿、游戏里什么都不发生的静默失效。**计划让用户动手之前，先证明那个东西真的不存在。**
2. **生成候选（优先 `--output`）**：先不直接写源，用 `--output <new-file>` 生成不存在的候选，独立回读候选，确认只出现计划字段。
   - ⚠️ **`assets:entities` 子命令红线（2026-10-12 足球 v3 A 批实证，已回灌 CLI fail-closed）**：
     import 必须写全 `assets:entities import --entities <file>`——**无子命令=只读 export**，
     旧版会把 `--entities`/`--write` 静默忽略并 exit 0（零写入零备份，误判已写入；新版直接
     报错指路）。import 的 `--output` 生成 **GIL 候选**（与 static-assemblies/terrain 一致，
     可独立回读）；export 的 `--output` 才是导出实体 JSON。真写入判据=输出含
     `writePerformed=true` + `backup=` 两行。
    - ⚠️ **验证管道红线（2026-10-12 足球白模误报复盘，CLI 无罪）**：`assets:static-assemblies`
      的 `--output` 与 `--write` 在 ID 冲突上**同口径 fail-closed**（assertIdsFree 双路径生效；
      报错已含修复指引——换 ID 段/staticPrefabUpdates/回滚重写）。当日"写入成功"误报的真凶是
      **shell 管道**：grep 过滤吞掉报错行 + `&&` 链断后 `;` 尾巴无条件执行 + 空变量 sha256sum
      打出无关文件哈希被误读为候选 SHA。脚本化验证规范：①报错敏感链禁止裸 grep 过滤；
      ②**落盘判据=字节级验证**（grep 目标值如配色 ARGB varint，旧值应归零——结构回读计数
      不区分新旧内容）；③机器验证用 `--format json`（结果 stdout/日志 stderr 分流）。
3. **展示安全门并取得确认**：真实既有地图写回前展示 目标地图/路径、源 SHA、候选 SHA/大小、目标 ID、修改范围、备份位置、回滚方式。用户已明确给出“直接写/用 --write”的指令时，可把该指令作为本轮确认。
4. **`--write` 写回**：CLI 自动在同级 `.gsts/backups/` 建带时间戳备份并校验源 SHA；记录备份路径。**批量撤销已写回内容 = 恢复最早备份**（第一个时间戳 .bak=写前原状，恢复后按新方案重写），禁止手写 wire 删除脚本（09-03 实证驯化两轮未成，恢复路径 1 分钟搞定；CLI 变量操作全 upsert 无删除命令）。
5. **写后独立回读**：用与写前相同的只读命令回读，对比只差目标字段；写后 SHA 不等于写前，且等于写回产物。**对比工具输出先 diff 看差异本质再定性**——`node-graphs read --json` 含 `"gil"` 源路径字段，直接 sha256 对比会假报"图被改动"（09-03 实证，须 `grep -v '"gil"'` 排除）。
6. **写回后提醒用户重载地图（勿主动保存旧内存）**：磁盘写回**不需要**游戏/编辑器先退出；唯一覆盖风险是运行中编辑器/游戏**主动保存旧内存**（写后“变更消失”的已知根因）。写回后先核对 hash 是否等于写回后 hash；若编辑器已加载旧图，请用户重载地图后再看/再保存，不要用旧内存保存覆盖。
7. **分层报告**：`候选就绪` → `写回成功` → `编辑器可见/游戏核验`，前一层不能冒充后一层。

> 为什么不能跳过候选回读：CLI 成功只证明字节写进去了，不证明结构语义正确（例如 definitionId 不在 root4、关卡实体被手动 import、dict marker 推算错）。独立回读是唯一能挡住坏写回的低成本检查。

## 分域操作

### A. 节点图挂载

“挂载”= 把一张已存在的节点图接进对象（实体/元件）的 type 3 槽；它和“注入 GIA”（把图写入 root10）是两步，但生产流程经常串联。

标准链路：

```text
确认目标图存在 → assets:node-graphs create（缺图时建空占位）→ assets:mounts attach
→（需要 GIA 时）verify-injection 单文件注入 → 回读挂载关系 → 用户游戏核验
```

- 缺图时先 `gsts assets:node-graphs create --gil <map> --name <name> --write`（图 ID 自动分配，从 1073741825 起；注入报 `target NodeGraph not found` 就用它补占位）。
  - **⚠️ create 是 max+1、不复用空洞（2026-08-23 实证）**：删除的主图 ID（如 1073741825）重建时会跳过，分到更大的新 ID（如 1830）。
    .gia 内嵌图 ID，必须**同步改 DSL g.server({id}) + 配置 inject.nodeGraphId + 重新挂载**到新 ID；旧挂载需用编辑器清理残引用。
  - 多图协作首选**单信号 + op/val 参数**（2026-08-23 实证），少建多个信号；根图事件回调改变量用高层 `f.setNodeGraphVariable`。
- 挂载：`gsts assets:mounts attach <target-id> --graph <gid> [--entity|--def] --gil <map> --write`；`list [<target-id>]` 查挂载关系；`detach <target-id> --graph <gid>` 卸下（最后一条卸完保留空 `08036a00` 槽）。
- **挪挂（A→B 实体）两步候选链（2026-09-03 足球 R2.2 实证）**：`detach A --graph G --gil <map> --output cand1` → `attach B --graph G --entity --gil cand1 --output cand2` → 回读 cand2 挂载关系 + `node-graphs read --json`（排除 `"gil"` 源路径字段）与原图 **CMP-SAME 零改动验证** → 两步 `--write`（各自动备份）→ 写后 SHA==cand2 → Temp 同步双 SHA。挪挂改变图内 `getSelfEntity()` 语义（A→B）——挪前核对 B 上既有图的**定时器名单制分发**（A/B 两实体全部 whenTimerIsTriggered 的 else 均空才不串扰）。
- **⚠️ 写回不同步 Temp=修复被引擎会话洗掉（2026-10-12 足球 1825 实证，票 24 §6 def 移植消失案）**：/tmp 脚本只写 Save_Level（终态 a3703aad）未同步 Temp → 用户下次进图，引擎从 **Temp 旧副本**（425a9ffc 态）加载地图，退出时双地址回写 → 磁盘终态变 e6c4688d，§6 修复无声消失，且引擎回写把 basicMotion 槽 9B 规范化为 11B（回写非纯回放）。**任何 .gil 写回（含自写工具脚本）最后一步必须 copy 到 `Temp/<mapId>.gil` 并核对双址 SHA 一致**；assets_* 命令的 --write 已内置，绕过 CLI 的脚本要自己做。
- **挂载目标用普通场景实体**。⚠️ 关卡实体（1094713345，官方 defId=10003004）由游戏运行时默认创建，**禁止手动 import 添加**——手动加会导致游戏“地图异常”。需要挂载对象时先用 `assets:entities import`/`static-assemblies` 建普通实体。
- **特殊实体挂载（玩家/角色模板，2026-08-30 用户编辑器教学差分实证）**：玩家模板 1086324737（root4 def + root5 九副本 737–745）/ 角色编辑实体 1090519041（def + 实体）；挂载条目 wire = `{1:1, 2:图GID, 501:20000}` 与普通实体同构（root5 f6 / root4 f7）。**编辑器挂模板 def = root4 f7 + root5 全部副本 f6 自动同步**；CLI `--def` 只同步 root8（元件）**不同步 root5 副本**——复现编辑器形态须 `attach --def` + 循环 `attach --entity`（每副本）。事件定向：`whenSkillNodeIsCalled` 需挂角色侧（详见 graph-mounting.md「特殊实体的节点图挂载」）。
- 多人语义：挂到玩家/角色实体上的图按玩家分别执行；需要“全局只执行一次”时自行加去重门控，不能默认一次。
- **玩家/角色实体变量 = 资产侧模板同步（2026-08-29 矩阵批次 11/12 实证）**：编辑器修改任一玩家实体
  变量 → 自动同步全部玩家实体副本（本地图 9 个 1086324737–745，entry 字节相同 = 模板复制）；
  CLI 写玩家实体后若需全副本一致，须自行逐个同步（CLI 无编辑器式自动同步）。**资产侧同步 ≠
  游戏行为**（运行时对实际玩家 1~8 人全生效、挂载图 per-player 触发 = L4 用户核验，见 variables.md）。

### A2. 元件/实体资源列出与静态/动态元件

- **列出/解析用户地图资源**：`gsts assets:resources list [--gil <map>] [--format json]`
  - `prefabs`：**元件资源** = root4 自定义定义（`custom-definition`）+ root8 官方/静态实例（`official-instance`）
  - `entities`：**摆放实体** = root5 场景实体
- **概念语义（2026-08-20 用户澄清，核心）**：定义（root4）= 元件本体；元件页面模型（root8）=
  可视化编辑辅助（不渲染到场景，删了定义仍在）；场景实体（root5）= 引用定义。
  UI"静态元件"分类 ≠ wire 无组件（纯静态类型保留组件槽）；"切换静态"才删组件槽。
- **静态 vs 动态资源（2026-08-20 用户实证）**：
  - 动态资源可转换为静态资源；静态资源**只支持基础 缩放/位置/旋转**，**不支持组件、变量、高级功能**
  - **切换静态**（`convert --static`）= 删组件槽（定义 f8/实例 f7/引用实体 f7）+ 名字槽 f11 加 `{f2:1}`；
    **切回动态** = 恢复 6 个官方默认组件槽 + 删标记
  - 静态元件（root8 实例）记录**无 f7 组件槽**（约 409B），root6 注册表登记 **type 400**（场景实体为 type 200）
  - 因此：静态资源实体**不要设变量/组件**；动态资源实体才可设变量
- **创建/转化元件**：
  - 动态/自定义元件：`assets:prefabs create --base <官方ID> --id <new>`（root4 定义 + root6 type6 登记）
  - 静态元件：`assets:prefabs create --static --base <官方ID> --id <new> [--name <n>]`（root8 页面模型）
  - 切换：`assets:prefabs convert --id <prefabId> --static|--dynamic`（定义/模型/实体联动；定义-only 也支持）
  - **批量更新（2026-08-22 五轮差分闭合）**：`assets:prefabs update --id <definitionId> [--force]`
    - 语义：改 root4 定义（元件本体）→ 同步 root8 实例（所见即所得）+ 所有引用该定义的 root5 实体。
    - **默认差异化保留**：实体独属修改（加组件/改属性/transform）不被覆盖；`--force` 才强制覆盖。
    - **三层独立副本铁律**：root4 定义 f8 / root8 实例 f7 / root5 实体 f7 是**三份独立副本**，
      编辑器操作只改目标层、**不自动同步**（改"元件面板"→写 root8；改"场景实体"→写 root5；
      root4 定义在编辑器里不被直接编辑）。游戏实际读取 root5 实体 f7。
    - **差异化保留 = 字段级差异（无 override 标记）**：实体独属修改 = 实体 f7/f6 与定义 f8 的差异；
      加组件 = 实体 f7 多一个组件槽；改属性 = 实体 f7 内容变；移动 = 实体 f6 变。
      transform（f6）永不参与同步（实体摆放坐标独立）。
  - 挂装饰物：`assets:aux attach --host <实体|定义|模型ID> --resource <装饰物资源ID>`（root27 aux + 宿主 f501）
- ⚠️ `assets:gadgets` 的 `list_id` **不是游戏元件 ID**（如 `1000218`≠`20001219`），需要映射表；映射样本见 `~/genshin-ts-evidence/toolchain-gaps/1073741896/raw/gadget-mapping.md`，不可直接把 list_id 当 definitionId/resourceId 写实体。

### B. 设置变量

变量按作用域分实体级 / 节点图级 / 局部；本技能只做**实体级/关卡级/初始变量**的 .gil 资产读写，不碰节点图内部局部变量。

- **⚠️ 预注册前置（2026-08-30 定规）**：DSL（`setCustomVariable`/`getCustomVariable`，尤其客户端图读取）
  使用的自定义变量**必须先在本节 CLI/API 预注册定义再进 DSL**——官方文档要求变量已存在，且 3007
  日志实证动态创建的变量客户端图读不到（无 OUT 帧）。红线细节、新地图玩家模板前置步骤与 API 入口
  见 `references/asset-cli-reference.md` §1「预注册前置红线」。
- 关卡变量：`gsts assets:level-variables create --name <n> --type <t> [--value <v>] [--entity <id>]`（默认关卡实体 1094713345）；`list` / `update` 同理。
- 任意场景实体变量（含新建实体）：`gsts assets:custom-variables --entity <id> --vars "name:type=value;..." --write`，回读用 `--list --format json`。declaration 是 upsert：同名同类型更新，缺失追加，不会动其它变量。
  - **每条 entry 必须带 `=值`（09-03 实证）**：`name:entity` 无值形态报 `invalid --vars entry`；entity/guid 等引用型写 `name:entity=0`（0=空引用占位，运行时由图 `setCustomVariable` 动态赋值——实体 GUID 不硬编码进资产初始值）。
  - **CLI 无变量删除命令**（全 upsert）——需要撤销时走通用流程 step 4 的最早备份恢复，勿手写 wire 删除。
- 元件/玩家/角色初始变量：`gsts.config.ts` 的 `assets.customVariables` 声明，`assets:custom-variables --write`（无 `--entity` 时走配置路径）；`syncInstances: true` 会补齐明确引用模板的实例容器（玩家模板通常需要“顶层定义 + 实例容器同步”两处都写才可见）。
- **推荐串联**：`assets:entities import` 建实体（自动继承元件定义变量容器）→ `assets:custom-variables --entity <id> --vars ...` 写变量 → `--list` 回读。
- dict 语法：`name:dict=k1=abc&k2=[a,b]&k3=[1.5,2.5]&k4=[1,2,3]|4,5,6`；dict 值支持 str/int/float/str_list/int_list/bool_list/float_list/vec3_list。marker 公式与完整表见 reference。
  - **int key 已支持（2026-08-29 证据复核）**：纯数字键自动解析为 int key（`dictKeyOf`，f13 编码，marker keyBase=int=40）；
    编辑器真实样本已锁定 marker：(3,3)=43、(3,11)=56、(6,3)=63、(6,11)=76（after-dict-keytypes/int-key-dict/int-values，2026-08-18）。
  - **一个字典 = 一种键类型 + 一种值类型（fail closed）**：混合键/混合值类型会被拒绝（`assertUniformDictPairs`），
    不再静默生成 f503/f504 与个别 pair 不一致的畸形 wire。

### C. 屏幕 UI 控件（UI 空间）

屏幕控件在固定屏幕坐标空间，不在 3D 世界；**按钮事件只有挂载在玩家模板/玩家实体上的节点图能收到**
（2026-09-05 用户实测修正：不是角色侧；玩家图收到后再转发给角色/其他实体）。

- `gsts assets:ui list --gil <map> --format json`（枚举 root9 控件）
- `gsts assets:ui clone <source-id> --id <new-id> [--name <n>] [--donor-gil <file>] --write`
- `gsts assets:ui create --type textbox|interactive-button|custom-button --id <new-id> [--name <n>] [--content <text>] [--position <x,y>] [--size <w,h>] --write`
  - ⚠️ **create 只给“编辑器默认形态”**：自定义按钮目前只有一个常态素材组 + 文本；要用于交互/技能还缺
    **按键类型（交互事件/技能/道具）、技能槽位/冷却、键鼠/手柄映射、是否可点击、悬停/按下/禁用素材**
    等基本配置，需在编辑器或后续 CLI 补齐；`assets:ui list` 的 props 目前也不解码这些字段（只列几何/文本/状态素材）。
- `gsts assets:ui create --type image --id <new-id> --asset <素材索引ID> [--layout <布局ID>] [--name <n>] [--position <x,y>] [--size <w,h>] --write`（官方预制图片控件引用素材；`--asset` = 素材库容器 ID，见 `assets:library-inject`）
- `gsts assets:ui update <control-id> [--name|--content|--position|--size] --write`
- 模板：`gsts assets:ui template list|clone`（复用已存在的控件组模板）。
- position 是屏幕中心偏移、size 是宽高（像素语义）。控件只做资产写回；显示/隐藏/禁用运行时行为、按钮事件如何进玩家节点图，属于节点图/运行时逻辑，不要混写进静态资产步骤。
- **选项卡组件（tabBar，type 17）标准配置流程**（2026-08-22 足球事故反馈，非配不可测）
  - **命令**：`gsts assets:static-assemblies tab-options <instance-id> --name <预期组件名> --options <a,b,c> [--region-type box|sphere + --region-size/--region-radius + --region-center] --write`
  - **region 是生效范围**：选项卡只在玩家**进入 region** 时才显示。球体示例（rubik-2x2）`--region-type sphere --region-radius 3 --region-center 0.1,0,0`；盒体用 `--region-type box --region-size w,h,d --region-center x,y,z`。
    不配 region 时游戏可能给默认 1×1×1 盒且回家时仍不显示——**必须显式**。
  - **options**：最多 10 个（multiple_branches 上限），超 10 必须拆成多个 tabBar。
  - **三件套缺一不可**：实体上的 tabBar 组件配好（上）+ 节点图 `gsts assets:mounts attach` 挂到该实体 + `whenTabIsSelected` DSL 已写——缺任何一件游戏内点不了。
  - **验证**：`assets:static-assemblies inspect <id>` 可见 `components[0].type === 'tabBar'` + region 字段完整；再进编辑器目视「点击或进入 region 有选项卡浮现」才算完成（**不能只靠 `mounts list` 显示挂载就交付**——2026-08-22 实证）。
  - **tabBar 三层副本（2026-08-22 魔方"改了元件但游戏没生效"实证）**：tabBar 组件槽在 GIL 里有**三层独立副本**，`tab-options` 命令**三层都写**（已修复，勿再只改一层）：
    1. **root4 元件定义**（f8 组件槽）——元件本体；
    2. **root8 元件实例**（f7 组件槽）——编辑器元件页面模型；
    3. **root5 场景实体**（f7 组件槽）——**游戏实际读取的副本**，通过 field 2 引用 prefabId 定位。
    - 只改 root4/root8 不改 root5 → 游戏里"没生效"（旧命令的 bug，已修）。
    - 三层可能**已经分叉**（历史只改了一层）：排查"选项对不上"时先读三层各自内容，别假设一致。
    - 选项 id（field 1）= 1-based 序号（第 N 项 id=N），`tab-options` 按序重编号；删除中间项后 id 会重排，依赖 id 的节点图逻辑（如 relay +9 映射）需同步核对。
    - 写回后仍需编辑器重载/重放确认（磁盘写回会保留；运行中旧内存若主动保存才会覆盖）。
- **场景实体直改 tabBar 选项（assets:entities patch --tab-options，2026-08-27 测试台实证）**：
  不经 static-assemblies 时可用 `gsts assets:entities patch <entity-id> --tab-options '标签a,标签b' --write`——
  只写 root5 实体副本（适合同 definition 多实体需不同选项的场景，如从 B 控制器元件新挂的测试台）。
  **已修复嵌套写回 bug**：setTabBarOptions 修改 configField 后漏 `slot.value = emit(slotFields)` → patch
  报成功但选项不变；排查手法 = 直接调 dist 函数 + exportEntities 回读（size 不变即函数 bug）。修复已过
  导出回读验证，**编辑器/游戏核验待做**（2026-08-27 rubik 测试台复测时观察）。

### C2. 悬浮交互页与高级控件候选链（2026-09-09 rubik-game 全流程实证）

- **悬浮页规范创建三件事（W1 事故回灌，2026-09-11，最高优先）**：
  1. **唯一规范路径 = `create --type floating-page --on library`**（轮24 三条单条族：实体+固有容器+关闭按钮，**自动注册进控件组库 1073741840** → `assets:ui list` 显示 `path=控件组库:悬浮交互页#N`，库序=showFloatingInteractionPage 页索引）。旧 `createFloatingPage` 4 条合并形态已停用（护栏报错）——W1 实锤其产出「未归属+假容器+t42 悬空引用」三重废品。
  2. **详情控件（按钮/文本框/页签）挂固有容器**：`create --type custom-button --on 悬浮页:<实体ID>:<固有容器ID> --name ... --position X,Y`（固有容器含关闭按钮成员→f503 在位→校验通过）。**容器空白无 f503 是轮33 文档正常态**，不要误判 CLI 缺口；`container add` 建的页面容器仅多容器布局需要。
  3. **delete 已闭环**：`assets:ui delete <悬浮页实体ID>` 自动整族删除（t42 容器树+素材组+假宿主空后回收）；孤儿记录加 `--orphan-ok`（rubik-game 2026-09-11 12 条清理实证，live==Temp==候选逐字节）。
- **高级命令面比 help 头部宽**：`assets:ui create --type` 除 textbox/interactive-button/custom-button/image 外支持 `floating-page --on library`（显式三元组 ID：实体/容器/关闭按钮顺延）；另有 `container add`、`tab page add/rename/default`、`floating-page variable add`、`state material add` 等票10 命令（commander help 低报——判 CLI 能力看 `src/cli/assets_ui.ts` 的 usage 字符串，同 commander 低报先例）。
- **tab create 自动带默认页「页签项_1」**（pages=4 陷阱）：目标 N 页签的正确姿势 = create tab（默认页#1）→ `tab page rename --page 1` 改为首目标页 → `tab page add` 其余 N-1 页。**无 tab page remove 命令**，多页只能重建链。
- **custom-button 默认布局直达**（省 --on）；textbox/image 需显式 `--on layout:<ID|名称>`。
- **entities import JSON 形态（复踩 2 次的坑）**：顶层必须 `{"schemaVersion": 1, "entities": [...]}`；`color` 必须字符串 `"#RRGGBB"`（export 输出对象形 `{enabled:...}`——**导出/导入不对称，不能拿 export 结果直接回灌 import**）。
- **`assets:node-graphs read` 用 `--graph`（非 `--id`）**；read --json 对泛型 `R<T>` 引脚显示「ConcreteBase N」**不含常量值**——常量落位核验必须 `tools/gia-verify-pin.ts --vals` + `tools/explain-gil-node-graph.ts`（字面量显示）双通道。
- **候选链纪律（UI 批量产出标准路径）**：全部 `--output` 链式迭代（每步以链尾为源，候选不覆盖旧文件——撞名换新名）→ 结构回读（`assets:ui list --gil 候选`）→ 用户确认 → **整包应用**：SHA 锁定→手工备份→cp 候选到真图→`maps:resync`→双址 SHA 一致断言→`list` 真图复核。前提自检：链起点后真图无写入、用户未保存（不符则重建链）。

### D2. 技能配置（2026-08-29 CLI 落地，证据见 docs/game-engine-knowledge/gil-structure-semantics.md「技能配置资产」）

- `gsts assets:skill-config create --id <必填> --name <名> --template 普通技能|36|自定义技能|6|自定义造物|28 --skill-type 瞬发|普通 [--graph-id <图ID,...>] [--output <候选>|--write]`
  - 模板×释放类型支持矩阵：36/6 全组合；28 仅瞬发（固定模型 10005001 遗迹守卫 + root20 1970→2955B 联动，多造物技能共用容器合法）
  - 瞬发绑定 = body f5（轨道点 1073741825+7×顺序）；普通绑定 = 事件轨道打点（36=3001 单打点/6=1001..1007 三打点，限 1 图）
  - 技能配置 ID 分配规则未闭合 → `--id` 必填；普通释放多图绑定/28+普通 绑定 fail closed
- `gsts assets:skill-config list [--gil <map>] [--json]` + `npx tsx tools/list-gil-skill-configs.ts <map.gil>` 独立回读
- 写回流程同通用安全写回（候选 → 回读 → 安全门 → --write → 备份 → 重载编辑器）
- **施放链开发前挂载验证先行（2026-08-31 魔方 cast 链选错技能实证，强制）**：任何
  Create/Cast 技能链动工前先 `assets:skill-config list` 核对现网技能的模板/类型/绑定图——
  历史记录只做线索不做依据（本轮凭最近提交记忆选了 1228931074（36 普通技能），实际历史
  跑通形态是 **template 6 自定义技能+瞬发（body-f5 绑 20002 图）**，36 普通技能需按键
  绑定+激活状态，节点施放（castSpecifiedSkillInstance checkKeyAvailability=false）走
  6+瞬发免按键）。选择公式：**节点图施放 = 6+瞬发；普通(36)+普通 = 需玩家按键激活**。

### D. 信号

信号用于节点图之间传一次性事件；直接写 GIL 时“注册信号”与“注入 NodeGraph”是两步，先注册再注入，注入不得破坏已有注册定义。

- 只读：`gsts assets:signals inspect --gil <map>`
- 注册：`gsts assets:signals register --name <n> --param <name:type> [--template-gil <donor>] [--template-signal <name>] [--send-id/--monitor-id/--server-id] --write`（省略 donor 用内置参数布局；重复的非 str 类型需要 donor，fail-closed）
  - **实测（2026-08-23 rubik-3x3）**：**无参信号不带 donor 注册会报 `Cannot read properties of undefined (reading 'type')`**，带 `--template-gil <map> --template-signal <已有信号>` 即可成功（不传 `--param`）。带 int 参信号同样用同 donor + `--param name:int`。新信号必须先 `register` 进真实地图，之后 `gsts dev` 才能编码该信号的 `.gia`（编码期从地图读信号表，缺注册报 `signal is not registered in target map`）。ID 由 `--write` 自动分配（send/monitor/server 连号）。
  - **注册成功 ≠ 注入后正确（2026-08-30 足球拒载实证）**：`register --write` 保留的信号表周边字段（如顶层 field 10 的 f7=1 标记）可能被后续 **GIA 注入器重建 top field 10 时丢弃**（注入器只重组 field 1-5）→ 游戏不识别信号参数拒载无日志。信号注册 + 注入组合后必须回读顶层 field 10 确认 field>5 保留（verify-injection 8c），并对照编辑器形态核验信号节点字节。
- 原位更新：`update --target-signal <name> --name <new> ...`；残缺注册修复：`repair --target-signal <name> --template-gil <verified-donor> --template-signal <name>`
- 先注册再注入：目标图缺失时先 `assets:node-graphs create` 建空图（见 A 节）。

## 已闭合 / 未覆盖（fail closed，不猜字节）

已闭合（有真实样本/回读支撑）：

- 实体级与关卡变量全 21 类型读写（含 dict 并行 f501/f502 + f503/f504，新建无 Map25）；
- dict marker 公式 `keyBase(40/60) + valueBase`，及 str-key 六种值类型实测（本技能 reference 表）；
- 实体/元件 type 3 槽挂载记录与 `assets:mounts` 逐字节一致；
- UI 控件 list/clone/create/update 的资产结构（root9）；
- 信号注册/更新/修复与内置参数布局。

未覆盖 / 不可推广：

- dict 的 **int key** 已支持（纯数字键自动 int，marker 43/56/63/76 编辑器样本锁定）；混合键/值类型 fail closed；
- 游戏内运行时获取/设置/变量变化事件、多实例变量隔离未验证；
- 挂载对象多图顺序、创建/销毁事件触发精确规则未完全验证；
- UI 运行时显示状态差异（隐藏/关闭/禁用）与多人隔离未游戏核验；
- 负整数、空名/重名变量规则未验证；
- 关卡实体手动 import 会导致“地图异常”——已实证，禁止。

## 每轮报告

```text
对象：变量 / 节点图挂载 / UI 控件 / 信号
目标：mapId / 名称 / 目标 ID / 锁定源 SHA
操作：命令 + --output 候选（SHA）→ --write 写回（备份路径）
回读：写后独立回读摘要（只差目标字段）
状态：候选就绪 | 写回成功 | 编辑器可见 | 游戏核验通过
限制：未验证项（游戏行为/多人/其它类型）如实标注
下一步：只写一个动作
```

## 按需参考

- [asset-cli-reference.md](references/asset-cli-reference.md)：全部命令签名、变量类型码、dict 语法与 marker 表、已知坑、Authority 链接。
- 知识 Authority：`docs/game-engine-knowledge/variables.md`、`graph-mounting.md`、`gia-generation-chain.md`、`ui-controls.md`、`signals.md`；自定义变量架构：`docs/architecture/gil-custom-variables.md`；节点图读改：`docs/architecture/gil-node-graph-edit.md`。
  - ⚠️ **节点图创建/类型相关必读（2026-09-16 补，此前漏列导致实测事故）**：
    **`docs/game-engine-knowledge/node-graphs.md`** —— 含 **folder typeValue 表**（20000→800 / 20001→2100 /
    20002→2200 / **20003→2300** / 20004→2400 / 20005→4300 / …）与 **folderId 类型级常量表**
    （20000→4 / 20001→13 / 20002→14 / **20003→15** / 20006→57 / …），以及**空图自动节点
    因图类别而异**的逐字节配方；**`gil-nodegraph-semantics.md`**（NodeGraph 语义树）；
    **`map-graph-type-matrix.md`**（地图×图型矩阵：哪张地图有哪类图、叫什么、几个节点）。
  - **纪律**：**在动手做任何「定义/创建/差分」之前，先读本行列出的对应 Authority**——
    2026-09-16 实证：创建 20003/20004 节点图时未先读 `node-graphs.md`，直接去字节级挖 folderId，
    结果挖出来的（20003→15、typeValue 2300）**文档里早有**，白耗多轮；用户一句
    「权威文档有看吗」才发现。**本会话第三次同类失误**（前两次见 `dsl-nodegraph-development`
    的 R12/R13 重复发现）。
- 静态模型/ID 纪律与写回安全门：`static-gil-model-builder`。
- 游戏内核验最小注入通道：`verify-injection`。
