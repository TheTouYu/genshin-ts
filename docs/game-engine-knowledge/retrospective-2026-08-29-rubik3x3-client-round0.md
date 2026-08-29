# 复盘：魔方 3x3 客户端计算改造第 0 轮——基线复制与两条环境/工具链发现（2026-08-29）

> 范围：第 0 轮（examples/rubik-3x3 → examples/rubik-3x3-client 基线复制 + 可运行核验 + PROGRESS 初稿）。
> 视角：跨会话任务开局的方法论（复制自洽化、基线证据分层、并发工作区下的可信验证）+ 两条新发现（K-01 客户端 DSL 测试链断裂、R-01 项目级构建与 examples/*/dist 冲突）。
> 证据：提交 faac6fe（72 文件新建）；命令与退出码见 examples/rubik-3x3-client/PROGRESS.md §0.2/0.3；
> 地图 1073741914（用户复制魔方3x3_1，SHA 未记，大小 793972B 与 1073741899 一致）。
> 状态：已完成（本轮仅模型侧证据；游戏核验自第 1 轮起）。

## 一、错误谱系总览

| # | 层 | 具体错误 | 根因 | 修复 | 记录位置 |
|---|---|---|---|---|---|
| 1 | 工具环境 | quicktest 失败被误读为成功（"completed exit 0"） | `npm run x 2>&1 | tail` 管道退出码 = tail 的 0，掩盖 tsc 失败；且 task-retrospective 技能已明文禁止 grep|tail 判退 | 改用 `cmd > log 2>&1; echo $?` 或 set -o pipefail 重跑 | 本复盘 |
| 2 | 工具环境 | run_code 模板里写 `${PIPESTATUS[0]}` 被 JS 求值炸掉 | 忘了命令串先经 JS 模板插值，bash 变量不应出现在 ${} 中 | 退出码单独一行 `echo $?` | 本复盘 |
| 3 | 环境判断 | 误以为基线构建失败是并发会话编辑导致的瞬时现象 | 部分属实（语法错误确系瞬态），但另有一层稳定的预存问题 R-01（tsconfig 收编 examples/*/dist/*.gs.ts） | 用 git worktree 在 HEAD 干净副本 + 预置 dist 复现区分两层 | 本复盘 + PROGRESS §0.4 |
| 4 | 编译器层发现 | K-01：assert-client-ts-transform.ts 对含信号节点的客户端 IR 调 irToGia 未传 signalRegistry，命中 client_graph.ts:1248 硬错误 | 55437d4 起编译器强制"信号节点必须绑定目标地图信号注册表"（正确生产行为），测试脚本未同步 | 未修（记录 + 最小复现 = 该断言本身）；修复方案拟第 1 轮 | PROGRESS §0.3 + 本复盘 |

## 二、K-01 完整调查链（本轮最重要发现）

1. **现象**：客户端 DSL 测试链 11 项中 10 项 ok，`assert-client-ts-transform.ts` exit 1，
   报 `signal registry is required when encoding signal nodes`（src/compiler/ir_to_gia_transform/client_graph.ts:1248）。
2. **定位**：脚本第二阶段对 7 个子类型 fixture 文档逐个 `irToGia(document, { protoPath })`（无 signalRegistry 选项）；
   fixture 文档含 send_signal_to_server_node_graph 用法（collectClientSignalUsages 非空）→ 命中硬错误。
3. **归因**：client_graph.ts 该行为来自 55437d4「fix: support cross-map signal registration and injection」——
   客户端信号节点必须注册目标地图真实信号三元组（名/参数 schema/引脚身份），编译期无注册表 = fail fast，
   这是**正确的生产约束**（本任务第 2+ 轮发送信号正需要它）；断言脚本未同步，属测试基建漂移而非编译器 bug。
4. **同族扩展**：grep 全部 `scripts/client-nodegraph/*.ts` 的 irToGia 调用点——无一引用 signalRegistry；
   smoke-send-signal.ts 独立存在但未接入任何 npm script 且无 registry 构造模式。
   结论：K-01 修复时需在脚本内用 `createSignalRegistry`（src/compiler/signal_registry.ts）为 fixture 信号
   构造最小注册表并传入所有受影响调用点（第 353 行起多处），而非只补单点。
5. **影响**：`npm run test:client-transform` 整链第一步即断，客户端 DSL 相关回归目前无法一键全绿；
   第 1 轮修复后本任务才能以"测试链全绿"作为每轮基线。

## 三、为什么反复出问题——系统性根因

1. **管道退出码与"任务节奏"的冲突**：仓库已有明文规则（task-retrospective：禁止 grep|tail 判退），
   但"顺手 tail 看尾行"的习惯在长输出场景下极易复发。规律：**任何"跑完即判"的命令先用裸退出码，
   tail 只用于事后阅读**；DSH 环境里后台 job 的 exit code 也只看管道最后一个命令，同样的坑会在
   run_in_background 复现。
2. **并发工作区下的证据可信度需要"隔离重放"**：共享工作树被另一任务实时编辑时，单次失败无法归因；
   用 `git worktree add --detach <dir> HEAD` + 符号链接 node_modules + 按需预置 dist 做干净重放，
   可以一次性拆开"瞬时编辑态"与"稳定的预存问题"两层，本次 R-01 就是靠它才说清。
3. **"复制即基线"要先自洽化再对比**：直接 diff 原版/复制版 dist 会出现三类预期差异——
   旧 dist 残留文件（precompute.gs.ts 等历史死代码）、绝对路径元数据（entryFile/location）、
   生成表头注释中的旧路径。先重建原版 dist、再按 `gia-compare`（结构级）而非字节 diff 对比，
   9/9 结构一致才是"复制版可运行"的合格证据。

## 四、流程与方法论教训

- **有用**：`gia-compare -q` 批量结构对比 9 个 GIA 对，一次拿到"语义等价"铁证（复合/节点/数据边/执行边/参数 5 维全一致）。
- **有用**：读图前先 list-gil-node-graphs 核实克隆地图的图 ID——1073741914 与原图 9 张图 ID 完全一致，
  第 1 轮注入目标无需重映射。
- **有用**：把复制版的旧路径引用（生成表头、工具用法）一次性 sed 改写为新目录，复制版才自洽可再生成；
  代价是 .gs.ts 出现注释级差异，已在对比口径中说明。
- **绕路**：试图在主工作区直接拿"干净基线"反复重跑 build（约 2 轮），实际应先做 worktree 隔离重放。
- **未落盘**：open-items.md 正被变量系统任务并发编辑，K-01 条目暂缓登记（避免写冲突），
  待其收尾后按 O-2026-08-29-01 补登。

## 五、风险探索与未闭合项

- K-01（详见 §二）：第 1 轮修复 assert-client-ts-transform.ts（fixture 信号最小注册表 + 全部受影响调用点）。
- R-01：项目级 `npm run build` 当前无法通过——tsconfig include 收编 examples/*/dist/*.gs.ts
  （预存问题：原目录 dist 同样报 101 错误；本次复制版 dist 已清理不新增噪声）；另外 HEAD 干净副本
  + 预置 dist 下仍报 examples 源文件的 src/dist 双实例品牌冲突。修复（tsconfig exclude examples/*/dist
  或示例导入归一）不属于本任务范围，建议单独立项；quicktest 待变量任务收尾后复跑。
- 参考地图两条 PKC claim（clm_D1A2082…、clm_CAE3053…）仍为 unconfirmed——正是本任务要实测确认的对象。
- 本轮无新增引擎事实，未做 PKC capture（避免未证实 claim 入树）。

## 六、产出清单

- 代码/资源：examples/rubik-3x3-client/ 72 文件（提交 faac6fe，含 PROGRESS.md 初稿、mapId 更新、
  路径自洽化改写）。
- 基线证据：主+relay 配置各 9 GIA 编译 exit 0；gia-compare 9/9 结构一致；客户端 DSL 测试链 10/11 通过。
- 文档：本复盘 + examples/rubik-3x3-client/PROGRESS.md。
- 未提交：open-items 补登（待变量任务收尾）、K-01 修复（第 1 轮）。
