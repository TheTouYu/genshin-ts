# 任务：变量系统 DSL/CLI 设计落地（P3 实施，M1 优先）

## 一、任务目标

依据 `docs/design/variable-system-design.md`（P3 设计提案）实施工程化落地，让已闭合的变量 wire
规律变成可用的 DSL/CLI 面。分层目标：

- **工程层（本任务）**：
  - M1：规律表单一事实源（C4）+ `gsts variables:verify` 命令（C1）+ 回归测试改表驱动；
  - M2（时间允许）：局部变量常量 init 折叠（D3，省 1 个 Set 节点）；
  - M3（时间允许）：自定义变量 DSL 声明清单 + `--from-json` 消费（D1-B）。
- **玩法层（后续，不在本任务）**：把新接口用于真实 demo 玩法。
- **核验层**：所有规律已闭合且有证据，核验 = 照规律表逐字节比对，**不允许猜测字节**。

## 二、铁律（不可妥协）

1. **不改变任何已闭合字节形态**：已闭合形态以样本/hex 常量为准；我们的产出只允许向编辑器
   形态对齐，不允许反向漂移。改动后 v0–v16b 样本比对必须保持全 PASS。
2. **实体/元件 ID 不硬编码进 DSL**：资产定位归注入目标/config；CLI 语义化目标（C3）不引入
   硬编码 id。
3. **证据分层**：回归测试通过 ≠ 注入正确 ≠ 游戏行为正确；报告分开说明。
4. **未闭合段（inferred）不得冒充 verified**：图变量 dict、server 局部变量 ioc 9..20、
   client dict 值 pin 只标 inferred，verify 默认跳过，样本到位才转正。
5. 破坏性操作（写真实地图/覆盖文件）先说明证据、方案与影响，取得确认再动手；验证全部在
   /tmp 副本或样本副本上进行。

## 三、核验标准

- **模型侧（提交前必须全过）**：
  - L1：`npx tsx tests/local_variable_editor_wire_test.ts`、`tests/graph_variable_int_list_editor_wire_test.ts`、
    `tests/level_variable_initial_values_test.ts`（三个样本参数）、`tests/level_variable_str_list_empty_test.ts` 全绿；
    client smokes：`scripts/client-nodegraph/smoke-local-variables.ts` 等 6 个全绿。
  - L2：`variables:verify` 对 `~/genshin-ts-evidence/variable-system/raw/var-v0..v16b` 全部样本
    按 scope 运行全 PASS；人为改 1 字节 → 对应 DIFF 报出（自证命令有效）。
  - L3：注入 /tmp 副本 → read-back → L2 通过（M1 落地后）。
  - `git diff --check` 干净。
- **用户侧（每轮验证）**：用户对新增接口做编辑器对照或游戏内确认（如常量折叠后的图在游戏内
  读局部变量行为不变）。
- **最终验收**：M1 命令+规律表+测试全绿；M2/M3 若做，字节等价性测试通过。

## 四、多轮迭代与多会话衔接

- 轮次骨架（按探索结果调整）：① 盘点规律与测试资产 → ② 规律表结构设计 → ③ verify 命令实现 →
  ④ 测试改表驱动 → ⑤ M2/M3 → ⑥ 文档收尾。
- 会话衔接：新会话先读 `docs/design/variable-system-design.md` →
  `docs/maintenance/variable-system-panorama.md` → `docs/game-engine-knowledge/variables.md` →
  PKC（`python tools/pkc.py query "变量 wire 规则" --level 2`）→ 证据 manifest
  （`~/genshin-ts-evidence/variable-system/notes/manifest.md`）。
- 每轮结束：更新设计文档/panorama 检查点 + 小步提交（commit message 写清范围）+ 复盘落盘。

## 五、复用清单（先查再用，不要重新发明）

- **技能**：`genshin-ts-asset-operations`（资产写回/安全流程）、`dsl-nodegraph-development`（DSL/
  编译）、`gil-node-graph-reading`（读图）、`composite-docs-navigator`（GIA 知识导航）。
- **已闭合规律与证据**：`docs/game-engine-knowledge/variables.md`（权威规则）+
  `~/genshin-ts-evidence/variable-system/raw/`（v0–v16b 样本 + sha）+
  `tests/` 下三个变量回归测试（hex 常量已锁字节）。
- **探针工具**：`.local/vars-explore/`（dump-entity/dump-node-hex/make-gia/inject-tmp，
  直接 `npx tsx` 复用；注入临时副本用 `/tmp/inject-tmp2.ts` 模式）。
- **项目编码表（可作规律表数据源）**：`src/compiler/ir_to_gia_transform/client_nodes.ts`
  （CLIENT_VAR_TYPE_BY_IR_TYPE）、`client_graph.ts`（LOCAL_VAR_IOC_BY_IR）、
  `src/cli/gil_level_variables.ts`（TYPE_BY_CODE）。
- **已知坑（务必遵守）**：① 单文件 `.gs.ts` 经 `npx tsx src/cli/gsts.ts` 编译会出现
  "empty IR list"（dist 双实例）——用 `node dist/src/compiler/gs_to_ir_json_transform/runner.js`
  或 in-process `writeGiaFromIrJsonFile`；② **protobufjs 嵌套消息重编码会伪影性补写字段**——
  比对必须用 decode 状态（own property）或原始 wire，不要信重编码 hex；③ `npm run build` 全量
  红（779 个既有无关错误）——只验改动的文件（tsx 直接跑）。
- **文档**：`docs/maintenance/open-items.md`（O-29-03/04 顺带处理窗口）、
  `docs/maintenance/variable-system-panorama.md`（检查点格式）。

## 六、已知局限与风险

- client dict 值 pin、图变量 dict/exposed=1、server 局部变量 ioc 9..20 = 推断段（inferred），
  无编辑器样本；不得写进 verified 断言。
- O-2026-08-29-03（indexOfConcrete=0 显式）若随 M2 窗口处理，需先建样本回归再改编码。
- 规律表与测试双份维护会漂移——设计上必须共用或自动比对（C4 要求）。
- 编辑器保存会做"默认字段省略"归一化（v3 实证）——verify 对"编辑器保存后"的地图可能报
  DIFF，需区分"我方产物"与"编辑器已归一化产物"两种核验模式。

## 七、第 0 轮任务（现在开始）

1. 读 `docs/design/variable-system-design.md` 与三个变量回归测试，盘点已闭合规律 → 产出
   **规律表 JSON 骨架**（容器 × 形态规则 × hex 常量 × 证据样本 sha，inferred 单独标注）；
2. 设计并实现 `gsts variables:verify` 命令骨架（只读，scope 参数，PASS/DIFF 报告格式）；
3. 用 v16 样本（客户端 21 类型）做端到端演示：verify 输出 vs 现有测试常量一致性；
4. 交付物：规律表文件 + verify 命令代码 + 演示输出 + 设计文档更新（M1 进度标记）。

完成后向用户报告：命令用法、覆盖范围、与现有测试的关系、下一轮（测试改表驱动 / M2）计划。
