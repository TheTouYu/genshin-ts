// 3×3 魔方自动复原求解器节点图（独立图，id 1073741828）
//
// 职责：读主图发布的逻辑状态 → CFOP 自动复原（十字查表 / 角块 / 第二层 / OLL 小BFS / PLL 查表）
//       → 输出扁平 game moveId 序列 → 逐条 signal solve_move，等待主图 solve_ack。
// 内部状态 = CubeLib 约定：角 0..7=UFR..DBL、棱 0..11=UF..BL；move code 0..17 见 cfopTables。
// 负载：所有长循环（>20 步）走定时器分片（solveTick），单 tick 只推进一小步。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { RubikSignal } from './signals.js'
import {
  CF_MOVE_CODE_FACE, CF_MOVE_CODE_CNT,
  CF_X_MACRO_LEN_c0, CF_X_MACRO_C0_c0, CF_X_MACRO_C1_c0, CF_X_MACRO_C2_c0,
  CF_X_POLICY_c0, CF_X_POLICY_c1, CF_X_POLICY_c2, CF_X_POLICY_c3,
  CF_PLL_SIG_c0, CF_PLL_SIG_c1, CF_PLL_SIG_c2,
  CF_PLL_ACT_c0, CF_PLL_ACT_c1, CF_PLL_ACT_c2,
  CF_PLL_ALGLEN_c0,
  CF_PLL_ALG_c0, CF_PLL_ALG_c1, CF_PLL_ALG_c2, CF_PLL_ALG_c3,
  SC_FCORNER_FROM_c0, SC_FCORNER_TO_c0, SC_FCORNER_TWIST_c0,
  SC_FEDGE_FROM_c0, SC_FEDGE_TO_c0, SC_FEDGE_FLIP_c0
} from './cfopTables.js'

const graph = g
  .server({
    id: 1073741828,
    variables: {
      // —— solver 内部逻辑状态（CubeLib 约定）——
      scp: [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n],
      sco: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      sep: [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n],
      seo: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      // 中转：面转两阶段读写
      tcp: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      tco: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      tep: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      teo: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      // —— 输出序列 ——
      solveLen: new int(0),
      solveIdx: new int(0),
      solveBuf: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      // —— 阶段机 ——
      phase: new int(0), // 0 idle / 1 cross / 2 corners / 3 second / 4 oll / 5 pll / 6 emit / 7 done
      step: new int(0),
      iter: new int(0),
      // —— 十字/BFS 状态杂项 ——
      tmpA: new int(0),
      tmpB: new int(0),
      tmpC: new int(0),
      tmpD: new int(0),

      // —— 静态表 ——
      CF_MOVE_CODE_FACE, CF_MOVE_CODE_CNT,
      CF_X_MACRO_LEN_c0, CF_X_MACRO_C0_c0, CF_X_MACRO_C1_c0, CF_X_MACRO_C2_c0,
      CF_X_POLICY_c0, CF_X_POLICY_c1, CF_X_POLICY_c2, CF_X_POLICY_c3,
      CF_PLL_SIG_c0, CF_PLL_SIG_c1, CF_PLL_SIG_c2,
      CF_PLL_ACT_c0, CF_PLL_ACT_c1, CF_PLL_ACT_c2,
      CF_PLL_ALGLEN_c0,
      CF_PLL_ALG_c0, CF_PLL_ALG_c1, CF_PLL_ALG_c2, CF_PLL_ALG_c3,
      SC_FCORNER_FROM_c0, SC_FCORNER_TO_c0, SC_FCORNER_TWIST_c0,
      SC_FEDGE_FROM_c0, SC_FEDGE_TO_c0, SC_FEDGE_FLIP_c0
    }
  })
  .on('whenEntityIsCreated', (_evt, f) => {
    // 占位初始化；真实状态由 solve_req 触发时从自定义变量读入
    f.printString('rubik3x3-solver-ready')
  })
  .onSignal(RubikSignal.rubik3x3_solve_req, (_evt, f) => {
    // 骨架：暂不回跳；协议打通后替换为完整 CFOP 分片状态机
    f.printString('rubik3x3-solve-req')
    f.sendSignal(RubikSignal.rubik3x3_solve_done, 1n)
  })
  .onSignal(RubikSignal.rubik3x3_solve_ack, (_evt, f) => {
    f.printString('rubik3x3-solve-ack')
  })

export default graph
