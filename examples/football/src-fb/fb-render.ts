// fb-render.ts —— 渲染图（票 19 三图拆分，2026-09-03）：独立渲染服务（用户模型第 2 点）
// 「游戏启动几秒后自动启动，读取变量值，然后执行渲染」。
// 职责：会话种子（5s 一次性）+ fb_render 定时器（镜像新 tick 才驱动可见球：
// 位置跳变>JUMP_EPS=瞬移（RESET/进球复位），否则预测插值；Rest 到位后零驱动）；
// Rest 进入拍（prev≠Rest）：停拍门+自动锚点队列推进+清进球去重；
// 进球判定（镜像过门线 → 邮箱投 RESET 回中圈）。
// 复合 fbMailPost/fbDrive/fbTeleport 来自 fb-shared.ts（import 即执行声明）。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int } from 'genshin-ts/runtime/value'
import { FbSignal } from './signals.js'
import {
  fbDrive,
  fbMailPost,
  fbTeleport,
  HOME_ST,
  HOME_X,
  HOME_Y,
  GOAL_BAR_Y,
  GOAL_LINE_X,
  GOAL_MOUTH_Z,
  SEED_DELAY_S,
  SEED_POS_X,
  SEED_POS_Y,
  SEED_ST,
  ST_REST,
  TT_KICK,
  TT_RESET
} from './fb-shared.js'

// 瞬移判定阈值：镜像新位置与实体当前位置差 >10m = RESET/进球复位大跳（INSTANT 瞬移防
// 百米条纹）；常态飞行 30m/s×0.09s≈2.7m/渲染拍远小于阈值；丢拍续滑恢复也走瞬移（跳回
// 优于拉条纹）。30m/s 是选项表上界 24.51 之上留余量。
const JUMP_EPS = 10


const graph = g
  .server({
    id: 1073741834, // 占位：注入按 config.nodeGraphId 改写（单文件注入语义）
    name: '_GSTS_fbRender',
    variables: {
      // 进球去重（restEnter 清；防球在网内多拍连续触发）
      fb_scored: new bool(false),
      // R3 自动锚点队列指针：0=off；1..7=下一任务（Rest 进入拍弹下一任务；用户按任意选项即清零）
      fb_auto: new int(0),
      // fb_render 上次已驱动镜像 tick（无新 tick 零动作）
      fb_last_drv: new int(0),
      // 上次应用状态（Rest 进入拍判定：连续 Rest 拍不重复触发——新链 Rest 连续回传）
      fb_prev_st: new int(0)
    }
  })
  // ================================================================
  // 会话入口：轻打点 + 5s 一次性 fb_seed（种子逻辑后移——进图实体风暴期规避）
  // ================================================================
  .on('whenEntityIsCreated', (_evt, f) => {
    f.printString('fb:armed')
    const ball = f.getSelfEntity()
    f.startTimer(ball, 'fb_seed', false, [SEED_DELAY_S])
  })
  // ================================================================
  // 定时器名单制分发：fb_seed（一次性）/ fb_render（渲染节拍）——只认本图名字，else 空
  // ================================================================
  .on('whenTimerIsTriggered', (evt, f) => {
    f.doubleBranch(f.equal(evt.timerName, 'fb_seed'), () => {
      const ball = f.getSelfEntity()
      // 球引用种子：5 丘丘人实例逐个写（fb-phys 读链 getSelfEntity→fb_ball_entity→球变量；
      // def 1082130433 为模板不运行时写，5 实例=1082130437..441）
      f.setCustomVariable(entity(1082130437n), 'fb_ball_entity', ball, false)
      f.setCustomVariable(entity(1082130438n), 'fb_ball_entity', ball, false)
      f.setCustomVariable(entity(1082130439n), 'fb_ball_entity', ball, false)
      f.setCustomVariable(entity(1082130440n), 'fb_ball_entity', ball, false)
      f.setCustomVariable(entity(1082130441n), 'fb_ball_entity', ball, false)
      // 初始 RESET 任务进邮箱（seqlock 单槽；2m 落体校准锚点）
      const owner = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
      const pe = f.getCustomVariable(owner, 'fb_epoch').asType('int') + 1n
      f.callComposite(fbMailPost, {
        owner,
        pe,
        t1: new int(TT_RESET),
        t2: new int(SEED_POS_X),
        t3: new int(SEED_POS_Y),
        t4: new int(SEED_POS_X),
        t5: new int(0),
        t6: new int(0),
        t7: new int(0),
        t8: new int(SEED_ST)
      })
      f.printString('fb:seed')
      // 渲染节拍参数化（用户 2026-09-03 定：不写死；按球实体变量 fb_p_drive 设置走，
      // 与 fbDrive 设备时长同源 → 间隔=时长匀速分段平滑；改变量后重进图生效）
      const renderInt = f.getCustomVariable(ball, 'fb_p_drive').asType('float')
      f.startTimer(ball, 'fb_render', true, f.assemblyList([renderInt], 'float'))
      // R3 自动锚点序列武装（fb_test_mode=1；2m 落体种子 Rest 后自动开跑）
      const tm = f.getCustomVariable(ball, 'fb_test_mode').asType('int')
      f.doubleBranch(f.equal(tm, 1n), () => {
        f.setNodeGraphVariable('fb_auto', new int(1), false)
        f.printString('fb:autoarm')
      }, () => {
        f.setNodeGraphVariable('fb_auto', new int(0), false)
      })
    }, () => {
      f.doubleBranch(f.equal(evt.timerName, 'fb_render'), () => {
        // —— 渲染节拍：镜像有新 tick 才驱动可见球；无新 tick 零动作 ——
        const ballR = f.getSelfEntity()
        const mt = f.getCustomVariable(ballR, 'fb_ball_tick').asType('int')
        const ld = f.getNodeGraphVariable('fb_last_drv').asType('int')
        f.doubleBranch(f.logicalNotOperation(f.equal(mt, ld)), () => {
          f.setNodeGraphVariable('fb_last_drv', mt, false)
          const mPos = f.create3dVector(
            f.getCustomVariable(ballR, 'fb_ball_px').asType('float'),
            f.getCustomVariable(ballR, 'fb_ball_py').asType('float'),
            f.getCustomVariable(ballR, 'fb_ball_pz').asType('float')
          )
          const mSpin = f.create3dVector(
            f.getCustomVariable(ballR, 'fb_ball_sx').asType('float'),
            f.getCustomVariable(ballR, 'fb_ball_sy').asType('float'),
            f.getCustomVariable(ballR, 'fb_ball_sz').asType('float')
          )
          const mSt = f.getCustomVariable(ballR, 'fb_ball_state').asType('int')
          const loc = f.getEntityLocationAndRotation(ballR).location
          // —— Rest 到位跳过：state=Rest 且实体已贴镜像位 → 零驱动（静止零设备）——
          const dist = f._3dVectorModuloOperation(f._3dVectorSubtraction(mPos, loc))
          const restArrived = f.logicalAndOperation(
            f.equal(mSt, ST_REST),
            f.lessThan(dist, new float(0.05))
          )
          f.doubleBranch(restArrived, () => {
          }, () => {
            // —— 大跳变 → 瞬移；常态 → 预测插值驱动 ——
            const jump = f.greaterThan(dist, new float(JUMP_EPS))
            f.doubleBranch(jump, () => {
              f.callComposite(fbTeleport, { ball: ballR, pos: mPos })
            }, () => {
              f.callComposite(fbDrive, { ball: ballR, pos: mPos, spin: mSpin, st: mSt })
            })
            // —— Rest 进入拍（prev≠Rest）：停拍门 + 清进球去重 + 自动锚点队列推进 ——
            const pst = f.getNodeGraphVariable('fb_prev_st').asType('int')
            f.doubleBranch(
              f.logicalAndOperation(
                f.equal(mSt, ST_REST),
                f.logicalNotOperation(f.equal(pst, ST_REST))
              ),
              () => {
                f.stopTimer(ballR, 'fb_beat')
                f.setNodeGraphVariable('fb_scored', new bool(false), false)
                const auto = f.getNodeGraphVariable('fb_auto').asType('int')
                const ow = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
                const peN = f.getCustomVariable(ow, 'fb_epoch').asType('int') + 1n
                // 执行序：先置下一指针再投递（本 handler 原子，防同事件重复弹）
                f.multipleBranches(auto, {
                  1: () => {
                    f.printString('fb:auto1')
                    f.setNodeGraphVariable('fb_auto', new int(2), false)
                    f.callComposite(fbMailPost, {
                      owner: ow,
                      pe: peN,
                      t1: new int(TT_KICK),
                      t2: new int(24500),
                      t3: new int(2000),
                      t4: new int(0),
                      t5: new int(0),
                      t6: new int(0),
                      t7: new int(0),
                      t8: new int(0)
                    })
                  },
                  2: () => {
                    f.setNodeGraphVariable('fb_auto', new int(3), false)
                    f.callComposite(fbMailPost, {
                      owner: ow,
                      pe: peN,
                      t1: new int(TT_RESET),
                      t2: new int(HOME_X),
                      t3: new int(HOME_Y),
                      t4: new int(HOME_X),
                      t5: new int(0),
                      t6: new int(0),
                      t7: new int(0),
                      t8: new int(HOME_ST)
                    })
                  },
                  3: () => {
                    f.printString('fb:auto3')
                    f.setNodeGraphVariable('fb_auto', new int(4), false)
                    f.callComposite(fbMailPost, {
                      owner: ow,
                      pe: peN,
                      t1: new int(TT_KICK),
                      t2: new int(24148),
                      t3: new int(6471),
                      t4: new int(0),
                      t5: new int(0),
                      t6: new int(0),
                      t7: new int(0),
                      t8: new int(0)
                    })
                  },
                  4: () => {
                    f.setNodeGraphVariable('fb_auto', new int(5), false)
                    f.callComposite(fbMailPost, {
                      owner: ow,
                      pe: peN,
                      t1: new int(TT_RESET),
                      t2: new int(HOME_X),
                      t3: new int(HOME_Y),
                      t4: new int(HOME_X),
                      t5: new int(0),
                      t6: new int(0),
                      t7: new int(0),
                      t8: new int(HOME_ST)
                    })
                  },
                  5: () => {
                    f.printString('fb:auto5')
                    f.setNodeGraphVariable('fb_auto', new int(6), false)
                    f.callComposite(fbMailPost, {
                      owner: ow,
                      pe: peN,
                      t1: new int(TT_KICK),
                      t2: new int(24148),
                      t3: new int(6471),
                      t4: new int(0),
                      t5: new int(0),
                      t6: new int(50265),
                      t7: new int(0),
                      t8: new int(0)
                    })
                  },
                  6: () => {
                    f.setNodeGraphVariable('fb_auto', new int(7), false)
                    f.callComposite(fbMailPost, {
                      owner: ow,
                      pe: peN,
                      t1: new int(TT_RESET),
                      t2: new int(HOME_X),
                      t3: new int(HOME_Y),
                      t4: new int(HOME_X),
                      t5: new int(0),
                      t6: new int(0),
                      t7: new int(0),
                      t8: new int(HOME_ST)
                    })
                  },
                  7: () => {
                    f.printString('fb:auto7')
                    f.setNodeGraphVariable('fb_auto', new int(0), false)
                    f.callComposite(fbMailPost, {
                      owner: ow,
                      pe: peN,
                      t1: new int(TT_KICK),
                      t2: new int(8000),
                      t3: new int(0),
                      t4: new int(0),
                      t5: new int(0),
                      t6: new int(0),
                      t7: new int(0),
                      t8: new int(0)
                    })
                  },
                  default: () => {}
                })
              },
              () => {
              }
            )
          })
          // —— prev 状态更新（每驱动拍；restEnter 条件已在上方消费旧值） ——
          f.setNodeGraphVariable('fb_prev_st', mSt, false)
          // —— 进球判定：镜像 pos 过门线（去重）→ 打点 + RESET 任务回中圈 ——
          const scored = f.getNodeGraphVariable('fb_scored').asType('bool')
          const mS = f.split3dVector(mPos)
          const xOk = f.greaterThan(f.absoluteValueOperation(mS.xComponent), new float(GOAL_LINE_X))
          const zOk = f.lessThan(f.absoluteValueOperation(mS.zComponent), new float(GOAL_MOUTH_Z))
          const yOk = f.lessThan(mS.yComponent, new float(GOAL_BAR_Y))
          const inMouth = f.logicalAndOperation(f.logicalAndOperation(xOk, zOk), yOk)
          const go = f.logicalAndOperation(inMouth, f.logicalNotOperation(scored))
          f.doubleBranch(go, () => {
            f.printString('fb:goal')
            f.printString(f.dataTypeConversion(mS.xComponent, 'str'))
            f.printString(f.dataTypeConversion(mS.zComponent, 'str'))
            f.printString(f.dataTypeConversion(mS.yComponent, 'str'))
            const ow2 = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
            const pe2 = f.getCustomVariable(ow2, 'fb_epoch').asType('int') + 1n
            f.callComposite(fbMailPost, {
              owner: ow2,
              pe: pe2,
              t1: new int(TT_RESET),
              t2: new int(HOME_X),
              t3: new int(HOME_Y),
              t4: new int(HOME_X),
              t5: new int(0),
              t6: new int(0),
              t7: new int(0),
              t8: new int(HOME_ST)
            })
            f.setNodeGraphVariable('fb_scored', new bool(true), false)
          }, () => {
          })
        }, () => {
          // —— 镜像未变：零动作（静止零定时器之外的最轻闲置）——
        })
      }, () => {
      })
    })
  })

export default graph
