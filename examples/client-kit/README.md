# client-kit —— 客户端计算通道（从足球 v5 抽离的整套逻辑）

> 状态：**新抽离 · 编译已验证**（2026-10-24）
> 来源：`examples/football/src-fb/`（v5 R2 线，2026-09-02~09-05 实战场）+ 复盘
> `docs/game-engine-knowledge/retrospective-2026-09-02-client-compute-lane-e1.md` /
> `retrospective-2026-09-03-e2-gate-open-negative.md` / `retrospective-2026-09-04-client-cross-offload.md`
> 读者：任何要把**计算搬到客户端**的人（足球 v3、魔方、以后的新玩法）

## 一、这套东西解决什么

服务端图跑不动高频计算（定时器粒度 ~0.09s、每拍读写镜像有 ~10/s 读向硬上限），
而「手感/物理/连续量」需要 15Hz 以上。做法是**计算搬到客户端自持跑，服务端只投递任务与落库结果**。

分工（用户口径，别再改）：

```
服务端：写任务 → （客户端算） → 收结果 → 写镜像变量      零计算
客户端：读任务 → 自持寄存器算一拍 → 回传结果（tag='P'/'T'）
```

## 二、七层契约（缺一层就静默降级）

| 层 | 谁提供 | 关键点 | 抽离后在哪 |
|---|---|---|---|
| 1 载体/触发 | 编辑器 + 技能配置 | 常驻高频=**造物 20008**（近距 15~16/s）；单次=角色 20002 | `loop.ts`（助手，图声明留场景） |
| 2 自持存储 | 技能变量（编辑器建） | **按施放实例隔离**；跨施放保持 + 同拍写读零延迟；一实例一 cfg | `channels.ts` chanWriteF/ReadF/Incr/Group |
| 3 任务邮箱 | 服务端实体变量 | `epoch/ack/sum/t1..t8`；**写序=载荷→sum→最后 epoch** | `protocol.ts` seqOpen/seqReadMail/seqAck；`server.ts` mailPost |
| 4 载荷编码 | 约定 | float 一律 **×1000 存 int**；任务类型放 t1 | `protocol.ts` fixDecode |
| 5 节拍/门控 | 服务端定时器 + 客户端每拍 | seqlock：二读 epoch + 求和比对；撕裂⇒本拍不应用 | `protocol.ts` seqReadMail |
| 6 回传 | 信号（注册到目标地图） | 6 参 vec3（上限 10）；`tag='P'` 提交 / `'T'` 撕裂 | `protocol.ts` sendCommit/sendTear/sendEcho |
| 7 落库 | 服务端接收图 | tag 门 → 快照门（tick 更大才收）→ 写镜像 | `server.ts` serverReceive + makeMirrorApply |

## 三、文件清单

| 文件 | 作用 |
|---|---|
| `channels.ts` | 原语库：自持存储读写/递增/批量、回传封装、轮询启动、门、身份分发（11 个） |
| `protocol.ts` | 邮箱协议：seqOpen / seqReadMail / seqAck、定点编解码、P/T tag、三种回传 |
| `server.ts` | 服务端半边：mailPost（含 sum）、mailRepublish（看门狗）、mailPending、serverReceive（门）、makeMirrorApply（复合） |
| `loop.ts` | 20008 骨架：拍号 + owner + 邮箱门 + `onTask`/`step` 两个钩子 |
| `selfcheck.ts` | **编译自证图**（toy 自由落体；占位 ID，禁止注入） |
| `gsts.kit.config.ts` | 编译验证配置（`--noinject`，不写游戏文件） |

## 四、硬约束（每条都是实测撞出来的，别试探）

1. **图声明写在场景文件顶层**：Stage 1 只展开**被编译入口**里的 `g.*` 调用；写在库文件里不展开（2026-10-24 实测：库内 `g.creationSkill` 静默 0 图）。
2. **库体内只用 `f.*` 算子**：库函数体不做 Stage 1 改写，原生 `+ - * /` 不会变成图节点；比较用 `f.equal / f.lessThanOrEqualTo`（注意是 `OrEqualTo`，没有 `lessThanOrEqual`）。
3. **库体内不建局部变量**：`f.localVariable().value` 在库体里拿到 pin 句柄，IR 阶段报 `Generic parameter not matched`。需要"读一次多处消费"时，把 `const l = f.localVariable('int'); l.set(x)` 写在**场景 handler 体**里。
4. **载荷按名字给（`mail.t1..t8`），不要数组下标**：场景文件写 `mail.t[0]` 会被 Stage 1 改写成"取 IR 列表第 i 项"，编译期拿到 `undefined`。
5. **客户端参数序与服务端相反**：`getCorrespondingValueFromList(iD, list)`；20008 **没有** getCurrentCharacter，取玩家用带参版。
6. **客户端图编译要用主配置**（entries 含全部图，`--noinject`）；单文件 entry 编客户端图报 ctxType 错。
7. **信号先注册到目标地图再编译**（编译期读注册表）；未注册=编译期或运行期静默失败。
8. **技能变量段按地图而异**：起始 1207959553，个数按地图实测（1908 只有 50 个）；引用段外编号=客户端读回 EMPTY。
9. **瞬发技能配置 = CD 0.01s + 忽略公共冷却**；模型选**小体型**（15~16/s，遗迹守卫 7.5/s）。
10. **距离节流**：施放频率随载体与玩家距离调制（贴玩家 15/s、中距 ~4/s、超射程 ~1/s）——常驻高频要把载体维持在玩家附近。
11. **一实例一 cfg**：同 cfg 并发写丢步；跨实例协调**结构性不可行**（技能变量按施放实例隔离）。
12. **高频回传要事件门控**：每拍都发信号 + 详情日志 = 洪泛被踢；观测信号只在状态变化时发。

## 五、已达成的下限与已判负（别重走）

- **读方向**（客户端读服务端变量/镜像）有 **~10/s 硬上限**；写方向（信号回传）几十/s 可用。
  ⇒ 锁步闭环实测天花板 ~8Hz；要 ≥20Hz **必须打破锁步**（客户端自持，正是本 kit 的形态）。
- 客户端图**不能写**实体自定义变量（全定义零命中）⇒ "客户端写实体变量→服务端读" 不可行。
- 客户端图**不能直驱运动器**（添加速度/旋转只有服务端节点）⇒ 回传→服务端挂运动器是唯一路径。
- 20008 图**局部变量不跨施放**（每拍复位）⇒ 一切跨拍状态走技能变量或实体变量。
- 图内时钟在 20002 单次施放内**冻结** ⇒ 循环计时靠服务端跨信号墙钟（见足球 `fb20d-calib`）。

## 六、验证怎么跑

```bash
# 1) 编译自证（不写游戏文件）
cd examples/client-kit
npm run build --prefix ../..            # 一次性：CLI 走 dist 单副本
node ../../dist/cli/gsts.js --config ./gsts.kit.config.ts --noinject

# 2) 断言产物（图存在 + 关键节点在位）
bash ../../scripts/check-client-kit.sh
```

> ⚠️ 用 `npx tsx src/cli/gsts.ts` 跑会踩**双副本**：入口 `.gs.ts` 的 `genshin-ts/runtime/core` 解析到
> `dist`，而 runner 自己的 registry 在 `src` ⇒ IR 永远是 `[]`（2026-10-24 实测）。
> 客户端图编译**必须用构建后的 dist CLI**。

## 七、移植到另一张地图（runbook，占位符表）

| 占位符 | 含义 | 从哪拿 |
|---|---|---|
| `<MAP_ID>` | 目标地图 | 现役图 |
| `<G20008>` `<G20007>` `<G20009>` | 三张客户端图 ID | `assets:node-graphs create --type ...` 分配 |
| `<CFG_SKILL>` | 28+瞬发技能配置 ID | `assets:skill-config create --template 28` |
| `<SIG>` | 回传信号（6 参 vec3） | `assets:signals register --param tag:str --param tick:int ...` |
| `<SLOT>` | 技能变量段起点 | 编辑器「技能变量管理」建，段按地图而异 |
| `<MAIL_*>` | 邮箱变量名（epoch/ack/sum/t1..t8） | 实体自定义变量，需预注册 |
| `<MIRROR_*>` | 镜像变量名（tick/pos/vel/spin/state） | 实体自定义变量 |

1. 只读盘点现有资产（技能变量段、单位状态、信号）——**别让用户白建一遍**。
2. 注册信号 → 建四张图占位（20008/20009/20007/20000 监听）→ 技能配置 → 实体变量预注册。
3. 场景文件照 `selfcheck.ts` 的形状写：顶层 `g.creationSkill(...).on('start', (e,f) => loopTick(f, {...}))`，`step` 里放真正的数学。
4. `dist` CLI + 主配置 `--noinject` 编译 → 断言 → 注入 → 用户近距试玩 → 日志判读（`f8=2097154` 客户端记录 + 服务端 onSignal）。

## 八、这次抽离**没有**包含什么

- **物理/玩法内核**（六态积分、碰撞、门框几何、带球控制器）留在场景侧：它们与玩法强耦合，抽成库只会变成参数地狱。参考实现=`examples/football/src-fb/fb-phys2.ts`（812 行，头部有完整接口契约）。
- **造物三图模板**（20007/20009 与造物配置）：已在 `client-nodegraph-development` 技能 `references/creation-path/`，不重复。
- **五D seqlock 完整寄存器组 / 五E 原生写通道**：见同技能 §五D/§五E 与 `references/native-write-channel/`。
