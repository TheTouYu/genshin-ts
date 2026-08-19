// 灯阵关卡管理图 v5 重构候选（缺陷 5：50 个手写 createPrefab → listIterationLoop 批量创建）
// 目标：与 game-manager.ts（图 1073741828）同逻辑的候选版本，仅替换三关的展开创建。
// 编译验证通过后可替换 examples/lights-out/src/game-manager.ts 的对应分支。
import { defineSignal, g } from 'genshin-ts/runtime/core'
import { SettlementStatus } from 'genshin-ts/definitions/enum'
import { listLiteral } from 'genshin-ts/runtime/value'

const LevelSig = {
  level_clear: defineSignal('level_clear', [['level', 'int']])
} as const

const LAMP_L1 = 1077936129
const LAMP_L2 = 1077936133
const LAMP_L3 = 1077936134

// 关卡网格数据（间距 2.5；origin = 第一盏灯中心坐标）
const L1_ORIGIN = 2.5
const L1_COUNT = 3
const L2_ORIGIN = 1.25
const L2_COUNT = 4
const L3_ORIGIN = 0
const L3_COUNT = 5

const graph = g
  .server({ id: 1073741828 })

  // ① 管理台就绪
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    f.printString('manager-ready')
  })

  // ② 管理台选项卡：点「开始游戏」→ 创建关卡 1（3×3 灯柱）
  .on('whenTabIsSelected', (_evt: any, f: any) => {
    const self = f.getSelfEntity()
    f.printString('game-start-clicked')
    f.printString('level1-building')
    const rows = f.assemblyList([0, 1, 2], 'float')
    f.listIterationLoop(rows, (iz: any) => {
      f.listIterationLoop(rows, (ix: any) => {
        const x = f.addition(L1_ORIGIN, f.multiplication(ix, 2.5))
        const z = f.addition(L1_ORIGIN, f.multiplication(iz, 2.5))
        f.createPrefab(LAMP_L1, f.create3dVector(x, 0, z), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
      })
    })
    f.printString('level1-ready')
  })

  // 30s 自动胜利：全通后定时器触发 → 结算
  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    const self = f.getSelfEntity()
    const player = f.getPlayerEntityToWhichTheCharacterBelongs(self)
    f.setPlayerSettlementSuccessStatus(player, SettlementStatus.Victory)
    f.printString('win-auto-30s')
  })

  // ③④⑤ 通关解锁链：通关→反馈→创建下一关；全通→结算入口
  .onSignal(LevelSig.level_clear, (evt: any, f: any) => {
    const self = f.getSelfEntity()
    const level = evt.params.level
    f.doubleBranch(
      f.equal(level, 1),
      () => {
        f.printString('level1-complete')
        f.addUniformBasicRotationBasedMotionDevice(self, 'celebrate', 2.0, 180.0, [0, 1, 0])
        f.printString('console-spin')
        f.printString('level2-building')
        const rows = f.assemblyList([0, 1, 2, 3], 'float')
        f.listIterationLoop(rows, (iz: any) => {
          f.listIterationLoop(rows, (ix: any) => {
            const x = f.addition(L2_ORIGIN, f.multiplication(ix, 2.5))
            const z = f.addition(L2_ORIGIN, f.multiplication(iz, 2.5))
            f.createPrefab(LAMP_L2, f.create3dVector(x, 0, z), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
          })
        })
        f.printString('level2-ready')
      },
      () => {
        f.doubleBranch(
          f.equal(level, 2),
          () => {
            f.printString('level2-complete')
            f.addUniformBasicRotationBasedMotionDevice(self, 'celebrate', 2.0, 180.0, [0, 1, 0])
            f.printString('console-spin')
            f.printString('level3-building')
            const rows = f.assemblyList([0, 1, 2, 3, 4], 'float')
            f.listIterationLoop(rows, (iz: any) => {
              f.listIterationLoop(rows, (ix: any) => {
                const x = f.addition(L3_ORIGIN, f.multiplication(ix, 2.5))
                const z = f.addition(L3_ORIGIN, f.multiplication(iz, 2.5))
                f.createPrefab(LAMP_L3, f.create3dVector(x, 0, z), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
              })
            })
            f.printString('level3-ready')
          },
          () => {
            f.doubleBranch(
              f.equal(level, 3),
              () => {
                // v5 全通反馈：30s 自动结算 + 旋转庆祝（「立即胜利」选项待缺陷 2 补齐）
                f.printString('game-clear')
                f.startTimer(self, 'win30', false, [30.0])
                f.addUniformBasicRotationBasedMotionDevice(self, 'celebrate', 3.0, 360.0, [0, 1, 0])
                f.printString('console-spin')
                f.printString('win-option-ready')
              },
              () => {
                f.printString('level-clear-unknown')
              }
            )
          }
        )
      }
    )
  })

export default graph
