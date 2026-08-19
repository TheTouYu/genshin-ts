
// 灯阵玩法逻辑 关卡1（最小图 1073741890 v4，2026-08-16 动态关卡重构）
// 挂载：灯柱L1 prefab def（createPrefab 动态创建的灯柱继承执行）
//  - 灯头：whenEntityIsCreated 动态创建（灯头 prefab 带 basicMotion，y 1.34 灯罩中心）
//  - 明暗：activateDisableModelDisplay(灯头, lit)；胜利庆祝：灯头旋转（basicMotion 已配）
//  - 邻居：lamp_toggle 距离判定（<=0.1 自身 / <=3.0 邻居）；胜利：winCount==9
import { defineSignal, g } from 'genshin-ts/runtime/core'
import { listLiteral, str } from 'genshin-ts/runtime/value'

const LampSig = {
  lamp_toggle: defineSignal('lamp_toggle', [['senderPos', 'vec3'], ['hop', 'int']]),
  win_check: defineSignal('win_check', [['senderPos', 'vec3']]),
  win_ack: defineSignal('win_ack', [['senderPos', 'vec3']]),
  level_clear: defineSignal('level_clear', [['level', 'int']])
} as const

const LAMP_HEAD_PREFAB = 1077936130
const WIN_TARGET = 9
const LEVEL = 1

const graph = g
  .server({ id: 1073741825 })

  .on('whenEntityIsCreated', (_e: any, f: any) => {
    const self = f.getSelfEntity()
    const loc = f.getEntityLocationAndRotation(self).location
    const head = f.createPrefab(
      LAMP_HEAD_PREFAB,
      f.create3dVector(loc.x, 1.34, loc.z),
      f.create3dVector(0, 0, 0),
      self,
      false,
      0,
      new listLiteral('int')
    )
    f.setCustomVariable(self, new str('lit'), false, false)
    f.setCustomVariable(self, new str('head'), head, false)
    f.setCustomVariable(self, new str('winCount'), 0n, false)
    f.activateDisableModelDisplay(head, false)
    f.printString('lamp-created')
  })

  .on('whenTabIsSelected', (evt: any, f: any) => {
    const self = evt.eventSourceEntity
    const lit = f.equal(f.getCustomVariable(self, new str('lit')).asType('bool'), true)
    const head = f.getCustomVariable(self, new str('head')).asType('entity')
    f.doubleBranch(
      lit,
      () => {
        f.setCustomVariable(self, new str('lit'), false, false)
        f.activateDisableModelDisplay(head, false)
      },
      () => {
        f.setCustomVariable(self, new str('lit'), true, false)
        f.activateDisableModelDisplay(head, true)
      }
    )
    const loc = f.getEntityLocationAndRotation(self).location
    f.sendSignal(LampSig.lamp_toggle, loc, 1)
    f.printString('lamp-toggle')
    f.setCustomVariable(self, new str('winCount'), 0n, false)
    f.sendSignal(LampSig.win_check, loc)
    f.printString('win-check-sent')
  })

  .onSignal(LampSig.lamp_toggle, (evt: any, f: any) => {
    const self = f.getSelfEntity()
    const loc = f.getEntityLocationAndRotation(self).location
    const dist = f.distanceBetweenTwoCoordinatePoints(loc, evt.params.senderPos)
    f.doubleBranch(
      f.lessThanOrEqualTo(dist, 0.1),
      () => { f.printString('lamp-recv-self-skip') },
      () => {
        f.doubleBranch(
          f.lessThanOrEqualTo(dist, 3.0),
          () => {
            const lit = f.equal(f.getCustomVariable(self, new str('lit')).asType('bool'), true)
            const head = f.getCustomVariable(self, new str('head')).asType('entity')
            f.doubleBranch(
              lit,
              () => {
                f.setCustomVariable(self, new str('lit'), false, false)
                f.activateDisableModelDisplay(head, false)
              },
              () => {
                f.setCustomVariable(self, new str('lit'), true, false)
                f.activateDisableModelDisplay(head, true)
              }
            )
            f.printString('lamp-neighbor-toggle')
          },
          () => { f.printString('lamp-recv-far-skip') }
        )
      }
    )
  })

  // 关卡清理（2026-08-16 用户反馈：通关后上一关产物应清除，否则全局信号污染下一关）
  // 灯柱收到 level_clear 且 level==自己关卡 → 移除自身（含灯头，owner 链）
  .onSignal(LampSig.level_clear, (evt: any, f: any) => {
    const self = f.getSelfEntity()
    f.doubleBranch(
      f.equal(evt.params.level, LEVEL),
      () => {
        // 2026-08-16 v5：清理链补灯头——灯头是独立 createPrefab 实体，removeEntity(灯柱) 不级联
        const head = f.getCustomVariable(self, new str('head')).asType('entity')
        f.removeEntity(head)
        f.removeEntity(self)
        f.printString('lamp-cleaned')
      },
      () => {
        f.printString('lamp-clean-other')
      }
    )
  })

  .onSignal(LampSig.win_check, (evt: any, f: any) => {
    const self = f.getSelfEntity()
    const lit = f.equal(f.getCustomVariable(self, new str('lit')).asType('bool'), true)
    f.doubleBranch(
      lit,
      () => {
        f.sendSignal(LampSig.win_ack, evt.params.senderPos)
        f.printString('win-ack-sent')
      },
      () => { f.printString('win-no-ack') }
    )
  })

  .onSignal(LampSig.win_ack, (evt: any, f: any) => {
    const self = f.getSelfEntity()
    const loc = f.getEntityLocationAndRotation(self).location
    const dist = f.distanceBetweenTwoCoordinatePoints(loc, evt.params.senderPos)
    f.doubleBranch(
      f.lessThanOrEqualTo(dist, 0.1),
      () => {
        const count = f.getCustomVariable(self, new str('winCount')).asType('int')
        const next = f.addition(count, 1)
        f.setCustomVariable(self, new str('winCount'), next, false)
        // 2026-08-16 修复（日志 2723 铁证：next 被 set+equal 两处消费 → addition 二次求值
        // → 一次 ack 计两次：7→8→9 直接 win）。改：set 后重新 get，equal 用独立读取
        const after = f.getCustomVariable(self, new str('winCount')).asType('int')
        f.doubleBranch(
          f.equal(after, WIN_TARGET),
          () => {
            f.printString('lamp-win')
            f.sendSignal(LampSig.level_clear, LEVEL)
            const head = f.getCustomVariable(self, new str('head')).asType('entity')
            // 庆祝：灯柱整体自旋 360°（绕 Y 整圈，比灯头球自旋明显得多——用户质询修正）
            // 目标 = self（玩法图挂载实体=灯柱本身）；灯柱 tabBar 生效→组件复制对灯柱成立，
            // basicMotion 应同在（待游戏核验）；同时灯头闪烁兜底
            f.addUniformBasicRotationBasedMotionDevice(self, 'celebrate', 2.0, 180.0, [0, 1, 0])
            f.activateDisableModelDisplay(head, false)
            f.activateDisableModelDisplay(head, true)
            f.activateDisableModelDisplay(head, false)
            f.activateDisableModelDisplay(head, true)
            f.printString('lamp-celebrate')
          },
          () => { f.printString('win-counting') }
        )
      },
      () => { f.printString('win-ack-other') }
    )
  })

export default graph
