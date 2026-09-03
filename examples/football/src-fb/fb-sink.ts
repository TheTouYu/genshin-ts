// fb-sink.ts —— 数据图（票 19 三图拆分，2026-09-03）：接收 fb_ball_state → 快照门 → 写镜像
// 唯一职责=「客户端算好、服务端收到就写变量」（用户模型）；无定时器、无其它事件、
// 不注册 whenTimerIsTriggered（同实体其它图定时器广播到此零帧）。
// 5.2e 减载形态：isP 门在外（非 P 撕裂拍零成本），cur 读+vec3 拆分在 fresh 门内
// （4.6× 重复流只付 isP+gt ~6f）。
// 复合 fbMirrorApply 来自 fb-shared.ts（import 即执行声明，本 .gia 自带 def，
// 注入按 ID 覆盖幂等——任意单图注入后地图 def 目录自足）。
import { g } from 'genshin-ts/runtime/core'
import { FbSignal } from './signals.js'
import { fbMirrorApply } from './fb-shared.js'

const graph = g
  .server({
    id: 1073741833, // 占位：注入按 config.nodeGraphId 改写（单文件注入语义）
    name: '_GSTS_fbSink'
  })
  .onSignal(FbSignal.fb_ball_state, (evt, f) => {
    const ball = f.getSelfEntity()
    const isP = f.equal(evt.params.tag, 'P')
    f.doubleBranch(isP, () => {
      // —— 快照门：只接受比镜像更新的 tick（各实例自持 tick 连续同轨迹，
      // 任意流的下一个连续 tick 均可续接镜像，流间自动交替）——
      const cur = f.getCustomVariable(ball, 'fb_ball_tick').asType('int')
      const fresh = f.greaterThan(evt.params.tick, cur)
      f.doubleBranch(fresh, () => {
        // vec3 参数拆分量（信号 6 参形态：tag,tick,pos,vel,spin,state——引擎参数上限 10）
        const posS = f.split3dVector(evt.params.pos)
        const velS = f.split3dVector(evt.params.vel)
        const spinS = f.split3dVector(evt.params.spin)
        // —— 快照应用：镜像 11 写（tick=客户端 tick，快照语义不重编号）+ gate=0 ——
        f.callComposite(fbMirrorApply, {
          ball,
          nt: evt.params.tick,
          px: posS.xComponent,
          py: posS.yComponent,
          pz: posS.zComponent,
          vx: velS.xComponent,
          vy: velS.yComponent,
          vz: velS.zComponent,
          sx: spinS.xComponent,
          sy: spinS.yComponent,
          sz: spinS.zComponent,
          st: evt.params.state
        })
      }, () => {
        // —— fresh 未过：同代/过期重复回传（多造物常态）零处理 ——
      })
    }, () => {
      // —— 非 P 拍（tag='T' 撕裂哨兵）：零应用 ——
    })
  })

export default graph
