// 灯阵玩法图 L6（v6 内联，由 tools/gen-levels.mjs 生成，勿手改）
// 阵形 3×3，胜利 9 灯，预置掩码 0
import { defineSignal, g } from 'genshin-ts/runtime/core'
import { listLiteral, str } from 'genshin-ts/runtime/value'
import { RoundingMode } from 'genshin-ts/definitions/enum'

const LampSig = {
  lamp_toggle: defineSignal('lamp_toggle', [['senderPos', 'vec3'], ['hop', 'int']]),
  win_check: defineSignal('win_check', [['senderPos', 'vec3']]),
  win_ack: defineSignal('win_ack', [['senderPos', 'vec3']]),
  level_clear: defineSignal('level_clear', [['level', 'int']]),
  lamp_wipe: defineSignal('lamp_wipe', [['level', 'int']]),
  win_wave: defineSignal('win_wave', [['level', 'int']]),
  lamp_hint: defineSignal('lamp_hint', [['level', 'int'], ['seq', 'int']]),
} as const

const graph = g
  .server({ id: 1073741831 })

  .on('whenEntityIsCreated', (_e: any, f: any) => {
    const self = f.getSelfEntity()
    const loc = f.getEntityLocationAndRotation(self).location
    const head = f.createPrefab(
      1077936130,
      f.create3dVector(loc.x, 1.34, loc.z),
      f.create3dVector(0, 0, 0),
      self,
      false,
      0,
      new listLiteral('int'),
    )
    const ixInit = f.roundToIntegerOperation(
      f.division(f.subtraction(loc.x, 2.5), 2.5),
      RoundingMode.RoundToNearest,
    )
    const izInit = f.roundToIntegerOperation(
      f.division(f.subtraction(loc.z, 2.5), 2.5),
      RoundingMode.RoundToNearest,
    )
    const indexInit = f.addition(f.multiplication(izInit, 3n), ixInit)
    const pow2 = f.exponentiation(2n, indexInit)
    const shifted = f.division(0n, pow2)
    const litInit = f.equal(f.moduloOperation(shifted, 2n), 1n)
    f.setCustomVariable(self, new str('lit'), litInit, false)
    f.setCustomVariable(self, new str('head'), head, false)
    f.setCustomVariable(self, new str('winCount'), 0n, false)
    f.doubleBranch(
      litInit,
      () => { f.activateDisableModelDisplay(head, true) },
      () => { f.activateDisableModelDisplay(head, false) },
    )
    f.printString('lamp-created')
  })

  .on('whenTabIsSelected', (evt: any, f: any) => {
    const self = evt.eventSourceEntity
    const lit = f.equal(f.getCustomVariable(self, new str('lit')).asType('bool'), true)
    const head = f.getCustomVariable(self, new str('head')).asType('entity')
    f.addUniformBasicRotationBasedMotionDevice(self, 'clickPulse', 0.25, 180, [0, 1, 0])
    f.doubleBranch(
      lit,
      () => {
        f.setCustomVariable(self, new str('lit'), false, false)
        f.activateDisableModelDisplay(head, false)
      },
      () => {
        f.setCustomVariable(self, new str('lit'), true, false)
        f.activateDisableModelDisplay(head, true)
      },
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
              },
            )
            f.printString('lamp-neighbor-toggle')
          },
          () => { f.printString('lamp-recv-far-skip') },
        )
      },
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
      () => { f.printString('win-no-ack') },
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
        const after = f.getCustomVariable(self, new str('winCount')).asType('int')
        f.doubleBranch(
          f.equal(after, 9n),
          () => {
            f.printString('lamp-win')
            f.sendSignal(LampSig.level_clear, 6)
          },
          () => { f.printString('win-counting') },
        )
      },
      () => { f.printString('win-ack-other') },
    )
  })

  .onSignal(LampSig.win_wave, (evt: any, f: any) => {
    const self = f.getSelfEntity()
    const head = f.getCustomVariable(self, new str('head')).asType('entity')
    f.doubleBranch(
      f.equal(evt.params.level, 6),
      () => {
        const loc = f.getEntityLocationAndRotation(self).location
        const ix = f.roundToIntegerOperation(
          f.division(f.subtraction(loc.x, 2.5), 2.5),
          RoundingMode.RoundToNearest,
        )
        const iz = f.roundToIntegerOperation(
          f.division(f.subtraction(loc.z, 2.5), 2.5),
          RoundingMode.RoundToNearest,
        )
        const index = f.addition(f.multiplication(iz, 3n), ix)
        f.activateDisableModelDisplay(head, false)
        const delay = f.multiplication(f.dataTypeConversion(index, 'float'), 0.15)
        f.startTimer(self, 'waveDelay', false, [delay])
      },
      () => {},
    )
  })

  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    const self = f.getSelfEntity()
    f.doubleBranch(
      f.equal(evt.timerName, new str('waveDelay')),
      () => {
        const head = f.getCustomVariable(self, new str('head')).asType('entity')
        f.activateDisableModelDisplay(head, true)
      },
      () => {},
    )
  })

  .onSignal(LampSig.lamp_wipe, (evt: any, f: any) => {
    const self = f.getSelfEntity()
    f.doubleBranch(
      f.equal(evt.params.level, 6),
      () => {
        const head = f.getCustomVariable(self, new str('head')).asType('entity')
        f.removeEntity(head)
        f.removeEntity(self)
        f.printString('lamp-cleaned')
      },
      () => { f.printString('lamp-clean-other') },
    )
  })

  .onSignal(LampSig.lamp_hint, (evt: any, f: any) => {
    const self = f.getSelfEntity()
    const head = f.getCustomVariable(self, new str('head')).asType('entity')
    f.doubleBranch(
      f.equal(evt.params.level, 6),
      () => {
        const loc = f.getEntityLocationAndRotation(self).location
        const ix = f.roundToIntegerOperation(
          f.division(f.subtraction(loc.x, 2.5), 2.5),
          RoundingMode.RoundToNearest,
        )
        const iz = f.roundToIntegerOperation(
          f.division(f.subtraction(loc.z, 2.5), 2.5),
          RoundingMode.RoundToNearest,
        )
        const index = f.addition(f.multiplication(iz, 3n), ix)
        f.doubleBranch(
          f.equal(index, evt.params.seq),
          () => {
            f.activateDisableModelDisplay(head, true)
            f.startTimer(self, 'hintOff', false, [0.6])
            f.printString('lamp-hint-shown')
          },
          () => {},
        )
      },
      () => {},
    )
  })

  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    const self = f.getSelfEntity()
    f.doubleBranch(
      f.equal(evt.timerName, new str('hintOff')),
      () => {
        const head = f.getCustomVariable(self, new str('head')).asType('entity')
        const lit = f.getCustomVariable(self, new str('lit')).asType('bool')
        f.doubleBranch(
          lit,
          () => { f.activateDisableModelDisplay(head, true) },
          () => { f.activateDisableModelDisplay(head, false) },
        )
        f.printString('lamp-hint-off')
      },
      () => {},
    )
  })

export default graph
