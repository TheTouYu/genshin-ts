# 通道原语接口 v1（票 19 复用层，2026-09-03）

> 依据：票 14/18 实测（技能变量闭环/信号 52.9/s/HP 事件/轮询/多实例分支）+`19-codec-protocol.md`。
> 定位：**通道语义原语库**（写/读回/节拍/身份四类）——零场景专有耦合，足球语义只允许出现在调用层。

## 原语清单

### ① 写原语（客户端自持存储——锁步破除核心）

| 原语 | 签名 | 引擎约束（实测依据） |
|---|---|---|
| `chanWriteF` | `(f, cfgId: bigint 字面量, value: number) => void` | cfgId **仅字面量**（assertClientLiteralValue，14 票编译实证）→ 参数必须常量传入编译期展开 |
| `chanReadF` | `(f, cfgId: bigint 字面量) => number` | 同上；同拍写读零延迟（14-criteria R1） |
| `chanIncr` | `(f, cfgId: bigint 字面量) => bigint` | 读改写递增；跨施放保持（R1 实证）；**多实例并发写同 cfg 会丢步→一实例一 cfg**（18-design 竞态规避） |
| `chanWriteF32Group` | `(f, cfgBase: bigint[字面量表], values: number[]) => void` | N 分量批量写（多分量状态映射用，N≤10/实例——codec §1） |

### ② 读回原语（服务端收到数据的路径）

| 原语 | 方向 | 签名 | 引擎约束 |
|---|---|---|---|
| `chanSendScalar` | C→S | `(f, signalRef, tag: str 字面量, e: int) => void` | 信号参数 (str,int) 免 donor；tag 字面量；52.9/s 并发实测 |
| `chanSendState6` | C→S | `(f, signalRef, tag, tick:int, pos/vel/spin: vec3, state:int)` | 6 参形态（vec3 信号先例，见依据节）；参数上限 10 |
| `chanOnHpPulse` | S | 挂载约定：读回图挂目标实体 + `on('whenHpIsRecovered')` | 事件=结算型写入脉冲；53/s 实测；满血钳制→配 drain 循环 |
| `chanPoll` | S | `(f, entity 字面量, timerName, intervalS≥0.09, reader)` | **引擎定时器实测粒度 ~0.09s**（O-2026-09-03-05）→轮询上限 11/s；entity() 必须字面量（fb-server 铁律） |

### ③ 节拍原语（施放节拍=引擎侧，编辑器配置约定）

| 原语/约定 | 内容 | 依据 |
|---|---|---|
| 编辑器配置约定 | 28 模板瞬发 + CD 0.01s + **忽略公共冷却**（缺一被钉 ~1/s） | 五C 定论+R1 15/s 实测 |
| 距离约定 | 施放节流=每造物独立 ~15/s 近距 / 4-5/s 远距 | 18-criteria R2（独立实证） |
| `chanGate` | `(f, taskVar: str, on: 0|1)`——任务开关（可选，实验常开可省） | 变量预注册红线（客户端读需注册） |

### ④ 身份原语（多实例区分）

| 原语 | 签名 | 引擎约束 |
|---|---|---|
| `chanSelfId` | `(f) => guid` | queryGuidByEntity(getSelfEntity()) 包装 |
| `chanDispatch` | `(f, guid, ids: bigint[字面量表], handlers[]) => void` | 嵌套 doubleBranch+equal；**ids 逐字面量比较**（450 显式 equal 教训：else 空防陌生实例污染，18 票门禁实证） |

## 复用层载体与实现约束

- **形态**：跨文件函数库（`import { chanWriteF } from './channels.js'`）——受限 TS 函数内联展开
  （fb-phys dv/b2f 同文件先例；**跨文件函数 import 为待验证项**，编译门禁把关，失败则退化为
  同文件函数段+文档化模板）
- **禁入**：接口层不得出现场景词（球/物理/踢球）——调用层负责语义装配（codec §1 十分量映射）
- 服务端原语依赖预注册资产：信号三元组/实体变量/timer 名（调用层资产清单管理）

## 示例调用形态（物理状态一拍，调用层视角）

```ts
// 客户端图 on('start')（节拍=施放，15/s/实例）
const st = chanReadGroup(f, CFG)              // 10 分量读（codec §1 映射）
const next = integrate(st, dt)                // 调用层物理内核（票 19 红线：内核零改动）
chanWriteF32Group(f, CFG, pack(next))         // 自持存储（零延迟）
chanSendState6(f, Sig.state, 'P', next.tick, next.pos, next.vel, next.spin, next.state)  // 回传服务端
```

## 验收自检（本小类）

- 原语 12 个（写 4/读回 4/节拍 3/身份 2-1）全带入出参+引擎约束 ✅
- 零足球耦合：grep 验证（接口文档+未来实现文件，见打卡前 grep 输出）
