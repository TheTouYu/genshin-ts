# 完整复盘：球跟随渲染链（中心球驱动、分块跟随）落地（2026-09-07）

> 范围：从研究模式（运动器快照/中心宿主判定收尾）→ 用户接管定方案 → 7 点球跟随方案全链路落地（资产/图/注入测试图）
> 状态：结构层全绿、待用户游戏核验；原图 1914 SHA 未动
> 证据：提交 b7bc385 / 49bac9e / cc06e8d；测试图 1073741919（SHA bc86c676…）；本会话工具输出
> 来源：当前源码 + 真实 1914/1919 wire 回读 + 用户方案原话

## 一、错误谱系总览

| # | 症状 | 根因层 | 具体错误 | 修复 | 提交/位置 |
|---|---|---|---|---|---|
| 1 | bash bad substitution | 脚本 | JS 模板字符串在双引号 bash 中被展开 | 单引号包裹+字符串拼接 | 本会话 |
| 2 | root8 transform 空指针 | 知识 | 猜字段号 f5/f6，实际 f6→f11→f1 | 读 setStaticAssemblyPosition 源码取结构 | 本会话 |
| 3 | mounts 报 target-id 错 | 工具用法 | `assets:mounts list` 需子命令式调用+--gil | 读 usage（list/attach/detach --graph） | 本会话 |
| 4 | static-assemblies 拒空 items | CLI 缺口 | 校验强制 ≥1 装饰物，纯基础资源元件无法表达 | **修 CLI**（放开空 items+测试契约更新） | b7bc385 |
| 5 | npm run build 3974 错 | 预存债务 | football dist-fb 生成物+variables_definition_test 缺 import（HEAD 即坏，dist 停在 09-03） | 只修测试 import；football 部分登记 open-items | b7bc385 部分 |
| 6 | `gsts.f is only available in server_*` | 环境 | `npx tsx src/cli` 触发 src/dist 双副本分裂（已知坑） | 改走 `node ./bin/gsts.mjs`（dist） | 本会话 |
| 7 | Invalid value type: int_list | DSL | `getCorrespondingValueFromList` **参数序按端分岔**：服务端 (list, index) / 客户端 (index, list)，我按客户端序写服务端代码 | 换序；登记 DSL 技能 | 49bac9e |
| 8 | GSTS-COMPOSITE-MISSING-OUTFLOW | DSL | flowSpawnBalls 链尾未 `f.outflow('done', tail, 0)`，调用方 auto-chain 找不到 OutFlow[0] | 显式收尾；登记 DSL 技能 | 49bac9e |
| 9 | （自查）重置后跟随失效 | 设计缺口 | flowResetCore 销毁重建 26 块，新实体未重绑 | flowResetPublish 尾部补 flowBindBalls | 49bac9e |
| 10 | Temp md5 不一致 | 流程 | 注入命令不自动同步 Temp | 注入后必须手动 `maps:resync`（沿用旧纪律） | 本会话 |

## 二、本轮关键调查链

1. **运行时块= createPrefab 动态实体**（非 root8 静态实例）：读 flowSpawnRubik 源码确证 → 球也走 createPrefab；def 侧组件是复制源。
2. **运行时魔方中心 = spawn(3,3,3)**：UBL(2,4,2)=中心+off(-1,1,-1) 逐轴核实，与 gen-rbv-vars `off[26]` 表闭合 → 绑定偏移表零新推导。
3. **球朝向历史 ≡ 块朝向历史**：球恰在块所在层转动时旋转 → 客户端 localAxis 数学 1:1 复用，仅弃 vel1/vel2（保 7 参信号 wire 兼容）。
4. **组件替换语义**：`setStaticAssemblyComponents` 是按类型码 upsert + `removeComponents` 独立通道 → "去 4 加 9 保其余 [18,1,3,19,6,14]"一次表达，三层联动（root4 f8/root8 f7/root5 f7）。

## 三、系统性根因

1. **写 DSL 未加载 dsl-nodegraph-development 技能**：#7/#8 两错恰是该技能领域（受限子集/四层验证）。AGENTS 铁律"技能已覆盖的规则不凭记忆猜"被绕开——技能加载纪律在"用户接管快速推进"模式下最容易松。
2. **字段号/参数序凭直觉写**：#2/#7 都是"结构假设未先读源码/技能"。规律：**碰 wire 结构与 API 签名，先读一个真实实现（setStaticAssemblyPosition / 既有调用点）再写**，本次两处都省了这一步。
3. **预存构建债务遮蔽**：HEAD `npm run build` 坏（3974 错）导致 dist 停在 09-03，所有 CLI 验证被迫走"dist 旧+tsx 会分裂"的窄路。债务不清，每轮都付利息。

## 四、流程与方法论教训（用户原话优先）

- **用户接管信号**："停止这些琐碎的行为。我来指导你。"——门禁式研究流程对给出完整方案的专家用户是负资产；用户给出 7 点完整设计后应立即切换为直接执行模式（本复盘即从该点起算）。
- **设计纠偏（必答一问）**：我误设"球在格位上"推出"必须重绑"；用户纠正："绑定一次就好，就在块创建的时候，后续完全不用管"——27 球**全部在魔方中心**、偏移在球局部系恒定。教训：对用户领域知识（跟随语义）先问清几何模型再推演依赖。
- **修工具不绕路**（与环境注入器纪律一致）：CLI 强制 ≥1 装饰物时，没有塞 27 个假装饰物，而是最小放开校验+测试+提交（b7bc385）。
- **测试图隔离**：copy 1914→1919，全程 SHA 锁定原图，收尾改名「魔方3x3_球跟随测试」防编辑器列表混淆。

## 五、风险与未闭合项

- **createPrefab 组件复制矛盾（关键）**：components.md:229 记"createPrefab 不复制运动组件"（08-16 灯阵），但 3x3 块（createPrefab、def 带 type 4）自 08-20 起能转——**type 9 是否复制决定本方案成败**，待用户游戏测试裁决；已在 components.md 挂矛盾注记 + open-items。
- 跟随行为语义（完全跟随+相对坐标系+固定偏移=精确公转+自转 90°）为用户断言，无本项目游戏实证。
- 负载对比（vs 3143 基线）未测；票 06 阶段②（orbit2 编排）被本方案整体取代，看板待更新。
- `npm run build` 预存 3974 错（football dist-fb 生成物 3970 错 + core.ts 4 错）未清。

## 六、产出清单

- 修复/功能：b7bc385（CLI 零装饰物+测试 import）、49bac9e（球跟随渲染链 6 文件）、cc06e8d（资源登记表）
- 资产：27 球 def+inst（1077936233..259）+ 26 块 4→9（测试图 1919，备份齐全）
- 图：ballvisual(1073741840) 新建挂载；visual(832) 卸载保留；17/17 注入；预算 458/1305/73/415
- 文档/技能：本复盘；components.md 矛盾注记；dsl 技能 2 条新规则；PROGRESS/BOARD 更新；open-items 2 条
- 待用户：游戏内测 1919（转面/打乱/自动还原/整转/是否被踢），回传日志编号
