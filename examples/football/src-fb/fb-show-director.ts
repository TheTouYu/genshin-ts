// @status: active（服务端演出编排图，挂球实体 1077936135；票 23 职责拆分——演出逻辑从 render 抽出）
// fb-show-director.ts —— 演出导演（单一职责：演出编排）。不做任何渲染设备。
// 职责：会话种子（5 造物球引用 + 初始 DROP 带旋落体）+ 演出状态机（ACT-1..4 的邮箱投送时序
// 与进球复位）。渲染由 fb-render 独立承担。零打印；所有可调参数走球实体 fb_show_* 变量。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int } from 'genshin-ts/runtime/value'
import { FbSignal } from './signals.js'
import { fbMailPost, HOME_X, HOME_Y, HOME_ST, ST_REST, TT_DROP, TT_KICK, TT_RESET } from './fb-shared.js'

const graph = g
  .server({
    id: 1073741821,
    name: '_GSTS_fbShowDir',
    variables: {
      // 演出状态机指针：0=off；1=ACT-1 进行中/待落体结束 ← 2=传球 ← 3=泄力 ← 4=抽射
      fb_show_act: new int(0),
      // 演出节拍计数（每 fb_show 节拍 +1；投递清零）
      fb_show_beats: new int(0),
      // 上一拍镜像状态（从运动进入 Rest 才推进，杜绝初始静止误判）
      fb_prev_beat_st: new int(4)
    }
  })
  .on('whenEntityIsCreated', (_evt, f) => {
    // —— 种子：5 造物球引用 + 初始 DROP（带旋落体）+ 启演出节拍 ——
    const ball = f.getSelfEntity()
    f.setCustomVariable(entity(1082130437n), 'fb_ball_entity', ball, false)
    f.setCustomVariable(entity(1082130438n), 'fb_ball_entity', ball, false)
    f.setCustomVariable(entity(1082130439n), 'fb_ball_entity', ball, false)
    f.setCustomVariable(entity(1082130440n), 'fb_ball_entity', ball, false)
    f.setCustomVariable(entity(1082130441n), 'fb_ball_entity', ball, false)
    const owner = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
    const pe = f.getCustomVariable(owner, 'fb_epoch').asType('int') + 1n
    const toIx = (v: any) =>
      f.dataTypeConversion(f.multiplication(v, new float(1000)), 'int')
    const sX = toIx(f.getCustomVariable(ball, 'fb_show_drop_sx').asType('float'))
    const sY = toIx(f.getCustomVariable(ball, 'fb_show_drop_sy').asType('float'))
    const sZ = toIx(f.getCustomVariable(ball, 'fb_show_drop_sz').asType('float'))
    f.callComposite(fbMailPost, {
      owner,
      pe,
      t1: new int(TT_DROP),
      t2: new int(0),
      t3: new int(2250),
      t4: new int(0),
      t5: sX,
      t6: sY,
      t7: sZ,
      t8: new int(0)
    })
    f.setNodeGraphVariable('fb_show_act', new int(1), false)
    const drive = f.getCustomVariable(ball, 'fb_p_drive').asType('float')
    f.startTimer(ball, 'fb_show', true, f.assemblyList([drive], 'float'))
  })
  .on('whenTimerIsTriggered', (evt, f) => {
    f.doubleBranch(f.equal(evt.timerName, 'fb_show'), () => {
      const ballR = f.getSelfEntity()
      const act = f.getNodeGraphVariable('fb_show_act').asType('int')
      // tm 门：仅 fb_test_mode=1 演出
      const tm = f.getCustomVariable(ballR, 'fb_test_mode').asType('int')
      f.doubleBranch(f.equal(tm, 1n), () => {
        const mSt = f.getCustomVariable(ballR, 'fb_ball_state').asType('int')
        const prev = f.getNodeGraphVariable('fb_prev_beat_st').asType('int')
        const enterRest = f.logicalAndOperation(
          f.equal(mSt, ST_REST),
          f.logicalNotOperation(f.equal(prev, ST_REST))
        )
        // —— ACT 推进/收动作（每节拍一次；math 最简化）——
        f.doubleBranch(f.greaterThan(act, 0n), () => {
          const beats = f.getNodeGraphVariable('fb_show_beats').asType('int')
          const nb = f.addition(beats, 1n)
          f.setNodeGraphVariable('fb_show_beats', nb, false)
          const toIx2 = (v: any) =>
            f.dataTypeConversion(f.multiplication(v, new float(1000)), 'int')
          const ownerA = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
          const peA = f.getCustomVariable(ownerA, 'fb_epoch').asType('int') + 1n
          const post = (t1: bigint, t2: any, t3: any, t4: any, t8: any) =>
            f.callComposite(fbMailPost, { owner: ownerA, pe: peA, t1, t2, t3, t4, t5: 0n, t6: 0n, t7: 0n, t8 })
          // ACT-1 Rest 进入拍 → 投 A 传球
          f.doubleBranch(
            f.logicalAndOperation(f.equal(act, 1n), enterRest),
            () => {
              post(
                TT_KICK,
                toIx2(f.getCustomVariable(ballR, 'fb_show_pass_vx').asType('float')),
                toIx2(f.getCustomVariable(ballR, 'fb_show_pass_vy').asType('float')),
                toIx2(f.getCustomVariable(ballR, 'fb_show_pass_vz').asType('float')),
                0n
              )
              f.setNodeGraphVariable('fb_show_act', new int(2), false)
              f.setNodeGraphVariable('fb_show_beats', new int(0), false)
            },
            () => {
              const tTrap = f.getCustomVariable(ballR, 'fb_show_b_trap').asType('int')
              const tShot = f.getCustomVariable(ballR, 'fb_show_b_shot').asType('int')
              // ACT-2：到拍泄力
              f.doubleBranch(
                f.logicalAndOperation(f.equal(act, 2n), f.greaterThanOrEqualTo(nb, tTrap)),
                () => {
                  post(
                    TT_KICK,
                    0n,
                    toIx2(f.getCustomVariable(ballR, 'fb_show_pop_vy').asType('float')),
                    0n,
                    0n
                  )
                  f.setNodeGraphVariable('fb_show_act', new int(3), false)
                  f.setNodeGraphVariable('fb_show_beats', new int(0), false)
                },
                () => {
                  // ACT-3→4 抽射
                  f.doubleBranch(
                    f.logicalAndOperation(f.equal(act, 3n), f.greaterThanOrEqualTo(nb, tShot)),
                    () => {
                      post(
                        TT_KICK,
                        toIx2(f.getCustomVariable(ballR, 'fb_show_shot_vx').asType('float')),
                        toIx2(f.getCustomVariable(ballR, 'fb_show_shot_vy').asType('float')),
                        toIx2(f.getCustomVariable(ballR, 'fb_show_shot_vz').asType('float')),
                        0n
                      )
                      f.setNodeGraphVariable('fb_show_act', new int(4), false)
                      f.setNodeGraphVariable('fb_show_beats', new int(0), false)
                    },
                    () => {
                      // ACT-4：入网检测 → RESET 中圈收尾
                      const mx = f.getCustomVariable(ballR, 'fb_ball_px').asType('float')
                      const mz = f.getCustomVariable(ballR, 'fb_ball_pz').asType('float')
                      const my = f.getCustomVariable(ballR, 'fb_ball_py').asType('float')
                      const inMouth = f.logicalAndOperation(
                        f.logicalAndOperation(
                          f.greaterThan(f.absoluteValueOperation(mx), new float(52.5)),
                          f.lessThan(f.absoluteValueOperation(mz), new float(3.66))
                        ),
                        f.lessThan(my, new float(2.5))
                      )
                      f.doubleBranch(
                        f.logicalAndOperation(f.equal(act, 4n), inMouth),
                        () => {
                          post(TT_RESET, new int(HOME_X), new int(HOME_Y), new int(HOME_X), new int(HOME_ST))
                          f.setNodeGraphVariable('fb_show_act', new int(0), false)
                          f.setNodeGraphVariable('fb_show_beats', new int(0), false)
                        },
                        () => {}
                      )
                    }
                  )
                }
              )
            }
          )
        }, () => {})
        f.setNodeGraphVariable('fb_prev_beat_st', mSt, false)
      }, () => {})
    }, () => {})
  })

export default graph