# 造物技能路径资源包（2026-08-31 首验通过，1915）

完整可抄资源 + 全链 runbook。成功链路：**复杂造物（小体型模型）→ 决策图(20007) → 状态图(20009)
executeSkill → 造物技能(28+瞬发) → 20008 客户端图 → 信号回传服务端**，稳态 **15~16 次/秒**。

## templates/（照抄起步，改占位符）

**基础 5 件套 `templates/zaowu-basic/`**（与仓库 `verify/zaowu-client/` 工作版本同源）：

| 文件 | 作用 | 必改占位符 |
|---|---|---|
| `signals.ts` | 回传信号定义 | 信号名 zaowu_probe（register 时同名） |
| `zaowu-decision-graph.ts` | 20007 决策图：无条件切换状态 | 图 ID 1082130438、状态图 configId 1082130437、模板序号 1 |
| `zaowu-status-graph.ts` | 20009 状态图：executeSkill(序号) | 图 ID 1082130437、技能序号 1 |
| `zaowu-skill-graph.ts` | 20008 技能图：读参→计算→发信号 | 图 ID 1082130436、信号名、参数字面量 |
| `zaowu-server.ts` | 服务端监听图（挂载关卡实体） | 图 ID 1073741830、信号名 |
| `gsts.zaowu.config.ts` | 隔离编译配置（dist-zaowu，批量注入按 .gia 内 ID 路由） | mapId 1073741915 |

**可靠性层 `templates/zt-lane/`**（六件套：seqlock 门控/dispatcher/邮箱生产者/信号/配置）——
多变量批量任务/并发写者才需要，见 SKILL.md 五D 与下文「计算通道同步机制」节。

## 全链 runbook（每步的命令与纪律）

### ① 只读盘点（动任何东西之前）
```bash
MAP=$(ls /mnt/c/.../Beyond_Local_Save_Level/<mapId>.gil)
sha256sum "$MAP"; npx tsx tools/list-gil-node-graphs.ts "$MAP"   # 图清单+客户端段 max
npx tsx tools/list-gil-skill-configs.ts "$MAP"                    # 技能配置
node bin/gsts.mjs assets:signals inspect --gil "$MAP"             # 信号
node bin/gsts.mjs assets:mounts list --gil "$MAP"                 # 挂载（服务端图必须挂实体才跑）
```
客户端图新 ID = 客户端段（1082130433+）max+1；服务端图 = 服务端段 max+1。

### ② CLI 资产写入（先干跑 --output 再 --write；编辑器/游戏必须关闭）
```bash
node bin/gsts.mjs assets:signals register --gil "$MAP" --name zaowu_probe \
  --param tag:str --param val:str --write        # 三元组自动分配，inspect 核布局
node bin/gsts.mjs assets:node-graphs create --gil "$MAP" --type 20008 --graph-id <A> --name _GSTS_xxSkill --write
node bin/gsts.mjs assets:node-graphs create --gil "$MAP" --type 20009 --graph-id <B> --name _GSTS_xxStatus --write
node bin/gsts.mjs assets:node-graphs create --gil "$MAP" --type 20000 --graph-id <S> --name _GSTS_xxListen --write
node bin/gsts.mjs assets:skill-config create --gil "$MAP" --id <28段ID≥1191182337> \
  --name <技能名> --template 28 --skill-type instant --graph-id <A> --write   # root20 联动自动
node bin/gsts.mjs assets:mounts attach <关卡实体1094713345> --graph <S> --entity --gil "$MAP" --write
```
20007 决策图同命令创建（2026-09-02 接入）：`assets:node-graphs create --gil "$MAP" --type 20007 --graph-id <D> --name _GSTS_xxDecision --write`（自动节点与 20009 同族 200126/4000+f11，folderId 58/6600，1915 同构验证）；编辑器手建的默认名图注入前仍需 patch graph-clear。

### ③ 源码回填真实 ID → 编译（--noinject）
改 templates 里的图 ID/信号名/configId → `node bin/gsts.mjs -c gsts.zaowu.config.ts --noinject`
（config 的 inject.mapId 必须指向目标地图——信号注册表从真实地图解析）。
**⚠ 编译前置铁律（2026-09-01 足球会话实证）**：信号必须已用 `--write` **真实写回地图**——
干跑 `--output` 候选不算，干跑状态下编译直接报信号编码错误，白烧一轮。

### ④ wire 断言（编译 ≠ wire 正确）
`npx tsx tools/decode-gia.ts dist-zaowu/.../*.gia -o /tmp/x.json` 逐图核对：
**节点通常在 `.graph.graph.inner.graph.nodes[]`，类型在 `genericId.nodeId`**（先照这条路径取，
别上来徒手逐层 keys() 探测；完整 playbook 见 gil-node-graph-reading 技能 Step 3.5/3.6）。
20008=开始节点(200042)→发信号节点（genericId=信号 server 身份 ID）+参数字面量；
20009=入口(200126)→execute_skill(技能序号字面量)；20007=入口(200126)→switch(configId=状态图ID)。
**字节模式断言先用正样本回测模式**（f11 块 = `5a 07 08 01 a2 06 02 08 01`，f100 键是 a2 06 不是 a0 06）。

### ⑤ 注入（用户确认 + 编辑器/游戏零重叠）
- 批量：`node bin/gsts.mjs -c gsts.zaowu.config.ts`（按 .gia 内 ID 路由）。
- 坑①安全门拒"非空且非 _GSTS 名"图（编辑器建的默认名图）→ 先
  `assets:node-graphs patch --graph <id> graph-clear --write` 再注入（注入器自动改名 _GSTS_*）。
- 坑②单文件注入被 config.nodeGraphId 路由劫持 → 用批量。
- 坑③注入后**手动核对/同步 Temp 副本**（BeyondLocal/../Temp/<mapId>.gil 与主图 md5 一致）。

### ⑥ 注入后检查（verify-injection 纪律）
`check-gil-composite-refs <map> --incoming <gia>` ×N = 0 悬空；top10 内部 f5 后保留 (7,0)；
`parse-gil-node-graph --graph <id>` 语义回读节点链；`list-gil-node-graphs` 节点数符合。

### ⑦ 用户编辑器配置（一次性 ~2 分钟，这是唯一的人工环节）
1. 元件库 → 复杂造物 → **选小体型模型**（带宽=模型！打手丘丘人级 15~16/s，遗迹守卫 7.5/s）→ 放出生点附近
2. 造物技能管理 → 引用技能（**记序号**，对应 executeSkill 参数）→ CD：冷却组 0.01s + 勾忽略公共冷却
3. 自主逻辑参数 → 新增模板_1 → 初始生效（对应 switch 第三参）
4. 特化配置 → 造物状态决策节点图 → 选 CLI/编辑器建好的 20007 图
5. 保存并完全关闭编辑器

### ⑧ 用户测试 → 日志定论
- 服务端 f22：armed 打点 + 每次施放的信号参数打印（**最轻量观测面**，关详情日志也有效）
- 客户端记录：**20008 图族 f8=4194308(0x400006)**（≠20002 族的 2097154）；详情日志
  **按图开**（编辑器逐图开关，只开目标 20008 图）——2026-09-02 足球 1908 会话定论：
  - 服务端图**不用开**：f22 打印关详情也有效（开详情也只多帧明细，无新增结论）
  - 同链 20009/20007 **不用开**：与 20008 同一触发链同频率，纯重复记录
  - 地图上旧高频 loop 图**勿开**：详情日志洪泛风险（football 2026-08-31 全量日志被踢教训）
  - 测试时长 ~30s 即可；游戏卡顿提前退出，已落盘部分够用
- 频率核对：`f8=4194308 条数 ÷ 会话秒数`——小体型模型应 **15~16/s**（CD 配置到位时）；
  ≈1/s = 施放被冷却卡住（查冷却组 0.01s / 勾忽略公共冷却）；0 = 图未随技能触发（查决策图绑定）

## 带宽与配置速查（2026-08-31 定论）

| 项 | 值 |
|---|---|
| 频率上限 | 模型施法占用决定：小体型 ≈4 帧/次=**15~16/s**（近距离）；遗迹守卫 ≈8 帧=7.5/s；**玩家离造物远时引擎距离节流降频**（1908 实测远距 4~5/s，拖近恢复）——造物须放玩家活动范围内 |
| CD 配置 | 冷却组 0.01s + 忽略公共冷却（之后 CD 不再是瓶颈） |
| 三重冷却 | 公共+技能+冷却组全满足才释放（实体槽 81 外层 f2=公共冷却） |
| 拆分算力模式 | 服务端写变量（任务）→ 本路径 15Hz 客户端计算 → 信号回传；每逻辑一张 20008 图 |
| 互换性 | 编译的 20007 图可直接嵌入第三方造物资产（实测跑满 15~16/s） |

## 计算通道同步机制（zt-lane 模板，2026-08-31 两轮验证）

拆分算力模式的**生产级形态**：N 个任务变量怎么保证客户端读到的是"同一代、完整的"快照，
以及多生产者并发时不丢任务。机制=seqlock 门 + 单写者 dispatcher，实测 **~5 任务/秒、
11/11 零丢失零撕裂**。原理/纪律/判读速查见 SKILL.md 五D 章；模板 `templates/zt-lane/`
（门控图 zt-client / dispatcher zt-main / 邮箱生产者 zt-pa、zt-pb / signals / 编译配置）。

改占位符起步（zt-lane 版）：

| 占位 | 位置 | 换成 |
|---|---|---|
| 图 ID | zt-client 1082130436 / zt-main 1073741830 / pa、pb | 目标地图实际分配 ID（CLI 建空图后回填） |
| 变量前缀 zt*/ztq_*/zt_dsp_* | 全部文件 + 变量注册清单 | 多通道时每通道独立前缀 |
| 载荷公式 pe*1000n+i(+off) | publish/哈希闭式解两侧 | 业务值（**必须保持随 epoch 严格单调**，求和门才确定性） |
| 信号 zt_echo(tag:str,e:int) | signals.ts + 地图注册 | 每通道独立信号（(str,int) 布局免 donor） |
| 邮箱挂载实体 | pa/pb 与 dispatcher 同实体挂载 | 保持同实体（轮询读自己实体变量） |

信号注册注意：**重复的非 str 参数类型必须提供 donor**——双 int 布局会被 fail-closed，
用 (tag:str, e:int) 找现成同构信号当 donor（1916 d2cv）。三参 (str,int,int) 实测可注册
（足球 fb_echo 1610612771/772/773，2026-09-01）——多 int 需 donor 的口径不变。

**紧凑变体（2026-09-01 足球最小通路实证）**：dispatcher 可并入服务端监听图（fb-server
一张 20000 图 = 1s 轮询 + 4s 看门狗 + onSignal，79 节点，挂关卡实体）——比 zt-lane 三图分离
（zt-main 独立）更省图位，任务量小时优先用；20008 门控图缩到 34 节点（seqlock 门+图内
计数器）可行。同表面积下的取舍：并图省资产、分图好隔离排障。

## 证据与工作版本

- 工作源码：`verify/zaowu-client/`（5 件套）+ `gsts.zaowu.config.ts`；
  同步机制版 `verify/zt-lane/`（6 件套）+ `gsts.zt.config.ts`
- 证据链：`~/genshin-ts-evidence/zaowu-creation-skill/notes/manifest.md`（三轮差分+注入+大佬资产对比）；
  同步机制 `docs/game-engine-knowledge/retrospective-2026-08-31-compute-lane-sync.md`（日志 3062/3064/3067）
- 进度与实验记录：`examples/rubik-3x3-client/PROGRESS.md` C 线 C0~C0.7
