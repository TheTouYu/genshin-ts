# Signal registration and extraction (assets:signals tool + GIL encoding)



<!-- CLAIM:START clm_747B855B2F15D8CF565A95D92D -->

### Signal registration tool chain: cloning pool, auto-assigned IDs, safe writeback, extraction linkage

gsts assets:signals 向地图 GIL 注册新信号：参数布局来源两路——①提供 --template-signal（可配 --template-gil 独立 donor）时从模板信号按参数类型克隆条目；②省略时使用内置参数布局表（字节 100% 来自编辑器真实信号，覆盖 str/int/float/bool/vec3/entity/guid/prefab_id/config_id 及全部列表类型；新鲜地图 pin 基址与编辑器一致：str=12/34/40、int=68/76/83 等；同地图内复用已有类型的基址）。str 同型重复按 send+4/mon+1/ser+1 自动递增（编辑器实证）；非 str 同型重复无编辑器布局证据，fail-closed 要求 donor。省略 send/monitor/server 节点 ID 时自动从当前最大占用 +1 连续分配（信号 ID 段 0x60000000，内置定义占用 1610612738..1610612740）；--write 前校验源 SHA、自动备份到同级 .gsts/backups/、写入前做结构回读验证；写回成功后自动提取 src/resources/signals.ts（与 inject 流程共享 readRegisteredSignalsFromGil 解析器）。端到端已验（2026-08-15）：真实无信号地图副本从零注册全流程通过；游戏核验通过（2698 日志）：内置布局注册的 verify_ping2 在真实地图 1073741888 上复合内 sendSignal 发出、图级 onSignal 接收、str 参数正确（3 次 tab 全通）。

#### 适用边界

证据链：自动回归（tests/signal_registration_builtin.ts 字节对比 donor==builtin）+ 真实地图副本端到端 + 真实地图注入 + 游戏日志核验（2698）；不包含修改已有信号（未实现）；编辑器 pin 分配算法细节未完全闭合（仅新鲜地图规范基址与同地图复用规则有实证）。

<!-- CLAIM:END clm_747B855B2F15D8CF565A95D92D -->

<!-- CLAIM:START clm_EB98A0BAEA640B8ECB6577B16C -->

### Signal registration encoding: index entry plus three GraphUnit definitions

地图 GIL 信号注册编码 = field5 注册索引条目（f1 send 身份 / f2 monitor 身份 / f3 名称 / f4 参数 / f6 计数 / f7 server 身份）+ field2 三份 GraphUnit 定义（send/monitor/sendServer；编辑器插在图1定义之后，工具追加末尾，protobuf 顺序无语义影响）；注册索引 f4/f5/f6 引用定义参数条目的 f8 pin 编号；f8 pin 每定义局部（全图重复属正常）；每信号参数上限由 PARAM_TYPE_CODES 决定（已扩至 20 种：普通 + _list 变体，新增 faction/config_id/prefab_id 及其 _list）；同类型参数可按模板池多次出现，工具据此克隆 f8 条目。

#### 适用边界

证据为真实 GIL 观察 + 编辑器保存字节对比 + 游戏内验证；不解释定义侧 f3/f4 类型编码细节（含列表嵌套 102 字段，工具克隆条目无需理解）。

<!-- CLAIM:END clm_EB98A0BAEA640B8ECB6577B16C -->

<!-- CLAIM:START clm_5A9BAF613A81B6EFA775598714 -->

### 新增信号的双注册工作流：地图 .gil 注册是编译硬前置（2026-08-31 足球 state_changed 实证）

在 Genshin-TS 里新增可编译的信号需要两级注册且顺序固定：(1) TS 侧 resources/signals.ts 加 defineSignal 只定义编译期 schema；(2) 目标地图 .gil 必须先用 `gsts assets:signals register --map-id <id> --name <名> --param <名>:<类型> [--template-gil <donor地图> --template-signal <名>] --write` 注册出 send/monitor/server 三节点 ID——编译器从目标地图读信号注册表（createSignalRegistry(readRegisteredSignalsFromGil)），未注册直接报 'signal is not registered in target map' 编译失败。register 子命令只认 --map-id/--gil 不认 --config；重复非 str 参数（如两个 int）受 builtin 每类型单布局限制，必须从其他地图找含 ≥2 个同类型参数的信号做 donor。模型侧验证可用 GSTS_LOCALLOW_DIR 指向地图副本目录树，在副本上 register+编译+decode 核验完全不碰真实游戏文件，通过后再打包申请正式注册+注入。

#### 适用边界

适用于 Genshin-TS gsts CLI 信号工作流（2026-08-31 state_changed 注册实证：donor=rubik3x3_solve，send/mon/srv=1610612753/754/755）。不覆盖信号编码 wire 细节（见 signal-node-instance-encoding 族 claim）；正式注册/注入写真实地图仍需用户确认（破坏性操作边界）。

<!-- CLAIM:END clm_5A9BAF613A81B6EFA775598714 -->

<!-- CLAIM:START clm_93DF427F6ABE72F3EDD55B4B6A -->

### 同型重复信号参数：field2=全局序号、n4=类型模板、pin=计数器副产物引擎不校验（fail-closed 作废）

2026-09-02 四轮编辑器差分（地图「模型比对」1073741849，用户连续会话原子操作，evidence ~/genshin-ts-evidence/node-graph-logic/signals/2026-09-02-repeat-param-pins/ raw/R1-R4+SHA）：① n3 field2=参数全局序号，跨类型连续（send/ser 0-based 省略 0；monitor=3+序号），同型重复参数不例外——R4 混合 float,float,int,int 序号 0-3 铁证；② n4=纯类型模板字节，与参数序号/信号无关；③ 编辑器 pin 分配=内部全局计数器副产物，无固定步长公式（R1 send 89/111/121/127/170 乱跳而 mon/ser 连续、R2 追加参数 mon+52/ser+47、R3 新建信号三空间各自连续块且起点=R2 最大号 230+1，连续保存排除会话重置解释），旧「str send +4k」系 cube_turn 复制巧合非规则；④ 引擎不校验 pin 数值——跨信号共享 pin（工具_全参数/工具_混合共享 90/109/122）、编辑器任意新号（ts_d 系列）、跨地图抄号（cube_turn 1849→1848）均游戏正常；⑤ 编辑器新建信号/加参数=每参数开新槽，复制信号=保留原槽引用；⑥ 同信号定义内 pin 唯一是编辑器恒定形态，CLI 保守约束为同信号参数 pin 互不相同（跨信号共享有先例，同信号内共享无先例且未验证）。工程结论（commit e231402）：mergePoolFor 删除非 str fail-closed 并新增 dedupeByPins 共享槽去重无条件回写、builtinTemplatesFor 步长统一 +1k，任意同型重复参数无需 donor 即可注册；回归 signal_registration_builtin/repeated_type 全绿。真实地图写回：cli_debt_test（2 float+1 int，speed=[90/109/122] 复用编辑器槽、delta=[127/176/182] 去重取下一真实槽）已 --write 写回 1073741849（SHA 430bf31d，Temp 已同步），编辑器显示与游戏行为待用户核验。

#### 适用边界

仅覆盖信号注册定义参数槽（三份 CompositeDef #102/#103 参数条目与注册表条目 f4/5/6 pinIndex），不推广到 Composite 普通参数或图内节点 pin；证据层级=真实编辑器相邻快照（结构层）+ CLI 回读断言 + 自动回归；「引擎不校验 pin 数值」含历史游戏正常旁证（工具_系列/cube_turn 跨地图），但 CLI 生成候选的编辑器导入与游戏行为在录入时待用户核验

<!-- CLAIM:END clm_93DF427F6ABE72F3EDD55B4B6A -->
