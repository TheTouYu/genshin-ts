---
name: game-from-scratch
description: 从零开始做一个完整的千星沙箱（原神 Genshin-TS）游戏 demo 的端到端工作流：规划玩法与输入机制、创建地图骨架、元件建模、资产候选与安全写回、视觉核验循环、输入配置、节点图逻辑、编译注入、游戏日志验证与知识沉淀。当用户说"从零/新做/开始一个游戏或玩法 demo"、"把某个玩法做成一个完整示例"、"指导怎么做完整游戏"、或要参照 rubik-2x2 示例复制整条管线时必须使用本技能，即使用户没有明说"技能"。它把专门技能（static-gil-model-builder、genshin-ts-asset-operations、gil-node-graph-editing、verify-injection、debug-log-investigator 等）串成固定阶段，每个阶段有验收标准，防止"建模成功就以为游戏完成"。
---

# 从零开始做一个完整游戏（端到端管线）

把"一个玩法想法"变成"游戏内可玩、可验证、有文档"的完整 demo。以 `examples/rubik-2x2/`（2×2 魔方）为已走通的参考案例。

## 阶段总览

```text
0 规划（玩法→输入→节点图能力映射，写 CONTEXT/ADR，设计意图留档）
→ 1 地图骨架（maps:create + 占位节点图）
→ 2 元件建模（static-gil-model-builder 流程）
→ 3 资产写回 + 视觉核验循环（候选→安全门→写回→用户看）
→ 4 输入机制（选项卡/事件组件，编辑器配置）
→ 5 节点图逻辑（读图/改图技能 + 玩法逻辑架构模式 + 治理/调试）
→ 6 编译注入（verify-injection，注入后先回读核验）
→ 7 游戏日志验证（debug-log-investigator，与游戏核验同闭环）
→ 8 知识沉淀与收尾（PROGRESS、Authority、PKC、提交）
→ 9 子代理分包（大任务可选：独立工作包 + 复盘两类优化）
```

阶段 2/3 会循环多次（用户视觉反馈），每轮独立证据目录。阶段 4-7 相互依赖（输入事件→节点图→注入→日志），常需一起迭代。阶段 3 的变量、节点图挂载、屏幕 UI、信号等资源操作统一走 `genshin-ts-asset-operations`；静态视觉模型仍走 `static-gil-model-builder`。

## 0. 规划与域建模

- 先回答三个问题：玩法是什么 / 输入用什么机制（选项卡、按钮、碰撞…）/ 节点图有哪些现成能力（查 miliastra-knowledge + docs-search，官方无"设置 Transform"节点、有"恒定旋转运动器"等，直接改运行时 Transform 不被官方支持）。
- 输出：仓库根 `CONTEXT.md` 术语定义 + `docs/adr/` 关键决策（如"方块为独立实体""旋转语义用标准 ±90°"）。
- **设计意图必须留档**：模型自由发挥的设计（如控制器造型）也要写进 ADR/案例文档，防止后续"设计丢了"靠翻历史找回（rubik 控制器 v8 造型丢过一次，用户要求查历史恢复）。
- 案例：rubik-2x2 输入=实体选项卡（选中事件直达实体挂载的节点图）、旋转=服务端"恒定旋转"运动器。

## 1. 地图骨架

```bash
node ./bin/gsts.mjs maps:create --name "<游戏名>" --player 110170759 --region china
```

- 记录新地图 ID、初始 SHA-256、名称；**必须确认 `temp=` 输出（Temp 双写 + gip 注册，编辑器可见）**。
  当前 CLI 的 maps:create **不会自动 resync**（旧命令的 `--player/--region` 已移除）——若创建输出无 `temp=`，
  编辑器列表看不到该图，需补：`node ./bin/gsts.mjs maps:resync --map-id <新图id>`（2026-08-19 实证）。
- ⚠️ **maps:create 只建空地图骨架，本身没有可注入的节点图**——必须额外创建占位节点图
  （2026-08-19 capture-set 复现实证：直接注入报 `target NodeGraph not found`）：
  `node ./bin/gsts.mjs assets:node-graphs create --gil <地图.gil> --name "<图名>" --write`
  （图 id 自动分配 1073741825 起；--write 前自动备份；`--graphs` 只命名不落可注入图记录）
- 验收：新地图 inspect 显示 0 definition/instance/entity，且骨架预置 root 4/8/27 段（旧骨架会报 `unsupported GIL layout`）。

### ⚠️ 新地图首次保存门槛（2026-08-21 完整演练实证 + 自动补全修复）

**新地图创建后（未经用户首次保存）缺少 root 7 地形等引擎骨架字段**——`maps:create` 只写
root 1/2/4/5/6/8/10/22/27/34/39/40/41 等基础段，**没有 root 7（地形）/root 3/9/11-49**。
引擎在用户编辑器**第一次手动保存**时才补全骨架（地形 400 块、布局注册、角色/玩家信息等；
文件 size 从 ~166B 暴涨到 ~21KB，1073741902/1903 实证）。

**✅ 已修复：`gsts maps:init --map-id <id> --write` 自动补全**（2026-08-21）：
从 `resources/first-save-template.gil`（用户首次保存后的干净图）复制 root 3-49 骨架
（保留新地图的 mapId/名称/占位图/创建标记 root 1/2/10/34/39/40/41），免去人工首次保存。
实测 init 图与用户真实保存仅差地图特有值（mapId/名称/节点图/时间戳），36 个骨架 root
逐字节一致；init 后可直接写元件+实体+扩草地（1073741906 全流程验证）。

- ✅ **写元件（prefab/definition）可以直接写**：root 4/8/27 段 maps:create 已预置，无需首次保存。
- ✅ **写场景实体 + 扩草地**：先跑 `maps:init` 补全骨架即可，无需用户手动保存。
- ⛔ **旧流程（无 maps:init 时）**：写实体前必须先让用户首次保存；未保存就写元件可能
  导致引擎识别错乱（1073741904 实证：节点图面板出现异常实体）。
- 判定方法：`maps:create` 后检查 GIL root 集合是否含 7（python `walk` payload 收集 field number），
  或直接跑 `assets:terrain list` 看是否报错。

### 地形/草地 API（2026-08-21 用户教学闭合，可复刻）

游戏默认地形：**20×20 格 = 100×100m**（中心原点，格坐标 row/col 100..119），一格 **5×2.61×5 米**
（x/z 5m，草皮厚 2.61m：上层草 + 下层石头，顶面 y=0，石头向下不可见）。

- 编码：root 7 → f1 → **f4 地块网格**，每条 7B `08 <(row<<16)|col varint> 10 01`（f2=1 存在标记），
  column-major 顺序，新增追加末尾、删除移除记录。
- 换算：世界 x = (col−100)×5 − 47.5，世界 z = (row−100)×5 − 47.5，y = −1.305（顶面贴 y=0）。
- CLI：`gsts assets:terrain list --map-id <id>` / `set-range --col-min <c> --col-max <c> --row-min <r> --row-max <r> --map-id <id> --write`（hash-gated + 自动备份）。
- 详细规则与验证样本：`docs/game-engine-knowledge/terrain-grass.md`。

## 2. 元件建模

路由：加载 `static-gil-model-builder`，读 `calibration-and-geometry.md` 已闭合资源表 + `production-workflow.md`。
**元件要配组件（运动/选项卡/铭牌/光源等）时，先读本阶段「组件配置（components）」节**——它指向 `genshin-ts-asset-operations` 技能 + `docs/game-engine-knowledge/components.md` 权威文档，给出组件配置三入口，防止"组件丢失/运动器不生效"掉坑。

**已闭合基础资源速查**（2026-08-12 验证）：

| resID | 规则 |
|---|---|
| 10009001 长方体 | scale=1 = 1×1×1（边长 1 米）；scale 就是边长；面片外贴 = ±0.5×scale + 半厚 + 间隙 0.005~0.01 |
| 10009003 平面 | 零旋转平躺、法线 +Y、XZ 平面 1×1（外接圆直径 1）、绕 Y 水平旋转；**scale 厚度不生效，要厚度用长方体** |
| 10005018 空模型 | 隐藏 1×1×1 正方体体积（坐标在中心点）；与同尺寸装饰物重叠会闪烁；宿主 scale 连带装饰物缩放（缩宿主需反比放大装饰物）；**可用场景：缩成极小点（如 scale 0.01）当旋转中心/挂载点——越小越像"点"，坐标 ≈ 偏移值本身，无需为装饰物自身尺寸重算中心** |
| 10009004/5 棱柱 | 高度轴 Y、底面外接圆直径 1、顶点朝 -Z |
| 10009008 圆柱 | 零旋转轴向 Y |

**建模要点**（rubik-2x2 实战结论）：
- 元件模板**直接用基础元件当可见主体**（如长方体设灰黑颜色），避免"空模型 + 同尺寸装饰物"（隐藏 1×1×1 体积与装饰物重叠会闪烁）。**空模型不是禁用**：按场景选——若需要"点"（如旋转中心/挂载点），把空模型缩成 0.01 极小点（2026-08-20 用户经验：越小越精确，坐标 ≈ 偏移值本身；0.1 仍偏大），挂载的装饰物缩放需额外 ×100（宿主缩放会连带装饰物）；同尺寸重叠才闪烁，错开尺寸即可。
- 薄片/贴片**用长方体**（scale=[边长, 厚度, 边长]）才有真厚度；平面缩放厚度不生效。
- 薄片外贴 = 表面(±0.5×scale) + 半厚 + 间隙 0.005~0.01，旋转按法线推导（平面法线 +Y → 目标方向，YXZ 内旋）。
- 元件 def/inst/entity ID ≥ 1077936129（0x40400000 区间，否则游戏加载时整体丢弃）；aux ID 可用 0x4000xxxx。
- **命名规范**：节点图要引用元件名，必须一眼可识别。魔方块用 WCA 角块名（角块_UBL/UBR/UFL/UFR/DBL/DBR/DFL/DFR）；未来 3×3 延续 WCA。
- 块间留缝：元件 scale 0.965（缝 0.035）等，薄片随比例自动保持贴面。
- 白色贴片用明显更暗的浅灰白（0xD0D0D0；纯白/近白 0xE8E8E8 均刺眼，透明度方案效果弱）；
- 场景实体**不预置**：游戏开始时由节点图动态创建（方便整体移位，改一个基准位置即可）。

**验证铁律（2026-08-20 复刻实验实证）**：建模/写回结果的验证**只认 CLI 回读**（`inspect` 身份/闭包 + `export` 两层 Transform/颜色/顺序）。**禁止手工解 wire 字节**（`gil_wire_lib.walk` 槽探针）来验证生产路径输出——那是"未知编码规则"增量调查工具（需用户编辑器样本），不是日常验证手段。export 字段困惑先查 `static-gil-model-builder` 的「export 回读字段语义」（`transform: None` 不是错误），不要读 `src/cli/*.ts` 源码推断 CLI 行为；跑 `bin/gsts.mjs` 前确认 `dist/src/cli/gsts.js` 存在（缺失 = `npm run build`）。

**多件套成品布局（2026-08-20 用户核验不通过后强制）**：建模默认假定质量不高、要交给用户核验。多元件模型（如魔方 8 角块）**必须在元件页面按成品布局摆放**（assembly 级 position = 中心 ± 半块宽三向偏移，摆成真正的立方体），**禁止全部堆在原点**。页面布局是用户核验的第一对象，也是节点图动态创建实体的坐标来源——页面摆错，玩法逻辑坐标必错。

**场景落地（2026-08-20 用户核验实证）**：地面平面从 **y=0** 开始——模型中心 y 必须 ≥ 半高 + 裕量，**禁止陷入地面**（否则用户只看到一半）。如 2×2 魔方（半高 ≈0.965）中心 y 至少取 0.6~1.0，不要用 0。装饰物（锚点/挂载点）默认缩到 0.01 级，坐标 ≈ 偏移值本身，拼装最好控制。

### 元件三概念与静态/动态（2026-08-20 用户澄清，可复刻）

| 概念 | wire | 语义 |
|---|---|---|
| **定义** | root4 | 元件本体；修改定义 = 修改元件 |
| **元件页面模型** | root8 | 可视化编辑辅助，**不渲染到场景**；删了定义仍在 |
| **场景实体** | root5 | 引用定义（官方 resID 或本地 defID）；只要定义存在即可创建 |

- UI"静态元件"分类 ≠ wire 无组件：**纯静态类型**（装饰物类，如木质花圃）保留组件槽；
  **切换静态**（动态→静态转换）才删组件槽（定义 f8/实例 f7/实体 f7）+ 名字槽 f11 加 `{f2:1}`。
- CLI 创建速查（都需 `--gil`，候选 `--output` / 写回 `--write`）：
```bash
gsts assets:prefabs create --base <官方ID> --id <newId>            # 动态定义（root4 + root6 type6）
gsts assets:prefabs create --static --base <官方ID> --id <newId>   # 静态页面模型（root8 + type400）
gsts assets:prefabs convert --id <prefabId> --static|--dynamic     # 切换（定义/模型/实体联动）
gsts assets:aux attach --host <实体|定义|模型ID> --resource <装饰物ID> # 挂装饰物
gsts assets:resources list --gil <map>                             # 列出（static=true 标记）
```
- **装饰物**（root27 aux）：定义挂 def aux、模型/实体挂 inst aux（f12 回链 def）；
  aux f4 槽40.f50.**f502 = 宿主 ID**（模板复用必须替换，否则游戏不显示）。
- **ID 纪律**：元件/实体 ID ≥ 1077936129；定义 ID 分配只查 root4 空间，可与 root5/8 重叠；
  写回后必须 `maps:resync` 同步 Temp（编辑器活动副本），否则游戏加载旧版本。

### 组件配置（components）——先查权威文档再动手（2026-08-22 足球 basicMotion 丢失实证）

元件/实体要获得能力（运动、选项卡、铭牌、光源…）必须**显式配置组件**，组件**不会自动补全**。
**动手前先加载 `genshin-ts-asset-operations` 技能 + 读 `docs/game-engine-knowledge/components.md`**
（组件类型映射表 + 配置字段号规律 + 各组件默认槽字节），不要凭记忆猜组件名/类型码/槽位置。

组件配置**三个等价入口**（`components` 字段，支持 followMotion 9 / basicMotion 4 / tabBar 17 / nameplate 27 / textBubble 28 / lightSource 38）：
1. `staticAssemblies[].components`（新建元件，config 内联）；
2. **`structureFile` 的 `components` 字段**（新建元件，structure JSON 顶层与 `items` 平级）——`structureFile` 与 config 内联 `components` 互斥，用 structureFile 拼装饰物时组件必须写进 structure JSON；
3. `staticPrefabUpdates[].components`（更新既有元件，三层联动写 root4 定义 f8 + root8 实例 f7 + root5 实体 f7）。

**关键坑（足球实证）**：重建元件时 structure JSON 漏配 `components` → 新元件定义层无组件 → 实体 import 继承时组件丢失（球实体 components 变空、运动器失效）。**重建元件前对照旧元件组件清单逐项写进新 structure JSON**。排查"实体组件丢失/运动器不生效"先查 structure JSON 的 components 字段，**不要写一次性脚本改实体字节**（绕过 CLI 的应急做法不可复用）。

## 3. 资产写回 + 视觉核验循环

```text
生成器/配置 → plan（status=ready，源 SHA 锁定）→ 候选 → 回读（export 逐 item 核对颜色/Transform/ID）
→ 展示安全门（目标/源 SHA/候选 SHA/新对象/触及 root/备份回滚）→ hash-gated 写回 → 写后回读 → 用户游戏核验
```

- 写回命令（固定候选原子入口）：
```bash
node ./bin/gsts.mjs assets:entities apply-candidate \
  --map-id <mapId> --candidate <candidate.gil> --expect-source-hash <sourceSha256>
```
- 自动备份在 `.gsts/backups/<mapId>.gil.<ts>.bak`；回滚 = 恢复备份 + `maps:resync`。
- **视觉迭代循环**：用户反馈 → 恢复上一次写回的备份（回到干净源）→ 改生成器 → 新证据目录 vN（不覆盖旧候选）→ 重走候选/回读/写回。证据目录：`~/genshin-ts-evidence/static-assembly/<game>-vN/`。
- 每次写回前确认游戏已关闭或编辑器未打开该地图（编辑器旧内存保存会覆盖磁盘写回）。
- 写回成功 ≠ 视觉通过：必须用户核验后才算建模阶段完成。

### ⚠️ 安全注入纪律（2026-08-21 用户变更丢失事故实证，强制）

**`apply-candidate` 是整图替换**——候选基于某个源 .gil 生成，写回后整个文件被候选覆盖。
**必须永远以用户当前最新保存版为源**，绝不能用旧备份/空骨架当源重新生成覆盖：

- ❌ **禁止**：`恢复备份（回到旧 SHA）→ 重新生成候选 → apply-candidate` 修已有资产。
  这会丢掉用户在编辑器里保存的一切（负载大小、草地扩大、布局、引擎注册）——1073741901
  上用户负载/草地修改丢失的直接根因。
- ✅ **正确**：以用户当前最新 `.gil` 为源（写回前实时 `sha256sum` 锁定），增量添加
  （新 prefabId + 新 aux 区间），不触碰已有记录。
- ✅ 修改已有闭包：不能用 static-assemblies 更新（id-conflict），需记录级 patch
  （只改目标字段）或导出当前闭包重建。
- 判别：写回前后 `rootPresenceStable: True` 且 root 差异仅新增（+def/+inst/+aux），
  无既有记录消失/替换。
- 附带发现（2026-08-21 差分验证）：`assets:entities import` 曾漏写 root 22
  `PropertyTransform` 注册（编辑器手加实体自动写），已修复——带非默认 Transform 的实体
  导入必须补 root 22 `f1="PropertyTransform"+f2.bytes=01`（地图级开关，不按实体数增长）。

## 4. 输入机制

- 首选"实体选项卡"（entity option tabs）：官方知识确认选项卡选中事件直达挂载该实体节点图。
- **组件前置依赖**（强 gate，缺则下游全废）：选选项卡做输入，事件源实体必须已配置 **tabBar 组件**——三件套
  1. **tabBar 组件已写回**：CLI `gsts assets:static-assemblies tab-options <instance-id> --name <预期组件名> --options <a,b,c> --region-type sphere --region-radius <R> --region-center <x,y,z> --write`（球体触发）；region 是**生效范围**，不配玩家根本看不到选项。**组件配置通用入口见阶段 2「组件配置（components）」**（structure 文件 components 字段 / staticAssemblies / staticPrefabUpdates 三入口）。
  2. **节点图已挂载到该实体**：`gsts assets:mounts attach <entity-id> --graph <graph-id> --entity --write`，没挂载事件没有 graph 接收方。
  3. **DSL `whenTabIsSelected` 已写**：`f.multipleBranches(tabId, {1:…, 2:…, …})`，tabId=1..N 对应 options 顺序。
  - 缺任何一件 → 选项不显示或点不动；用户测试**必失败**。
  - 写回路径：CLI → 编辑器重载/重放确认（场景实体 root5 组件槽可能是独立副本）。
  - 编码细节：`docs/game-engine-knowledge/components.md` + 实战参考 `examples/rubik-2x2` 的控制器（sphere r=3 center [0.1,0,0]，6~10 个 options）。
- 编辑器配置最小样本后，用相邻快照调查闭合 GIL 编码（editor-incremental-gia-investigator 流程），再做批量配置。
- **编辑器保存行为**：地图刚创建后，用户在编辑器**第一次手动保存**时，游戏引擎会自动补全地图**骨架定义**（默认实体 11 个、布局规范化等，与信号无关）；保存后必须重新比对/回读，不能假设磁盘与编辑器内存一致。
- **完成判断**：仅 `assets:mounts list` 显示挂上 ≠ 通过，必须进游戏目视「选项卡浮现 + 选中能触发」才算通过（2026-08-22 足球阶段 0 实证：仅挂图未配 tabBar，玩家点不动）。
- rubik-2x2：魔方实体上 6 个选项卡 R/L/U/D/F/B（tabId 1~6，2026-08-13 已闭合）。

## 5. 节点图逻辑

- 读图：`gil-node-graph-reading`（从关卡全景到单节点数据源的追踪 + explain 词汇表）。
- 改图：`gil-node-graph-editing`（快照备份→候选→回读→写回，fail closed 不猜字节）。
- 事件挂载：`docs/game-engine-knowledge/graph-mounting.md`（实体挂载节点图、事件→节点入口）。
- **引擎规则速查（先查再问）**：`references/engine-rules.md`——坐标系（Y 垂直上、XZ 地面）、运动器 6 类全表与选择准则（无椭圆类，轨迹用分段直线）、关键事件 payload（含 whenEntityIsCreated / whenBasicMotionDeviceStops / whenTimerIsTriggered）、关卡实体（g.stage）、动态创建（createPrefab 无 GUID）、定时器同步推进、输入锁模式。设计/实现前先翻它，避免向用户重复问已沉淀的规则。
- **组件前置依赖**：运动类节点（如旋转运动器）要求目标实体带**基础运动器组件（basicMotion）**，否则节点执行时报错（P4 最小实验真实踩坑：用户手动补组件后日志恢复正常；基础元件模板自带 preset=default）。**basicMotion 组件配置入口见阶段 2「组件配置（components）」**——重建元件时 structure JSON 漏配 components 会导致实体继承时组件丢失（足球实证）。

### 节点编写与优化的可复刻总览（2026-08-20 魔方性能战役，细节见 dsl-nodegraph-development）

节点图逻辑和资产一样是可复刻能力，主线五块：

1. **节点预算（先算后写）**：单图上限 **3000**（所有复合 impl 递归展开之和，实测 4043 拒载）；
   预算检查 `gsts assets:node-graphs nodes --gil <map.gil>`（implTotal < 3000 为硬门槛，
   direct 物理节点数作优化指标）。超限拆多图用信号/变量变更事件跨图触发。
2. **膨胀模式（性能杀手）**：helper 函数被 N 分支调用 = N 份展开；**变量代替条件展开**
   （定时器用 `evt.timerSequenceId` 当索引单次调用，8 分支→1 调用，1846→753 节点）；
   循环体只物化 1 次；**常量表直接字面量/槽位**（不要变量读，魔方 implTotal 3138→2909）；
   顺带移除诊断 print/事件监听。
3. **复合编写硬规则**：exec 入口链首必须普通节点（复合调用只作链中/链尾，显式 link 会 duplicate
   physical route 编译失败）；声明 outflows 的 exec 复合必须显式 f.outflow；start_timer 延迟
   列表不用 0.0；finiteLoop 完成流不会自动续到循环后节点（后续放循环体最后迭代或 JS 展开）。
4. **复合生命周期**：改名/改内部实现安全（ID 按定义顺序稳定）；**删除定义危险**（ID 前移 →
   残留引用类型错位 → 游戏拒载）——不要的复合改名保留；改复合集合形状后必须
   `tools/check-gil-composite-refs.ts` 全量校验。
5. **性能优化范式（rubik 实证）**：定时器序列化（8 块 0.05~0.4s → 4 槽位 0.05~0.20s）、
   命中块预知（逻辑层表数据直接定块，不再逐位置判断）、合并布尔图变量（is_solved）、
   移除诊断 print/监听。优化后必查 `implTotal` 与 `direct` 两个口径。

> 编写 DSL 细节（受限子集/值类型/capture 限制/常见错误）→ `dsl-nodegraph-development`；
> 日志逐帧性能分析 → `debug-log-investigator` 的 perf 子命令。

### 编写后二次核验（2026-08-20 用户要求，防 API 写法/编译器 bug）

**写完 DSL → 编译注入后，先用读图技能核验生成的图，再交用户游戏测试**（核验细节与工具清单见
`gil-node-graph-reading` Step 3.6）。顺序：decode-gia 解码核预期（复合 def/节点数）→ 注入 →
list-gil-node-graphs 全景（图名 _GSTS_/节点数）→ explain 人读式逐条核对写的逻辑 →
定点检查（`nodes` 预算 / `scan-gil-signals` pin / `scan-gil-var-pins` / `check-gil-composite-refs` /
layout lint）。典型问题：API 写法（连线/参数/引脚错、duplicate physical route）与编译器 bug
（节点爆炸、漏节点、capture 异常、丢边）——核验通过才进游戏，发现问题直接修不猜测。

### 复合节点编写（2026-08-14 方法论沉淀——重要技能）

- **原则：能做成复合节点的，一定往这个方向靠**——即使未被别处使用也不亏（布局清晰），
  别处复用更赚，跨项目复用是巨大资产。
- 两种价值：**复用型**（多处调用）+ **封装型**（单次调用但"一件事"范围清晰，如自旋/层筛选）。
- 能力边界与编写步骤见 `references/composite-authoring.md`；通用型复合（比较/数学扩展）是跨项目资产。
- **使用层总纲见 `docs/game-engine-knowledge/composite-usage-guide.md`**（何时复合化 5-7 节点标准、
  四种形态分类、接口设计、调用流/事件流/混合三模式参考实现、已知边界、验证流程、设计检查清单）。
### 玩法逻辑架构模式（用户 2026-08-10/12 亲手教学，rubik 旋转）

旋转类玩法拆成**两大块独立实现**：
1. **内部状态变化**：独立复合节点，施加旋转后更新逻辑状态（图变量：位置/旋转/累计值）；
2. **旋转效果表现**：已知旋转方向 → 确定该层 4 块 → 每块施加"自旋 + 分段公转"两个运动器（ADR-0003，2026-08-13 替代旧"绑定枢轴跟随"方案）：
   - 自旋 = 匀速旋转运动器（90°/1s；axis 为**相对朝向（局部轴）**——绕世界层轴须传 localAxis = R^T·worldAxis，见 engine-rules.md）；
   - 公转 = **N 段匀速直线折线逼近 90° 圆弧**（官方无椭圆/圆弧运动器；速度向量 = 段弦向量 ÷ 段时长，不依赖当前位置）；
   - 段推进用**定时器序列同步**（startTimer + whenTimerIsTriggered，timerSequenceId=段号），不要用停止事件驱动多实体（停止事件交错会弄乱共享段号变量）；
   - **输入锁**：bool 图变量，旋转期间忽略新输入，完成解锁。

硬约束（踩坑换来的）：
- 旋转时用的 direction 变量与结束计算方向必须是**同一个变量**；变量名定义/设置/使用三处一致。
- 单图节点上限约 **2000**（4000 实测跑不了）：超限拆多个节点图，用信号/自定义变量变更事件跨图触发；拆复合节点不解决负载（复合 impl 计入宿主图）。
- 新节点编码以 CLI 权威 `node_pin_records.ts` 为准（第三方元数据只作补充）；新节点先"实验图最小注入 → 游戏加载确认保留且执行"再写生产。**"引擎不认"不是无害**：可能整图解析失败/面板渲染失败/重存时被游戏删除。
- 每轮只改一个可唯一归因的变量；生产版 = 验证通过才算。

### 节点图治理要求（用户 2026-08-12 严格三要求）

- 结构要合理复用（同逻辑抽复合/共用子图，不复制粘贴）。
- 布局合理：变量可多处引用，但消费节点离变量定义处不能太远，否则跨线交叉混乱（自动布局算法本身没问题）。
- 避免细节问题：严禁"设置节点变量为空"（变量名不填/值不填）。

### 调试与验证工作流（2026-08-13/14 魔方 P4 实证）

1. **编译 + IR 断言**：编译后检查节点统计（总数 < 2000、关键节点族）；用 dump_gil_index.ts 回读注入后真实图结构。
2. **日志驱动调试**：用户反馈 → 最新 Beyond_Debug_Log（退出游戏落盘）→ gia_log.py records/frames --gil 逐帧核对
   （位置读取、字典查询、运动器参数——帧值是铁证，不猜）→ 根因 → 修复 → 注入 → 复验。
3. **每层证据独立**：编译成功 ≠ 注入成功 ≠ 游戏行为正确（v5.1 注入成功但字典空 → 实体不动）。
4. **引擎语义用矩阵反推**：rotation 欧拉（YXZ 内旋）→ 矩阵 → 对比候选语义（轴局部/世界）。
5. **修复链留痕**：每版缺陷/证据/日志文件记录（PROGRESS + motion-devices.md 验证记录节）。
6. 编辑器兼容性：某些结构"能执行但日志出问题"；逐节点添加/删除再添加回来，游戏可能自动修复（重存会规范化/删除引擎不认的节点）。

> 新技能：DSL 生产路径方法论（受限子集/节点预算/踩坑）用 dsl-nodegraph-development；
> 日志逐帧分析用 debug-log-investigator。

## 6. 编译注入

- 加载 `verify-injection`：专用验证地图 + `verify/<分支>/<分支>.ts` + `gsts.verify.config.ts` 编译注入。
- config 平时不配 inject（否则编译报 `target gil not found`），注入前临时加。
- 每分支一个验证点，编码成功/自动测试/注入/游戏内验证分层报告。
- **挂载图到实体**（事件触发前提，P4 用）：`gsts assets:mounts attach <实体ID> --graph <图ID> --gil <地图.gil> --write`；挂载后 whenTabIsSelected 等事件才会在实体上触发。
- **注入后先回读核验再进游戏**（用户 2026-08-13 要求）：直接写代码生成的节点图可能有 bug，先读真实 GIL 确认节点/连线/参数与意图一致，再让用户去游戏。

### 端到端注入顺序纪律（2026-08-16 灯阵回归实证——按此顺序一次性跑对）

```text
1 信号注册（assets:signals register 每条 --write；全部注册完后用 inspect 核验版本一致性）
2 玩法图注入（node-graphs create 占位图 → injectGilFile / gsts 单文件注入 → 回读节点数）
3 实体 import（assets:entities import --write；先确认 root4 定义已就位）
4 挂载（assets:mounts attach <实体> --graph <图> --write）
5 提醒用户重新加载编辑器 → 保存 → 游戏测试
```

关键规则（每条都是真实踩坑换来的）：
- **顺序不可颠倒**：实体 import 会重写 root 5/6，晚于它执行的挂载才保留；先 attach 再 import
  会导致挂载丢失。信号注册、图注入、实体 import、挂载互相独立但共用 root 10/5/8/6，
  后写者覆盖先写者的风险按上述顺序规避。
- **实体 import 前置条件——root4 元件定义必须在目标地图**：import 的 definitionId 若不在目标
  root4，CLI 会误判为"官方 res 直引"（relation 带 f2:1）→ 编辑器加载时实体被丢弃（场景实体空）。
  先 `assets:entities import` 前用 `assets:static-assemblies`/donor 把定义补齐，或确认
  `--definitions-gil` 已提供。有效自定义定义实体 relation = `{定义ID}` 无 f2:1。
- **信号注册后必须核验版本一致性**：inspect 输出每信号的 v= 与 defs=[..] 应一致且
  ≥ 阈值（N 个被引用信号 → ≥ max(3, ceil(3N/4))）；CLI register 已全表回填只升不降。
- **每次写回（register/inject/import/attach）后，用户必须先重新加载编辑器再保存**：
  编辑器旧内存保存会覆盖磁盘写回（v19 教训复发：灯柱实体两次"消失"、信号 v4 出错版均因此）。
  排查"变更消失"先核对当前 hash 是否等于写回后 hash。
- **游戏拒载类错误无日志**：进不去地图时 Beyond_Debug_Log 不产生新文件（加载期错误不落
  执行日志）。"进不去 + 无新日志"走三版本差分（我们版/自动保存版/用户修复版逐字段对比），
  不要等日志。

### 信号参数默认值规则（第 4 次信号错误根因，2026-08-16 已修）

- 发送信号（send_signal）节点的**已连接 InParam 不得携带默认值**——vendor Pin.encode 对
  value=null 的 Vector 会补空 VectorBase，引擎信号参数校验拒绝 → 游戏报"参数错误"拒载。
  编译链 post-encode 已统一清除（占位 300000/300001），写新玩法代码无需额外处理；
  若手工构造 GIA 需遵守：已连接参数 value 必须为 null，字面量参数（如 hop=1）可带值。
- 完整规则与三版本差分证据见 `docs/game-engine-knowledge/signals.md`「信号节点参数默认值」。

### 编译产物验证与真实地图注入（2026-08-20 魔方性能优化实证）

- **编译产物 `.gia` 验证用项目根 `tools/decode-gia.ts`**（配 jq 查 accessories 复合名/compositePins/主图节点）；
  `dump_gil_index` / `explain-gil-node-graph` / `parse-gil-node-graph` 只吃 .gil 地图，对 .gia 报"未找到节点图"。
- **注入前先备份**：`cp <地图.gil> .gsts/backups/<名>.bak` 并 sha256sum 记录；注入后 sha 变化与候选一致才算成功。
- **注入环境坑**：注入器备份目录 `~/.genshin-ts/backups` 只读 → 注入命令加 `APPDATA=<项目可写目录>`
  （如 `.gsts/appdata`）重定向；`/mnt/c` 只读挂载时注入命令需宽权限。
- **注入后两件事**：① 读图自检（`explain-gil-node-graph --composite` 验证被调复合 inflows 非空/执行流条数、
  `scan-gil-var-pins` 0 违规）② **Temp 同步**：编辑器活动目录 `.../Temp/` 的同一 .gil 需手动复制，
  否则编辑器显示旧图（2026-08-20 实证：注入命令不自动同步 Temp）。

## 7. 游戏日志验证

- 加载 `debug-log-investigator`：Beyond_Debug_Log 逐节点执行记录（执行顺序、输入输出、变量、控制流分支）。具体命令/脚本/格式踩坑全部在该技能内（如 `gia_log.py latest` 定位最新日志、脚本在技能目录 `scripts/`），这里不重复。
- 改图 → 编译 → 注入 → 用户运行 → 落盘日志 → 解析比对，还原节点执行过程破译引擎规则。
- **节奏**：用户每次去游戏真实玩一次就会产生新日志（“我每次玩一下就有新日志”）；游戏核验与日志解析是同一闭环的两面，缺一不可。
- 游戏内日志面板缺失 ≠ 没有执行记录：`.gia` 文件里可能完整（FaceTurnU 面板缺失但 .gia 有 44~48 帧记录）；先查 .gia 再怀疑图本身。

## 8. 知识沉淀与收尾

- 每轮更新 `examples/<game>/PROGRESS.md`（状态表：规划/建模/输入/逻辑/验证 + 变更记录 + 待闭合规则清单）。
- 新闭合规则同步两份文档：`static-gil-model-builder` 技能参考（建模技能）+ `docs/game-engine-knowledge/`（知识引擎权威）；局部经验只进案例文档。
- 工作流/结论变化时按 PKC 流程录入（`python tools/pkc.py`，pending→Authority 已提交基线后 approved）。
- **git 提交纪律**：未经用户明确指示不提交；用户指示"提交"时按主题分批（如：①工作区其他未提交文件 ②游戏项目相关文件含新技能），每批一个 commit，提交前 `git diff --check`。
- 每轮结束做规则反馈检查：本轮的源码/测试/真实 GIA/用户反馈是否与 AGENTS.md 冲突。

## 9. 子代理分包（大任务可选）

- 任务拆成独立工作包（如 W1 只读验证 / W2 小手术 / W3 核心重建），每包独立验收；用 `isolated-model-evaluator` 派子代理执行，主代理校验后写回真实地图。
- 子代理完成后复盘（`task-trace-review`），产出两类优化：通用类（任务分配/信息提供方式）+ 项目类（本项目踩的坑）。

## 状态分层（禁止混称"完成"）

```text
计划就绪 → 候选就绪 → 写回成功 → 用户视觉核验通过 → 游戏行为验证通过
```

## 案例速查

详细案例（地图 ID、元件清单、已闭合规则出处、视觉迭代历史）见 `references/rubik-2x2-case.md`；引擎通用规则（坐标系/运动器/事件/关卡实体/定时器）见 `references/engine-rules.md`。