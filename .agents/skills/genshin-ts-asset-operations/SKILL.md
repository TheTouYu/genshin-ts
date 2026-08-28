---
name: genshin-ts-asset-operations
description: 在 Genshin-TS 中操作真实地图 .gil 的“资源”类资产：设置变量（assets:custom-variables / assets:level-variables，含全部类型与 dict）、挂载节点图（assets:node-graphs create + assets:mounts attach/list/detach + GIA 注入链路）、屏幕 UI 控件（assets:ui list/clone/create/update/template）和信号（assets:signals inspect/register/update/repair）。当用户提到“设置/写/改变量”“关卡变量”“实体变量”“dict 变量”“挂载节点图/把图挂到实体/图挂载/节点图挂载”“屏幕控件/UI 空间/UI 按钮/文本框”“信号注册”“assets:xxx 写回”或任何需要修改 .gil 里非静态模型的资源数据时，必须使用本技能，即使没有点名“技能”。它给出安全写回流程（快照备份→候选验证→回读→写回→报告备份路径）与各资源的 CLI 速查，让模型像做外科手术一样安全改真实地图资源。与 static-gil-model-builder（静态视觉模型/元件/装饰物）、gil-node-graph-editing（节点图内部读-改-写）、verify-injection（GIA 注入）、editor-incremental-gia-investigator（未知 wire 规则的编辑器差分）分工明确，不要混用。
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
| 任意场景实体变量 / CustomPrefab / 玩家 / 角色变量 | `assets:custom-variables --entity <id>` 或配置 `assets.customVariables` |
| 把图挂到实体/元件，或查挂载关系 | `assets:mounts attach\|list\|detach` |
| 地图还没有目标图，注入找不到图 | `assets:node-graphs create`（空图占位） |
| 屏幕控件/UI 空间 | `assets:ui list\|clone\|create\|update\|template` |
| 信号注册/更新/修复/检查 | `assets:signals inspect\|register\|update\|repair` |

命令细节与 dict 编码见 [references/asset-cli-reference.md](references/asset-cli-reference.md)。

## 通用安全写回流程（所有资源操作共用）

CLI 的 `--write` 不是“自动安全”的免检口。每次都按同一顺序走：

1. **只读盘点并锁定源 SHA**：`sha256sum <map.gil>`，导出当前相关资源（变量 `--list`、挂载 `assets:mounts list`、UI `assets:ui list`、实体 `assets:entities --format json`），确认目标 ID 空闲、类型/容器正确。ID 分配遵守 `static-gil-model-builder` 的 ID 纪律（新元件/实体 ID 必须 ≥1077936129，且 root4/5/6 双查）。
2. **生成候选（优先 `--output`）**：先不直接写源，用 `--output <new-file>` 生成不存在的候选，独立回读候选，确认只出现计划字段。
3. **展示安全门并取得确认**：真实既有地图写回前展示 目标地图/路径、源 SHA、候选 SHA/大小、目标 ID、修改范围、备份位置、回滚方式。用户已明确给出“直接写/用 --write”的指令时，可把该指令作为本轮确认。
4. **`--write` 写回**：CLI 自动在同级 `.gsts/backups/` 建带时间戳备份并校验源 SHA；记录备份路径。
5. **写后独立回读**：用与写前相同的只读命令回读，对比只差目标字段；写后 SHA 不等于写前，且等于写回产物。
6. **通知用户重新加载地图再保存**：旧编辑器内存保存会覆盖磁盘写回结果（写后“变更消失”的已知根因）。先核对 hash 是否等于写回后 hash，相等就请用户重载编辑器，不要重做注入。
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
- **挂载目标用普通场景实体**。⚠️ 关卡实体（1094713345，官方 defId=10003004）由游戏运行时默认创建，**禁止手动 import 添加**——手动加会导致游戏“地图异常”。需要挂载对象时先用 `assets:entities import`/`static-assemblies` 建普通实体。
- 多人语义：挂到玩家/角色实体上的图按玩家分别执行；需要“全局只执行一次”时自行加去重门控，不能默认一次。

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

- 关卡变量：`gsts assets:level-variables create --name <n> --type <t> [--value <v>] [--entity <id>]`（默认关卡实体 1094713345）；`list` / `update` 同理。
- 任意场景实体变量（含新建实体）：`gsts assets:custom-variables --entity <id> --vars "name:type=value;..." --write`，回读用 `--list --format json`。declaration 是 upsert：同名同类型更新，缺失追加，不会动其它变量。
- 元件/玩家/角色初始变量：`gsts.config.ts` 的 `assets.customVariables` 声明，`assets:custom-variables --write`（无 `--entity` 时走配置路径）；`syncInstances: true` 会补齐明确引用模板的实例容器（玩家模板通常需要“顶层定义 + 实例容器同步”两处都写才可见）。
- **推荐串联**：`assets:entities import` 建实体（自动继承元件定义变量容器）→ `assets:custom-variables --entity <id> --vars ...` 写变量 → `--list` 回读。
- dict 语法：`name:dict=k1=abc&k2=[a,b]&k3=[1.5,2.5]&k4=[1,2,3]|4,5,6`；dict 值支持 str/int/float/str_list/int_list/bool_list/float_list/vec3_list。marker 公式与完整表见 reference。**注意**：当前 CLI 的 dict key 只支持字符串（`parseDictValue` 恒为 `keyType:'str'`），int key 无法经 `--vars` 表达——需要 int key 时按未覆盖项说明并跳过，不要硬造。

### C. 屏幕 UI 控件（UI 空间）

屏幕控件在固定屏幕坐标空间，不在 3D 世界；按钮事件先进玩家对应的角色节点图。

- `gsts assets:ui list --gil <map> --format json`（枚举 root9 控件）
- `gsts assets:ui clone <source-id> --id <new-id> [--name <n>] [--donor-gil <file>] --write`
- `gsts assets:ui create --type textbox|interactive-button|custom-button --id <new-id> [--name <n>] [--content <text>] [--position <x,y>] [--size <w,h>] --write`
- `gsts assets:ui create --type image --id <new-id> --asset <素材索引ID> [--layout <布局ID>] [--name <n>] [--position <x,y>] [--size <w,h>] --write`（官方预制图片控件引用素材；`--asset` = 素材库容器 ID，见 `assets:library-inject`）
- `gsts assets:ui update <control-id> [--name|--content|--position|--size] --write`
- 模板：`gsts assets:ui template list|clone`（复用已存在的控件组模板）。
- position 是屏幕中心偏移、size 是宽高（像素语义）。控件只做资产写回；显示/隐藏/禁用运行时行为、按钮事件如何进角色图，属于节点图/运行时逻辑，不要混写进静态资产步骤。
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
    - 写回后仍需编辑器重载/重放确认（旧编辑器内存保存会覆盖磁盘写回）。
    - 写回后仍需编辑器重载/重放确认（旧编辑器内存保存会覆盖磁盘写回）。
- **场景实体直改 tabBar 选项（assets:entities patch --tab-options，2026-08-27 测试台实证）**：
  不经 static-assemblies 时可用 `gsts assets:entities patch <entity-id> --tab-options '标签a,标签b' --write`——
  只写 root5 实体副本（适合同 definition 多实体需不同选项的场景，如从 B 控制器元件新挂的测试台）。
  **已修复嵌套写回 bug**：setTabBarOptions 修改 configField 后漏 `slot.value = emit(slotFields)` → patch
  报成功但选项不变；排查手法 = 直接调 dist 函数 + exportEntities 回读（size 不变即函数 bug）。修复已过
  导出回读验证，**编辑器/游戏核验待做**（2026-08-27 rubik 测试台复测时观察）。

### D. 信号

信号用于节点图之间传一次性事件；直接写 GIL 时“注册信号”与“注入 NodeGraph”是两步，先注册再注入，注入不得破坏已有注册定义。

- 只读：`gsts assets:signals inspect --gil <map>`
- 注册：`gsts assets:signals register --name <n> --param <name:type> [--template-gil <donor>] [--template-signal <name>] [--send-id/--monitor-id/--server-id] --write`（省略 donor 用内置参数布局；重复的非 str 类型需要 donor，fail-closed）
  - **实测（2026-08-23 rubik-3x3）**：**无参信号不带 donor 注册会报 `Cannot read properties of undefined (reading 'type')`**，带 `--template-gil <map> --template-signal <已有信号>` 即可成功（不传 `--param`）。带 int 参信号同样用同 donor + `--param name:int`。新信号必须先 `register` 进真实地图，之后 `gsts dev` 才能编码该信号的 `.gia`（编码期从地图读信号表，缺注册报 `signal is not registered in target map`）。ID 由 `--write` 自动分配（send/monitor/server 连号）。
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

- dict 的 **int key** 无法经 CLI `--vars` 表达；
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
- 静态模型/ID 纪律与写回安全门：`static-gil-model-builder`。
- 游戏内核验最小注入通道：`verify-injection`。
