# MIGRATION — donor 1899 → 新图 1073741920 资产迁移映射（2026-09-09 CLI 实测盘点）

> 权威来源：`assets:resources list` / `list-gil-node-graphs` / `assets:mounts list` / `assets:signals inspect` 实测回读（本文件取代旧摘要里的 ID 表——旧表多处过时：块 ID 实为 v2 段 204..229 非 6149..174；图 ID 主玩法=1830 非 1825；漏了 solverPlan 1834 与 切换镜头 1839）。

## 迁移策略（定案）

机制定案：三通道=A `assets:static-assemblies`（root4/8/27 静态模型，ID 保留变换）/ B `assets:entities --entities --definitions-gil`（root5 实体，donor 定义兜底合并）/ C donor src 拷贝改 id 重编译注入（root10 图，占位图先建后回读）；特例=切换镜头 1839 无 src（editor-made）→ 提取重写 DSL 或缓做并从挂载矩阵剔除。

**ID 原样保留**：新图 1920 root4/5/10 为空（仅 init 模板默认件），donor 自定义 ID 段无冲突。GIA 图内部引用 definitionId/entityId（createPrefab 等）——**换 ID 就得改图字节，保留 ID 则 donor GIA 直接可注入**。新图新增资产（UI/新图/美术）用全新 ID 段，从 1077936300 起预留。

## Prefab（root4 定义 + root8 页面模型，共 29 个自定义）

| donor ID | 名称 | 用途 | resource |
|---|---|---|---|
| 1077936200 | 魔方控制器3x3 | 控制器 A 定义 | 10009001 长方体 |
| 1077936202 | 魔方控制器3x3-B | 控制器 B / solver / 测试台共用定义 | 10009001 |
| 1077936204..1077936229 | 星枢3x3块_v2_UFL..DBR（26 个） | 魔方块 | 10009001 |
| 1077936230 | 元件组魔方摆放 | 块摆放页面模型组 | 10008001 |

（1086324737 默认模版 / 1090519041 角色编辑模版=编辑器默认，新图 init 已自带，不迁移）

## 实体（root5，共 6 个自定义）

| donor ID | 名称 | definitionId | 挂载图 |
|---|---|---|---|
| 1077936201 | 魔方控制器3x3（A） | 1077936200 | 1830 game + 1835 turn |
| 1077936203 | 魔方控制器3x3-B（B） | 1077936202 | 1831 relay + 1832 visual |
| 1077936230 | 魔方自动求解 | 1077936202 | 1833 solver + 1834 solverPlan + 1836 solverEPlan + 1838 solverLPlan |
| 1077936231 | 魔方测试台3x3 | 1077936202 | 1837 testPanel |
| 1077936260 | 空模型 | 10005018 | （无图；运行时锚点） |
| 1077936261 | 物件镜头 | 10005018 | 1839 切换镜头 |

## 节点图（root10，共 10 张）

| donor ID | 名称 | nodeCount | 迁移 |
|---|---|---|---|
| 1073741830 | _GSTS_game | 85 | ✅（主玩法） |
| 1073741831 | _GSTS_relay | 8 | ✅ |
| 1073741832 | _GSTS_visual | 30 | ✅ |
| 1073741833 | _GSTS_solver | 72 | ✅（票06 提示改造点） |
| 1073741834 | _GSTS_solverPlan | 262 | ✅ |
| 1073741835 | _GSTS_turn | 42 | ✅（零改动原则） |
| 1073741836 | _GSTS_solverEPlan | 152 | ✅ |
| 1073741837 | _GSTS_testPanel | 8 | ✅ |
| 1073741838 | _GSTS_solverLPlan | 298 | ✅ |
| 1073741839 | 切换镜头 | 8 | ✅（镜头功能，用户在用） |

## 信号（7 条，全迁移；新图信号注册后核验 v/defs 一致性）

rubik3x3_solve[op,val] / rubik3x3_solve_ack[] / rubik3x3_solve_done[ok] / rubik3x3_solve_move[moveId] / rubik3x3_solve_ready[] / rubik3x3_solve_req[] / rubik3x3_tab[tabId]

## 变量

- 关卡变量（root5 level）：**0 条**（实测空）
- 图变量：随 GIA 图走，无需单独迁移

## 不迁移项

- tabBar 组件配置（UI v3 退役；但实体定义里的组件槽结构保留原样——turn 图 tabBar 事件分支仍在，仅无 UI 入口，方案 B 手术时再定）
- 编辑器默认模版（1086324737/1090519041 段，init 模板自带）

## 迁移顺序（票03 执行清单）

1. donor root4+root8 复制（29 prefab：定义+页面模型+aux 装饰物）
2. 新图建 10 张占位图（node-graphs create，名字对齐 donor）
3. donor GIA 导出→注入新图对应占位图
4. 实体 import（6 个，root4 定义先行已就位；--definitions-gil 或已复制）
5. 信号注册×7（--write）+核验
6. 挂载还原（上表矩阵）
7. maps:resync + 用户重载编辑器保存 + 游戏核验（1899 等价行为）

## 执行命令清单（2026-09-09 实测定案）

变量：`DONOR=<Save_Level>/1073741899.gil`；`NEW=<Save_Level>/1073741920.gil`（<Save_Level>=/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level）。

1. **静态模型（通道A，root4+8+27）**：
   - `node ./bin/gsts.mjs assets:static-assemblies export --map-id 1073741899 --format json > .scratch/rubik-game/assets/donor-assemblies.json`
   - ID 保留变换脚本 `.scratch/rubik-game/tools/migrate-asset-config.mjs`（G2-03 编写，改编 examples/rubik-3x3/tools/gen-asset-config.mjs：**保留 prefabId/definitionId 不重排**——assets/plans/ 旧配置是 v1 段 6149..174，donor 现状是 v2 段 204..229，勿直接复用）
   - `node ./bin/gsts.mjs assets:static-assemblies --asset-config <变换产物> --map-id 1073741920 --output .scratch/rubik-game/assets/new-candidate.gil` → 候选回读 diff 断言后 `--write`
2. **实体（通道B，root5，已导出 .scratch/rubik-game/assets/donor-entities.json=6 实体）**：
   - `node ./bin/gsts.mjs assets:entities --map-id 1073741920 --entities .scratch/rubik-game/assets/donor-entities.json --definitions-gil $DONOR --write`（root4 已由通道A在位，--definitions-gil 按 wireRecordId 去重兜底）
3. **占位图（通道C 前置）**：`node ./bin/gsts.mjs assets:node-graphs create --map-id 1073741920 --name _GSTS_game`×10 按 donor 表序（空 root10 → id=max+1=1073741825 起顺序分配：game→1825、relay→1826、visual→1827、solver→1828、solverPlan→1829、turn→1830、solverEPlan→1831、testPanel→1832、solverLPlan→1833，第 10 张给切换镜头 DSL 重建用→1834）；**create 后必须回读确认实际 id 再改 src**
4. **图迁移（通道C）**：donor src（game/relay/visual/solver/solverPlan/turn/solverEPlan/testPanel/solverLPlan + tables/composites/resources/signals）拷入 examples/rubik-game/src → `g.server({id})` 改到新占位 id → 编译 → gsts.config targets 回填 → 注入 → decode-gia+读图核验
5. **信号×7**：`node ./bin/gsts.mjs assets:signals register --map-id 1073741920 --template-gil $DONOR --template-signal rubik3x3_solve --name rubik3x3_solve --write`（其余 6 条同形：solve_ack/solve_done/solve_move/solve_ready/solve_req/solve_tab；参数布局从 donor 模板直拷）
6. **挂载**：`node ./bin/gsts.mjs assets:mounts attach`（新图 id × 实体矩阵见上表；attach 子命令参数以其 usage() 为准——help 同样低报）
7. **收尾**：`node ./bin/gsts.mjs maps:resync --map-id 1073741920` → 用户重载编辑器保存 → 游戏核验 1899 等价行为

### 侦察陷阱记录（实据）

缺口通道：①A 控制器 1077936200 不在 assemblies 导出面（27 条= B 控制器+26 块）——用库内计划 examples/rubik-3x3/assets/plans/controller-config.mjs 对 1920 二次 apply（prefabId 6200 保留；其 aux id 1938/1939 与迁移变换的 1941+ 段无冲突；tabBar 15 项与 donor 现状一致性执行期读回核验）；②元件组 1077936230（resource 10008001 页面模型组）——root4 定义由通道B entities import 的 --definitions-gil 兜底合并（wireRecordId 去重仅补缺），root8 页面呈现缺省不影响玩法（仅编辑器摆件菜单差异，G4 美术期若需再补）。

- **commander help 低报**：`assets:entities --help` 不列 `--definitions-gil`，但运行时支持（src/cli/assets_entities.ts:54/156/482-496；dist 引用×2 探针 defgil_hits=2；gsts.ts:1854 `allowUnknownOption(true)` 裸 argv 转交自定义解析器）。判 CLI 能力以 src 实现+dist 实跑为准，勿信 help 全集。
- **`assets:node-graphs` 无子命令默认=注入预览**（危险误触面，本次误跑无 --write 未写入）；`nodes` 子命令=节点预算计算非列举；图列举用 `npx tsx tools/list-gil-node-graphs.ts <gil>`（donor=10 张，探针 graph_count=10；表外空占位 1840「新建节点图」不计、不迁移）。
- **donor src 图 id≠新占位 id**（donor 1830..1839 vs 新 1825..1834）：GIA 内嵌图 id，src 改 id 重编译为 canonical 路径；图间只靠信号/挂载关联（MIGRATION 实测），改 id 安全。
- donor 实体导出已落 `.scratch/rubik-game/assets/donor-entities.json`（schemaVersion=1，read-only 导出）。
