// signals20.ts —— 票 20 E0/E0d 专用信号本地声明（2026-09-04/09-05）
// @status: active（E0/E0d 实验线信号）
// 文件级信号总表：
//   fb20_echo (tag:str, e:int)   E0 五问回传（RTAG1/CTIME/SUB_K…）
//   fb20d_echo(tag:str, e:int)   E0d 单次大循环校准（CAL_START/CAL_DONE）
// 注册 ID：fb20_echo=1610612783/784/785（已注册）；fb20d_echo 注册状态以真实回读为准。
// ⚠️ 本文件**新建**，不改 src-fb/signals.ts；编译期铁律：客户端信号图编译期从真实地图解析信号注册表，先注册再编译。
import { defineSignal } from 'genshin-ts/runtime/core'

export const Fb20Signal = {
  // E0 五问回传（tag 分语义，e=整数量；全程零 print，判读走帧流详情开窗）：
  //   'RTAG1' 角色侧技能变量跨施放计数（Q1 施放率 + Q4 隔离粒度双判据）
  //   'CTIME' getCurrentClientTimeHighPrecision().clientTimeMs（Q3 时钟行为）
  //   'SUB_K' 本拍子调度循环实际圈数（Q5）
  //   'SUB_DT' 本拍循环末累计耗时 ms（Q5 负载/预算）
  fb20_echo: defineSignal('fb20_echo', [
    ['tag', 'str'],
    ['e', 'int']
  ]),
  // 2026-09-05 单次释放大循环校准专用信号（与 E0 信号分开，避免污染 fb20c-server 计数）：
  //   'CAL_START' e=run id（客户端 start 入口发）
  //   'CAL_DONE'  e=实际循环圈数 k（大 finiteLoop 完成后发）
  // 真值：send=1610612786 monitor=1610612787 server=1610612788（候选分配，写回后核对）
  fb20d_echo: defineSignal('fb20d_echo', [
    ['tag', 'str'],
    ['e', 'int']
  ])
} as const
