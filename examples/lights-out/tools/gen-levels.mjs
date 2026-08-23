// 生成 6 个灯阵关卡图文件（内联 g.server().on() 链，满足编译器 entry 检测）
// 用法：node tools/gen-levels.mjs
// 数据源：src/levels.ts 的 LEVELS 数组（单一事实来源）
//
// 背景：编译器 hasNodeGraphEntryCall 只在源文件里检测到直接的
//   g.server(...).on(...) 调用时才标记 @gsts:entry；通过 helper 函数
//   （如 makeLampGraph(LEVELS[i])）返回的图不会被识别为入口，导致
//   Stage 2/3 跳过该文件。因此每个关卡文件必须内联完整的 .on() 链。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcDir = join(__dirname, '..', 'src')

// 关卡配置（与 src/levels.ts 保持一致；此处硬编码为生成器输入，
// 避免在生成器里解析 TS。若 levels.ts 变更，需同步此处。）
const LEVELS = [
  { level: 1, sizeX: 1n, sizeZ: 2n, originX: 5, originZ: 3.75, spacing: 2.5, winTarget: 2n, presetMask: 0n, prefabId: 1077936129, headPrefabId: 1077936130, graphId: 1073741825 },
  { level: 2, sizeX: 1n, sizeZ: 3n, originX: 5, originZ: 2.5, spacing: 2.5, winTarget: 3n, presetMask: 0n, prefabId: 1077936133, headPrefabId: 1077936130, graphId: 1073741826 },
  { level: 3, sizeX: 2n, sizeZ: 2n, originX: 3.75, originZ: 3.75, spacing: 2.5, winTarget: 4n, presetMask: 8n, prefabId: 1077936134, headPrefabId: 1077936130, graphId: 1073741827 },
  { level: 4, sizeX: 2n, sizeZ: 3n, originX: 3.75, originZ: 2.5, spacing: 2.5, winTarget: 6n, presetMask: 56n, prefabId: 1077936200, headPrefabId: 1077936130, graphId: 1073741829 },
  { level: 5, sizeX: 3n, sizeZ: 3n, originX: 2.5, originZ: 2.5, spacing: 2.5, winTarget: 9n, presetMask: 325n, prefabId: 1077936201, headPrefabId: 1077936130, graphId: 1073741830 },
  { level: 6, sizeX: 3n, sizeZ: 3n, originX: 2.5, originZ: 2.5, spacing: 2.5, winTarget: 9n, presetMask: 0n, prefabId: 1077936202, headPrefabId: 1077936130, graphId: 1073741831 },
]

const header = (cfg) => `// 灯阵玩法图 L${cfg.level}（v6 内联，由 tools/gen-levels.mjs 生成，勿手改）
// 阵形 ${cfg.sizeX}×${cfg.sizeZ}，胜利 ${cfg.winTarget} 灯，预置掩码 ${cfg.presetMask}
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
  .server({ id: ${cfg.graphId} })

  .on('whenEntityIsCreated', (_e: any, f: any) => {
    const self = f.getSelfEntity()
    const loc = f.getEntityLocationAndRotation(self).location
    const head = f.createPrefab(
      ${cfg.headPrefabId},
      f.create3dVector(loc.x, 1.34, loc.z),
      f.create3dVector(0, 0, 0),
      self,
      false,
      0,
      new listLiteral('int'),
    )
    const ixInit = f.roundToIntegerOperation(
      f.division(f.subtraction(loc.x, ${cfg.originX}), ${cfg.spacing}),
      RoundingMode.RoundToNearest,
    )
    const izInit = f.roundToIntegerOperation(
      f.division(f.subtraction(loc.z, ${cfg.originZ}), ${cfg.spacing}),
      RoundingMode.RoundToNearest,
    )
    const indexInit = f.addition(f.multiplication(izInit, ${cfg.sizeX}n), ixInit)
    const pow2 = f.exponentiation(2n, indexInit)
    const shifted = f.division(${cfg.presetMask}n, pow2)
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
          f.equal(after, ${cfg.winTarget}n),
          () => {
            f.printString('lamp-win')
            f.sendSignal(LampSig.level_clear, ${cfg.level})
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
      f.equal(evt.params.level, ${cfg.level}),
      () => {
        const loc = f.getEntityLocationAndRotation(self).location
        const ix = f.roundToIntegerOperation(
          f.division(f.subtraction(loc.x, ${cfg.originX}), ${cfg.spacing}),
          RoundingMode.RoundToNearest,
        )
        const iz = f.roundToIntegerOperation(
          f.division(f.subtraction(loc.z, ${cfg.originZ}), ${cfg.spacing}),
          RoundingMode.RoundToNearest,
        )
        const index = f.addition(f.multiplication(iz, ${cfg.sizeX}n), ix)
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
      f.equal(evt.params.level, ${cfg.level}),
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
      f.equal(evt.params.level, ${cfg.level}),
      () => {
        const loc = f.getEntityLocationAndRotation(self).location
        const ix = f.roundToIntegerOperation(
          f.division(f.subtraction(loc.x, ${cfg.originX}), ${cfg.spacing}),
          RoundingMode.RoundToNearest,
        )
        const iz = f.roundToIntegerOperation(
          f.division(f.subtraction(loc.z, ${cfg.originZ}), ${cfg.spacing}),
          RoundingMode.RoundToNearest,
        )
        const index = f.addition(f.multiplication(iz, ${cfg.sizeX}n), ix)
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
`

for (const cfg of LEVELS) {
  const out = join(srcDir, `game-level${cfg.level}.ts`)
  writeFileSync(out, header(cfg), 'utf8')
  console.log(`[gen] ${out}`)
}
console.log('[gen] done')
