// @gsts:signals

// v5 三层架构信号协议（2026-09 设计定稿）：
//   使用层 → 逻辑层：ball_kick / ball_impulse / ball_reset / ball_set_state（离散事件）
//   逻辑层 → 渲染层：render_now（IMMEDIATE 插队帧）；渲染常态走黑板自驱动 loop
//   逻辑层 → 全体：state_changed（真实变化才发，使用方靠它启停自身循环）
// 通道原则：离散事件走信号；连续流（带球每拍冲量）走黑板自定义变量（impVel/impSpin）。
// 注意：defineSignal 仅代码侧；游戏内生效需 assets:signals 三件套写回真实地图（见
// docs/architecture-v5.md 资产清单）。
import { defineSignal } from 'genshin-ts/runtime/core'

export const Signal = {
  // 低阶核心：施加冲量（速度加法叠加，clamp 24 m/s）
  //   mode 0=DEFERRED（入黑板队列，下一拍逻辑循环消费）
  //        1=IMMEDIATE（当拍积分 + 当拍渲染——触球/踢球即时反馈路径）
  //   IDLE 态收到即唤醒（自动状态分流 + 立即首拍）
  ball_impulse: defineSignal('ball_impulse', [
    ['vel', 'vec3'],
    ['spin', 'vec3'],
    ['mode', 'int']
  ]),
  // 高阶踢球：设定初速（覆盖式）。IDLE 起脚=完整施力；运动中=等效冲量叠加
  ball_kick: defineSignal('ball_kick', [
    ['vel', 'vec3'],
    ['spin', 'vec3']
  ]),
  // 复位：瞬移场地中心 + 清全部物理量 + 转 IDLE（幂等）
  ball_reset: defineSignal('ball_reset', []),
  // 高级：强制状态切换（裁判判罚/玩法传送/获得判定请求）。vel 为速度交接
  ball_set_state: defineSignal('ball_set_state', [
    ['next', 'int'],
    ['vel', 'vec3']
  ]),
  // 状态广播（逻辑层 stateChanged 唯一发送）：prev/next 为状态枚举值
  state_changed: defineSignal('state_changed', [
    ['prev', 'int'],
    ['next', 'int']
  ]),
  // 渲染插队帧：IMMEDIATE 冲量/kick 路径专用，渲染层当拍执行一次 renderFrame
  render_now: defineSignal('render_now', []),
  // v4 遗留信号（已退役，仅历史日志兼容保留定义；v4 图 fragment 化后无发送方）
  ball_dropped: defineSignal('ball_dropped', [['vel', 'vec3']])
} as const
