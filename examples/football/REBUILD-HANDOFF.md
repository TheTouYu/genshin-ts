# 足球 v3 从零重构 · 交接文档（2026-10-12 用户裁决）

> doc-type: S · status: active · updated: 2026-10-12
> **下会话/接手代理第一读物**。第二读 `.scratch/football-v2/issues/25-rebuild-v3-from-scratch.md`（功能清单冻结版），第三读 BOARD。

## 一、方向裁决（用户原话，2026-10-12）

1. 「本来是可以直接复制一份过来的，但是我没有，因为我希望你做减法，把核心的拿过来。
   迭代，我们一般把这个叫做重构。用更清晰，更合理的架构实现同样的功能。」
2. 「演出不是必须的。」
3. 「资产可以照搬，但是丘丘人这个不要搬运了，从 0 开始。」
4. 「我会配置指导完成全部实现客户端计算的全部流程。」

**背景**：1825 换机重建（票 24，照抄 donor 3231 终版快照）复测「差的很差」——三轮修复
（§5 地形/§6 def 血统/§7 三层槽+Temp 洗掉案）都在补照抄的洞，根子是**终版快照≠设计真值**
（混着实验残留+演出停用态+半成品）。用户定调重构。

## 二、保留 / 砍掉 / 从 0 建（一句话版）

- **保留（源码原样带走，只重装配）**：`src-fb/fb-phys2.ts`（六态物理 705n 源码）、
  `sim/` 数学层、fb_p_* 21 参数体系、信号协议（fb_ball_state 6 参/fb_ball_drive/
  fb_echo 族）、球变量体系、tabBar 9 选项入口（`src-fb/fb-input.ts`）、TickManager
  （`src-fb/` 源码在，28n）。**禁止重写物理数学**——22 票调优+多轮复测的资产。
- **砍掉**：演出线全部（1836 装配器/682n loop/calib/UI 按钮/show-director 演出段/
  假人/ACT-2..4/6132 定时状态）；丘丘人算力载体（def 433/434/435+7 实体）；22/23 票
  演出目标取消；20 票实验冻结。
- **从 0 建**：客户端计算载体链（技能配置→造物 def→技能图 20008 挂 phys2）——
  **用户配置指导区，每步差分确认再动手**；球 def+实体（复杂造物基础元件基板）。
- **照搬**：草皮 625 格+球门+静态元件/实体（donor 3231，地形层无白名单损耗）。

## 三、分批与第一步

A 场地照搬 → B 球与入口（def+tabBar+命中检测+变量） → C 计算链（**用户指导**） →
D 打磨（参数/负载核对）。A/B 可离线先行，C 等用户上线。验收锚点=踢球六态
（Airborne→…→Rest）日志帧值对照 donor 基线 + sim 遥测（R2-DESIGN §7）。

## 四、地图与资产状态

- **新地图已建（2026-10-12 A 批）：1073741827「真实足球v3」**——场地全套已落（625 格+
  场/门 def-实体），执行记录与终态 SHA 见票 25 §6；**待用户进图目视核验**。B 批在此图继续。
- **旧图 1825**（终态 855ddd98 双址一致）保留不删、**不再投入修复**（历史教训样本+备件）。
- **donor 3231**：`.scratch/_archive/football-v2/evidence/ab-22/map-2026-09-07_14-37-43_3231_110170759.gil`
  ——转**只读行为基线**（日志对照/资产搬运源），禁止写入。
- 换机环境：Arch+wine，`GSTS_LOCALLOW_DIR`=anime-game-launcher prefix LocalLow；地图 gil
  双地址（`Beyond_Local_Save_Level/<id>/<id>.gil` 子目录式 + `Temp/<id>.gil` 平铺）。

## 五、必带纪律（血泪浓缩，全文见 football/AGENTS.md 与技能）

1. **写回必同步 Temp**，否则修复被下次游戏会话引擎回写洗掉（§6 消失案实证；
   asset-operations SKILL 已录）。
2. **三层独立副本铁律**：root4 def f8 / root8 实例 f7 / root5 实体 f7，游戏读 root5；
   tab-options 命令三层都写；建完逐层回读签名（工具
   `.scratch/football-v2/tools-slot-sig-def-entity.ts`）。
3. **def 基板**：复杂造物必须基于「复杂造物基础元件」（§6 教训：普通丘丘基板丢非白名单槽）。
4. **CLI 通道优先，别手写字节脚本**：组件有 7 种白名单通道（staticAssemblies/components，
   含 hitDetection/tabBar）；定制参数字节不等价时（81B 默认≠71B 定制）走 donor 字节移植
   但必须官方 WireField 模式+round-trip 自检（样板
   `examples/football/assets/plans/transplant-component-slots.ts`）。
5. **行为验收走日志**：零记录图死链回溯 playbook（debug-log-investigator SKILL，2026-10-12 新增）；
   操作类问题先找事件帧（whenTabIsSelected 零帧=事件链断，非物理问题）。
6. **不变量清单 8 条**（football/AGENTS.md 一）写图前逐条对照；退役纪律须列清单用户裁决。
7. **票据驱动**：收轮三件套=勾票+PROGRESS 下一步+精确 commit；doc_health 门禁会拦
   BOARD HEAD 滞后。
8. **资产完备性判据=票 24 §C 分类表，勿自建工具**（2026-10-12 A 批实证：手写 python
   varint walker 枚举 donor root 白耗 7 轮——GIL 顶层是容器分块表非裸 protobuf，仓库
   无 root 枚举工具）；`assets:entities` 写侧操作必须带 `import` 子命令（无子命令=只读
   export，写侧参数已被改为 fail-closed 报错；import `--output` 即 GIL 候选）。

## 六、客户端计算链速览（C 批用户指导时的上下文）

旧链形态（供理解，不复刻）：技能配置（28 造物瞬发，如 2337/2338/2339）→ 施放生成造物
（丘丘实体为载体）→ 造物身上挂技能图（20008 槽=phys2 705n）→ 技能变量自持组
（channels 11 分量）→ 图在客户端执行。装配旧案=1836（whenEntityIsCreated→2s→
addCharacterSkill 槽12+addUnitStatus 6132）——**演出已砍，新装配方案等用户指导**。
源码侧：`src-fb/channels.ts`（自持组读写）、`fb-shared.ts`（协议常量）、
`client-nodegraph-development` 技能〇章（路线选型+编译前置铁律）。

## 七、提交记录

- 24 §7 修复轮：d2ddf55（修复+技能+票）+ 2ccbc65（PROGRESS）。
- 25 票冻结+本文档：见本轮 commit。
