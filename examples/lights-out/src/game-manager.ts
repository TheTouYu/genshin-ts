// 灯阵关卡管理图 v5（最小图 1073741890，2026-08-16）
// 挂载：管理台实体 1077936191（tabBar「开始游戏」）
// 流程（游戏本质=及时反馈）：
//  ① 管理台创建 → 待开始（观察阶段无关卡）
//  ② 点「开始游戏」→ 创建关卡1（9 灯柱，中心区域）→ 反馈「第一关开始」
//  ③ 通关(N) → 反馈「完成」→ 创建下一关（同一中心区域，上一关已清理）
//  ④ 全通(3) → game-clear + 30s 定时器 + 管理台旋转庆祝
//  ⑤ 30s 定时器到 → 自动结算胜利（setPlayerSettlementSuccessStatus）
//  注：「立即胜利」选项需 CLI 支持更新 tabBar options（缺陷 2），待工具链补齐后实现
import { defineSignal, g } from 'genshin-ts/runtime/core'
import { SettlementStatus } from 'genshin-ts/definitions/enum'
import { listLiteral } from 'genshin-ts/runtime/value'

const LevelSig = {
  level_clear: defineSignal('level_clear', [['level', 'int']])
} as const

const LAMP_L1 = 1077936129
const LAMP_L2 = 1077936133
const LAMP_L3 = 1077936134

const graph = g
  .server({ id: 1073741828 })

  // ① 管理台就绪
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    f.printString('manager-ready')
  })

  // ② 管理台选项卡：点「开始游戏」→ 创建关卡 1（9 灯柱）
  .on('whenTabIsSelected', (_evt: any, f: any) => {
    const self = f.getSelfEntity()
    f.printString('game-start-clicked')
    f.printString('level1-building')
        f.createPrefab(LAMP_L1, f.create3dVector(2.5, 0, 2.5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L1, f.create3dVector(5, 0, 2.5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L1, f.create3dVector(7.5, 0, 2.5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L1, f.create3dVector(2.5, 0, 5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L1, f.create3dVector(5, 0, 5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L1, f.create3dVector(7.5, 0, 5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L1, f.create3dVector(2.5, 0, 7.5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L1, f.create3dVector(5, 0, 7.5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L1, f.create3dVector(7.5, 0, 7.5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
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
        f.createPrefab(LAMP_L2, f.create3dVector(1.25, 0, 1.25), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L2, f.create3dVector(3.75, 0, 1.25), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L2, f.create3dVector(6.25, 0, 1.25), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L2, f.create3dVector(8.75, 0, 1.25), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L2, f.create3dVector(1.25, 0, 3.75), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L2, f.create3dVector(3.75, 0, 3.75), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L2, f.create3dVector(6.25, 0, 3.75), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L2, f.create3dVector(8.75, 0, 3.75), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L2, f.create3dVector(1.25, 0, 6.25), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L2, f.create3dVector(3.75, 0, 6.25), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L2, f.create3dVector(6.25, 0, 6.25), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L2, f.create3dVector(8.75, 0, 6.25), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L2, f.create3dVector(1.25, 0, 8.75), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L2, f.create3dVector(3.75, 0, 8.75), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L2, f.create3dVector(6.25, 0, 8.75), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L2, f.create3dVector(8.75, 0, 8.75), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
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
        f.createPrefab(LAMP_L3, f.create3dVector(0, 0, 0), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(2.5, 0, 0), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(5, 0, 0), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(7.5, 0, 0), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(10, 0, 0), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(0, 0, 2.5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(2.5, 0, 2.5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(5, 0, 2.5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(7.5, 0, 2.5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(10, 0, 2.5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(0, 0, 5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(2.5, 0, 5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(5, 0, 5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(7.5, 0, 5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(10, 0, 5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(0, 0, 7.5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(2.5, 0, 7.5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(5, 0, 7.5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(7.5, 0, 7.5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(10, 0, 7.5), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(0, 0, 10), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(2.5, 0, 10), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(5, 0, 10), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(7.5, 0, 10), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
        f.createPrefab(LAMP_L3, f.create3dVector(10, 0, 10), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'))
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
