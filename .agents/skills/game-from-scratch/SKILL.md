---
name: game-from-scratch
description: 从零开始做一个完整的千星沙箱（原神 Genshin-TS）游戏 demo 的端到端工作流：规划玩法与输入机制、创建地图骨架、元件建模、资产候选与安全写回、视觉核验循环、输入配置、节点图逻辑、编译注入、游戏日志验证与知识沉淀。当用户说"从零/新做/开始一个游戏或玩法 demo"、"把某个玩法做成一个完整示例"、"指导怎么做完整游戏"、或要参照 rubik-2x2 示例复制整条管线时必须使用本技能，即使用户没有明说"技能"。它把专门技能（static-gil-model-builder、gil-node-graph-editing、verify-injection、debug-log-investigator 等）串成固定阶段，每个阶段有验收标准，防止"建模成功就以为游戏完成"。
---

# 从零开始做一个完整游戏（端到端管线）

把"一个玩法想法"变成"游戏内可玩、可验证、有文档"的完整 demo。以 `examples/rubik-2x2/`（2×2 魔方）为已走通的参考案例。

## 阶段总览

```text
0 规划（玩法→输入→节点图能力映射，写 CONTEXT/ADR）
→ 1 地图骨架（maps:create + 占位节点图）
→ 2 元件建模（static-gil-model-builder 流程）
→ 3 资产写回 + 视觉核验循环（候选→安全门→写回→用户看）
→ 4 输入机制（选项卡/事件组件，编辑器配置）
→ 5 节点图逻辑（读图/改图技能）
→ 6 编译注入（verify-injection）
→ 7 游戏日志验证（debug-log-investigator）
→ 8 知识沉淀与收尾（PROGRESS、Authority、PKC、提交）
```

阶段 2/3 会循环多次（用户视觉反馈），每轮独立证据目录。阶段 4-7 相互依赖（输入事件→节点图→注入→日志），常需一起迭代。

## 0. 规划与域建模

- 先回答三个问题：玩法是什么 / 输入用什么机制（选项卡、按钮、碰撞…）/ 节点图有哪些现成能力（查 miliastra-knowledge + docs-search，官方无"设置 Transform"节点、有"恒定旋转运动器"等，直接改运行时 Transform 不被官方支持）。
- 输出：仓库根 `CONTEXT.md` 术语定义 + `docs/adr/` 关键决策（如"方块为独立实体""旋转语义用标准 ±90°"）。
- 案例：rubik-2x2 输入=实体选项卡（选中事件直达实体挂载的节点图）、旋转=服务端"恒定旋转"运动器。

## 1. 地图骨架

```bash
node ./bin/gsts.mjs maps:create --name "<游戏名>" --player 110170759 --region china
```

- 记录新地图 ID、初始 SHA-256、名称；确认 `temp=` 输出（Temp 双写 + gip 注册成功，编辑器可见）。
- 同时创建占位节点图 ID（如 1073741825，命名"<游戏名>玩法"）。
- 验收：新地图 inspect 显示 0 definition/instance/entity，且骨架预置 root 4/8/27 段（旧骨架会报 `unsupported GIL layout`）。

## 2. 元件建模

路由：加载 `static-gil-model-builder`，读 `calibration-and-geometry.md` 已闭合资源表 + `production-workflow.md`。

**已闭合基础资源速查**（2026-08-12 验证）：

| resID | 规则 |
|---|---|
| 10009001 长方体 | scale=1 = 1×1×1（边长 1 米）；scale 就是边长；面片外贴 = ±0.5×scale + 半厚 + 间隙 0.005~0.01 |
| 10009003 平面 | 零旋转平躺、法线 +Y、XZ 平面 1×1（外接圆直径 1）、绕 Y 水平旋转；**scale 厚度不生效，要厚度用长方体** |
| 10005018 空模型 | 隐藏 1×1×1 正方体体积（坐标在中心点）；与同尺寸装饰物重叠会闪烁；宿主 scale 连带装饰物缩放 |
| 10009004/5 棱柱 | 高度轴 Y、底面外接圆直径 1、顶点朝 -Z |
| 10009008 圆柱 | 零旋转轴向 Y |

**建模要点**（rubik-2x2 实战结论）：
- 元件模板**直接用基础元件当可见主体**（如长方体设灰黑颜色），不用"空模型 + 同尺寸装饰物"（闪烁）。
- 薄片/贴片**用长方体**（scale=[边长, 厚度, 边长]）才有真厚度；平面缩放厚度不生效。
- 薄片外贴 = 表面(±0.5×scale) + 半厚 + 间隙 0.005~0.01，旋转按法线推导（平面法线 +Y → 目标方向，YXZ 内旋）。
- 元件 def/inst/entity ID ≥ 1077936129（0x40400000 区间，否则游戏加载时整体丢弃）；aux ID 可用 0x4000xxxx。
- **命名规范**：节点图要引用元件名，必须一眼可识别。魔方块用 WCA 角块名（角块_UBL/UBR/UFL/UFR/DBL/DBR/DFL/DFR）；未来 3×3 延续 WCA。
- 块间留缝：元件 scale 0.965（缝 0.035）等，薄片随比例自动保持贴面。
- 白色贴片用明显更暗的浅灰白（0xD0D0D0；纯白/近白 0xE8E8E8 均刺眼，透明度方案效果弱）；
- 场景实体**不预置**：游戏开始时由节点图动态创建（方便整体移位，改一个基准位置即可）。

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

## 4. 输入机制

- 首选"实体选项卡"（entity option tabs）：官方知识确认选项卡选中事件直达挂载该实体节点图。
- 编辑器配置最小样本后，用相邻快照调查闭合 GIL 编码（editor-incremental-gia-investigator 流程），再做批量配置。
- rubik-2x2：魔方实体上 6 个选项卡 R/L/U/D/F/B（待 P3 闭合编码）。

## 5. 节点图逻辑

- 读图：`gil-node-graph-reading`（从关卡全景到单节点数据源的追踪 + explain 词汇表）。
- 改图：`gil-node-graph-editing`（快照备份→候选→回读→写回，fail closed 不猜字节）。
- 事件挂载：`docs/game-engine-knowledge/graph-mounting.md`（实体挂载节点图、事件→节点入口）。
- rubik-2x2：选项卡事件 → 找该层 4 个方块实体 → 对 4 个方块触发恒定旋转运动器（绕轴 90°）。

## 6. 编译注入

- 加载 `verify-injection`：专用验证地图 + `verify/<分支>/<分支>.ts` + `gsts.verify.config.ts` 编译注入。
- config 平时不配 inject（否则编译报 `target gil not found`），注入前临时加。
- 每分支一个验证点，编码成功/自动测试/注入/游戏内验证分层报告。

## 7. 游戏日志验证

- 加载 `debug-log-investigator`：Beyond_Debug_Log 逐节点执行记录（执行顺序、输入输出、变量、控制流分支）。
- 改图 → 编译 → 注入 → 用户运行 → 落盘日志 → 解析比对，还原节点执行过程破译引擎规则。

## 8. 知识沉淀与收尾

- 每轮更新 `examples/<game>/PROGRESS.md`（状态表：规划/建模/输入/逻辑/验证 + 变更记录 + 待闭合规则清单）。
- 新闭合规则同步两份文档：`static-gil-model-builder` 技能参考（建模技能）+ `docs/game-engine-knowledge/`（知识引擎权威）；局部经验只进案例文档。
- 工作流/结论变化时按 PKC 流程录入（`python tools/pkc.py`，pending→Authority 已提交基线后 approved）。
- **git 提交纪律**：未经用户明确指示不提交；用户指示"提交"时按主题分批（如：①工作区其他未提交文件 ②游戏项目相关文件含新技能），每批一个 commit，提交前 `git diff --check`。
- 每轮结束做规则反馈检查：本轮的源码/测试/真实 GIA/用户反馈是否与 AGENTS.md 冲突。

## 状态分层（禁止混称"完成"）

```text
计划就绪 → 候选就绪 → 写回成功 → 用户视觉核验通过 → 游戏行为验证通过
```

## 案例速查

详细案例（地图 ID、元件清单、已闭合规则出处、视觉迭代历史）见 `references/rubik-2x2-case.md`。
