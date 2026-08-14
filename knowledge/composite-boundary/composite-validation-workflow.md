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
