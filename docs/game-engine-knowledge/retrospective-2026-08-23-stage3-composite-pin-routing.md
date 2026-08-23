# 复盘：Stage3 复合 pin 路由两条谱系（shared-vendor 丢 data 输出路由 / legacy 丢列表节点 InParam）

> 状态：已定位 / 待修复（编译器层）
> 范围：rubik-3x3 真实地图注入后的「转动锁死」与「游戏拒载」；根因都在 Stage3 复合 impl 的引脚物化
> 证据：日志 2850（slot 空）、真实 .gil 回读（`assets:node-graphs read --composite 1610700026` 节点 3 无 InParam）
> 关联提交：d44b915（回退 legacy）

## 一、错误谱系

| # | 现象 | 后端 | 断点 | 后果 |
|---|---|---|---|---|
| 1 | 转动后锁死、胜利判定不跑 | shared-vendor-impl-graph | 复合 `view_turn_slot` 的 data 输出 `slot` → `view_turn_unlock_if_last` 的 data 输入 `slot` 丢路由；日志 `Equal IN0(slot)=空 vs IN1(turnLastSlot)=8/25` 恒 false | unlock 定时器永不注册 → `flow_after_turn` 0 帧 → lock 卡死 |
| 2 | 游戏加载拒载 | legacy | `view_turn_lookup` 内 `Get Corresponding Value From List (128)` 节点**整个 InParam 缺失**（只物化出 OutParam，connects=[]），4 处数据输入悬空 | 数据连线断开 → 加载期节点参数异常 |

## 二、证据（只读回读，非推断）

- 谱系 1：日志 `2026-08-23_22-00-07_2850` 帧
  `复合:view_handle_timer_event > view_handle_turn_core > view_turn_unlock_if_last > Equal | IN0:Integer= | IN1:Integer=8`
  （IN0 空）。
- 谱系 2：`gsts assets:node-graphs read --gil 1073741899.gil --graph 1610710026 --node 3 --json`：
  节点 3（genericId=128, concreteId=131）`pins=[{kind:4, index:0, connects:[]}]`——**无 InParam**；
  而 n=2/4/6/7/9 的 GetVar 节点 InParam[0] Str 正常。即 `GetCorrespondingValueFromList` 的
  InParam[0](list) 与 InParam[1](index) 未物化。

## 三、系统性根因（暂判）

1. **Stage3 复合 impl 的引脚物化有两套后端，且各自在「复合边界 pin」上有未闭合缺陷**：
   shared-vendor 丢「复合 data 输出→复合 data 输入」路由；legacy 丢「普通列表节点（128）的 InParam」。
   两条都踩在 compositePins / pin-hole remap 的「物理 pin 与 innerPinIndex 只 remap 一侧」问题上
   （见 `src/compiler/ir_to_gia_transform/AGENTS.md` 的 pin-hole 规则）。
2. 验证链盲区：编译/注入成功 + var-pins 检查（只看变量名 pin）**不覆盖**「普通节点 InParam 缺失」——
   `scan-gil-var-pins` 会通过，但真实数据连线是断的。

## 四、方法论教训

- 复合内「数据节点 InParam 缺失」要靠 `assets:node-graphs read --graph <implId> --node <n> --json`
  逐节点看 `pins[]` 是否含 InParam + connects；只看 `--composite` 概要会漏（概要只列 OutParam 不标缺失）。
- 后端 bug 要先判「哪套后端复现」再决定改代码还是切后端；切后端是兜底不是修复。

## 五、未闭合

- 谱系 1：已用 `options.stage3.vendorImplGraphBeta=false` 兜底，但 shared-vendor 的复合 data 输出路由 bug 未修。
- 谱系 2：legacy 下 `GetCorrespondingValueFromList` InParam 缺失未修，游戏仍拒载。
- 两套后端都要回归「复合 data 输出→输入」与「列表节点 InParam」的 pin 物化。

## 六、产出

- 提交 d44b915（回退 legacy，缓解谱系 1）。
- 本文档（谱系 1+2 记录）。
- open-items 登记（见 docs/maintenance/open-items.md）。
