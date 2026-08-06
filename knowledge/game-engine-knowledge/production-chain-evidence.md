# GIA 生产链路与证据层级

GIA 生产链路五层、可复现性边界、信号生产红灯清单、六层证据层级

<!-- CLAIM:START clm_FE7C817CA880B07A690AE9EBFE -->

### GIA 生产链路五层与可复现性边界（2026-08-02 全链路已验证）

生产链路（成功路径）：readRegisteredSignalsFromGil(<map.gil>)（src/cli/gil_signals.ts，信号注册数据：参数名/类型、三套 pinIndex、signalVersion、信号名 pinIndex、definition bytes）→ createSignalRegistry([signal])（src/compiler/signal_registry.ts）→ buildServerGraphRegistriesIRDocuments()（src/runtime/core.ts，先 g.server({name,id}).on(...).onSignal(...) 注册业务图）→ irToGia(docs[0], {graphId,name,protoPath,signalRegistry})（src/compiler/ir_to_gia_transform/index.ts）→ 写入 Beyond_Local_Export/ 根目录（不覆盖已有文件）→ decode_gia_file(<路径>, protoPath) 验证（graph.id.id/filePath 匹配/gameVersion=6.7.0/send+monitor 节点存在）。可复现性边界（重要）：GIA 字节级不可复现是 vendor 设计，不是 bug——vendor node_body()（gia_gen/basic.ts）给每个节点坐标加 0~10 随机抖动（x: body.x*300+Math.random()*10）；GIA filePath 含生成时间戳 {UID}-{TIME}-{LEVEL_ID}-{FILE_NAME}.gia。推论：“同信号同定义逐字节一致”的对比目标不可达，对比应改为结构一致（忽略 x/y 坐标与 filePath 时间戳，其余字段逐字节/逐语义一致）；参照 GIA 的 hash 相同只证明同一产物被复制过；生成脚本“已存在则拒绝覆盖”断言在重新生成时都会触发属预期行为；若需确定性输出应在调用 irToGia 前替换 Math.random 为固定 seed（不动 thirdparty vendor）。

#### 适用边界

2026-08-02 信号 GIA 全链路（gsts-signal-demo-test.gia 生成+注入+游戏核验）已验证；分层证据：生产链路生成→decode 回读断言→注入器识别→游戏内图正常显示/运行（用户核验），自动断言通过不等于编辑器可导入/游戏行为正确；常见坑位清单（parseArgs 不剥离 register、root10 双层包装、GraphNode 字段号、decode 后 genericId.nodeId、decode_gia_file 只接受路径、顶层 await、空图先 create、vendor 抖动非回归、_GSTS_ 图名覆盖、prefabs.ts 自动提取勿提交、GSTS_LOCALLOW_DIR、nodeGraphId 单文件注入目标、注入前确认 config mapId/nodeGraphId）见 gia-generation-chain.md

<!-- CLAIM:END clm_FE7C817CA880B07A690AE9EBFE -->

<!-- CLAIM:START clm_2CA265DEC217A343CCEF7C3E29 -->

### 信号生产红灯清单（A/B/C 已修复，focused regression GREEN）

生产实现与真实编辑器的三处 wire 差异（2026-08-02 修复，红灯转绿）：A. 数据连接 connect2——生产曾一律 connect2=connect=源 index，真实 wire 为 str 源→3、entity 源→4（跨家族恒定：entity 18 族 2657 与 180 族 183 均 connect2=4；str 18 族 2656 两样本+打印字符串 SysCall 1 两样本）；B. exec 连接 connect/connect2 不写 index 字段（2B 形态 12 02 08 01，显式 index=0 是 4B 12 04 08 01 10 00，protobuf presence 区分）；C. OutFlow pin i1/i2 不写 index（0a 02 08 02 vs 0a 04 08 02 10 00）。修复统一入口：src/compiler/ir_to_gia_transform/ordinary_graph_materializer.ts 的 applyEditorConnectionWireRules(nodes)，在 encode 之后、序列化之前对已编码 GraphNode 数组统一改写（幂等）：删除 OutFlow pin i1/i2 index、删除 InFlow 连接 connect/connect2 index、OutParam 连接 connect2.index 按源 index 例外（6→3、9→4，其余保持）。调用点：ir_to_gia_transform/index.ts（root 图 wrap 前）、composite.ts vendor 路径 materializeImplOrdinaryGraphWithVendor 返回前、legacy 路径 materializeLegacyImplGraphNode 批量返回前。修复后两个 focused regression GREEN（test-signal-monitor-consume-entity-connect2-red.ts、test-signal-monitor-exec-conn-index-red.ts），signal_consumption_replay_regression 等全量回归无新增失败；npm run build 与 git diff --check 通过。

#### 适用边界

自动测试 red→green 已完成，编辑器/游戏核验待用户执行（信号生产红灯修复文档状态）；str/entity connect2 例外底层语义 INSUFFICIENT（例外值 3/4 的注册定义 pinIndex、compositePinIndex、参数序号等解释均已排除），实现按经验规则写值；新 monitor 布局仍必须从当前 CompositeDef/注册定义解析，不能只写死 3+参数序号；修复不能改 thirdparty vendor

<!-- CLAIM:END clm_2CA265DEC217A343CCEF7C3E29 -->

<!-- CLAIM:START clm_5105D81ADED6A1310E6CB7A690 -->

### 六层证据层级与 GIA 优先验证路径

以下结果必须分开记录：1.真实编辑器观察（用户修改后关卡文件确实出现目标增量）；2.自动结构比较（工具确认哪些节点/参数/连接变化）；3.临时回读（手工候选写入临时副本后目标结构可正确读回）；4.真实写回（候选已写入真实 GIL）；5.编辑器导入（GIA 或写回关卡能被编辑器正常加载和显示）；6.游戏行为验证（用户实际运行后确认行为符合预期）。只有用户完成最后一步并明确反馈，才能写“游戏行为验证通过”。验证路径选择：能用最小 GIA 验证就优先 GIA（导入快、测试成本低、失败影响小、易判断哪条规则有问题）；只有完整关卡关系才能验证时用 GIL（依赖既有挂载关系/静态资源/多个资产完整引用；写回前必须保存备份并明确确认目标）。GIL 写回安全门：写回前必须展示并确认目标关卡、当前文件 hash、目标节点图或资产、候选文件、具体修改内容、备份位置、回滚方式；任何 hash 漂移、目标不明确或存在无法解释的差异都应停止。

#### 适用边界

来自验证与规则学习流程文档（validation-workflow.md，2026-08-03 校验，当前推荐流程）；真实编辑器单变化学习、手工同构重放、独立 Validator 裁决等配套方法见同文档；自动测试转绿≠编辑器导入/游戏行为正确是贯穿性约束

<!-- CLAIM:END clm_5105D81ADED6A1310E6CB7A690 -->
