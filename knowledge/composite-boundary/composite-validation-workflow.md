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

scripts/composite-health-check.ts 把已闭合规则（#12-#18、#20）编码为编译产物体检：C1 capture 路由完整性（#17：调用点 InParam 必须有连接/字面量/路由）、C2 图变量名字面量（#18+编辑器保存副作用）、C3 exec 链完整性+flow 路由物理 pin（#12/#13/#15）、C3b impl 内部 exec 边→合成节点物理 InFlow（#20）、C4 OutParam 惰性求值（#15 写后读派生值）；双模式：GIA 产物（单文件或 --scan 目录递归，任一文件 FAIL 退出码 1）与 --ir 源码 IR 构建；--scan 已接入 npm test 尾部（批量编译后自动体检全部测试产物）。IR 模式 C3-ir 检查 implEdges 时须按权威类型 NextConnection = number | { node_id } 兼容两种形状（曾误用 conn.targetId 导致所有带执行边的复合误报）。验证数据（2026-08-15 复核）：rubik v20 生产产物 22 复合 + 5 主图调用 0 FAIL 0 WARN；全量 71 测试产物扫描 0 FAIL 后接入 npm test。

#### 适用边界

体检通过只覆盖已编码的缺陷模式，不证明游戏行为正确；--ir 模式仅适用于小 case 入口（执行入口注册 server 的运行时类型匹配限制——rubik 复杂 handler 超出范围），生产产物一律用 GIA 模式/--scan；--scan 需要 dist/tests 已由批量编译生成。

<!-- CLAIM:END clm_4502C6F37E622E56958CA09B8F -->

<!-- CLAIM:START clm_740967E3FFD383A6EEA8C68637 -->

### Composite node-family coverage matrix: compile-layer batch verification with layered evidence

复合节点族覆盖矩阵（tests/composite/test-composite-node-family-coverage.ts，自动迭代收敛）：13 族 + 事件族 18 代表事件（10 类语义），45 case 编译层一次通过。分层原则：编译层 PASS 只证明复合 impl 内编码无缺口，≠ 游戏正确。游戏层证据（2026-08-15，2698 日志）：复合内 whenEntityIsCreated（捕获实体创建）+ whenCustomVariableChanges（对照组）在 event-internal 验证图真实触发；whenTimerIsTriggered 此前已验证（2696）；复合内 sendSignal → 图级 onSignal 参数接收 3 次全通（从零注册信号 verify_ping2）。已知 DSL 约束：createPrefab 的 prefabId 不支持数据节点、复合内空列表需 listLiteral、复合内 setTimeout 不可用。

#### 适用边界

编译层 45/45（2026-08-15）；游戏层已实测事件：whenCustomVariableChanges/whenTimerIsTriggered/whenEntityIsCreated（2696+2698 日志）；其余 15 个代表事件触发语义仍为待核验状态，不得推广为游戏行为断言。

<!-- CLAIM:END clm_740967E3FFD383A6EEA8C68637 -->
