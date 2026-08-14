# Composite bug analysis and validation workflow

Navigation for isomorphic reproduction, impact survey, root comparison, red/green regression, backend coverage, and evidence separation.

No claims are created by this structure Bundle.

<!-- CLAIM:START clm_01KYH07BXVXF15V0QZKK1E37KB -->

### Composite boundary fixes require an isomorphic red-to-green evidence chain

A Composite/GIA boundary bug is analyzed by preserving the reference, decoding interface/impl/routes and raw wire when needed, creating a minimal isomorphic reproduction, confirming the failure before production edits, surveying affected node families, comparing the same nodes in the root graph, writing a focused red regression, applying the smallest seam-local fix, and validating adjacent nested/capture/sparse/root-impl and shared/legacy paths as applicable.

#### 适用边界

Reports must keep current source behavior, automatic regression, real GIA observation, editor import, injection/writeback, and game behavior as separate evidence levels. A generated or structurally valid GIA does not by itself prove editor or game behavior.

<!-- CLAIM:END clm_01KYH07BXVXF15V0QZKK1E37KB -->

<!-- CLAIM:START clm_4502C6F37E622E56958CA09B8F -->

### Composite health-check guardrail: closed rules as automated C1-C4 checks with CI scan

scripts/composite-health-check.ts 把已闭合规则（#12-#18、#20）编码为编译产物体检：C1 capture 路由完整性（#17：调用点 InParam 必须有连接/字面量/路由）、C2 图变量名字面量（#18+编辑器保存副作用）、C3 exec 链完整性+flow 路由物理 pin（#12/#13/#15）、C3b impl 内部 exec 边→合成节点物理 InFlow（#20）、C4 OutParam 惰性求值（#15 写后读派生值）；双模式：GIA 产物（单文件或 --scan 目录递归，任一文件 FAIL 退出码 1）与 --ir 源码 IR 构建；--scan 已接入 npm test 尾部（批量编译后自动体检全部测试产物）。IR 模式 C3-ir 检查 implEdges 时须按权威类型 NextConnection = number | { node_id } 兼容两种形状（曾误用 conn.targetId 导致所有带执行边的复合误报）。

#### 适用边界

证据：rubik 产物全绿 + 篡改检出实验（C2/C1-host）+ 2026-08-15 全量 71 个测试产物扫描 0 FAIL 后接入 npm test；体检通过只覆盖已编码的缺陷模式，不证明游戏行为正确；--ir 模式需要 dist 已构建（npm test 的 build 步骤保证）。

<!-- CLAIM:END clm_4502C6F37E622E56958CA09B8F -->

<!-- CLAIM:START clm_740967E3FFD383A6EEA8C68637 -->

### Composite node-family coverage matrix: compile-layer batch verification with layered evidence

复合节点族覆盖矩阵（tests/composite/test-composite-node-family-coverage.ts，自动迭代收敛：构建全部→失败定位→移除重试）：13 族（算术/比较/向量/三角/列表/字典/图变量/查询/动作/控制流/自定义变量/转换/局部变量/定时器/组合）+ 事件族 18 代表事件（2026-08-15 扩展，覆盖状态变量/实体生命周期/碰撞触发/战斗伤害/运动停止/定时器/UI 交互/单位状态/阵营玩家/装备背包 10 类语义），共 45 case 编译层一次通过。分层原则：编译层 PASS 只证明复合 impl 内编码无缺口，≠ 游戏正确——游戏层以 rubik 实际用例核验为准；事件触发语义需逐事件游戏核验（#21 已证 whenNodeGraphVariableChanges 图变量在复合内不触发）。已知 DSL 约束：createPrefab 的 prefabId 不支持数据节点、复合内空列表需 listLiteral、复合内 setTimeout 不可用。

#### 适用边界

编译层证据为 2026-08-15 45/45 一次通过；游戏层仅 whenCustomVariableChanges/whenTimerIsTriggered/whenEntityIsCreated 实测（2696 日志）；其余事件触发语义为待核验状态，不得推广为游戏行为断言。

<!-- CLAIM:END clm_740967E3FFD383A6EEA8C68637 -->
