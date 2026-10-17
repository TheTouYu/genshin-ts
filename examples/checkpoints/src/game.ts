// 三关接力（游戏③）—— 依次抵达 3 个检查点（每站按 F 打卡），90 秒内完成通关，超时失败
//
// 与游戏②的区别：② 是环形 8 点、不限时；③ 是**线性 3 点 + 限时**（有失败态）。
// 通道同②：选项卡当位置传感器，用平方距离判定，不做开方。
import { g } from 'genshin-ts/runtime/core'
import { SettlementStatus } from 'genshin-ts/definitions/enum'

const LIMIT_MS = 90n * 1000n
const graph = g.server({ id: 1073741825, variables: { booted: false, done: false, cp: 0n, failed: false } })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    if (f.get('booted')) return
    f.set('booted', true)
    f.printString('CP-BOOT')
    setTimeout(() => {
      if (f.get('done') || f.get('failed')) return
      f.set('failed', true)
      f.printString('CP-TIMEOUT')
      const ps = f.getListOfPlayerEntitiesOnTheField()
      if (f.getListLength(ps) > 0n) {
        f.setPlayerSettlementSuccessStatus(f.getCorrespondingValueFromList(ps, 0n), SettlementStatus.Failure)
      }
      f.settleStage()
    }, LIMIT_MS)
  })
  .on('whenTabIsSelected', (e: any, f: any) => {
    const loc = f.getEntityLocationAndRotation(e.selectorEntity).location
    f.printString('CP-PX'); f.printString(f.dataTypeConversion(loc.x, 'str'))
    f.printString('CP-PZ'); f.printString(f.dataTypeConversion(loc.z, 'str'))
    const dx1 = f.subtraction(loc.x, 10.0)
    const dz1 = f.subtraction(loc.z, 0.0)
    const d1 = f.addition(f.multiplication(dx1, dx1), f.multiplication(dz1, dz1))
    if (f.lessThan(d1, 16.0) && f.get('cp') == 0n && !f.get('done')) {
      f.set('cp', 1n)
      f.printString('CP-1')
      if (1 == 3) { f.printString('CP-ALL') }
    }
    const dx2 = f.subtraction(loc.x, 20.0)
    const dz2 = f.subtraction(loc.z, 0.0)
    const d2 = f.addition(f.multiplication(dx2, dx2), f.multiplication(dz2, dz2))
    if (f.lessThan(d2, 16.0) && f.get('cp') == 1n && !f.get('done')) {
      f.set('cp', 2n)
      f.printString('CP-2')
      if (2 == 3) { f.printString('CP-ALL') }
    }
    const dx3 = f.subtraction(loc.x, 30.0)
    const dz3 = f.subtraction(loc.z, 0.0)
    const d3 = f.addition(f.multiplication(dx3, dx3), f.multiplication(dz3, dz3))
    if (f.lessThan(d3, 16.0) && f.get('cp') == 2n && !f.get('done')) {
      f.set('cp', 3n)
      f.printString('CP-3')
      if (3 == 3) { f.printString('CP-ALL') }
    }
    if (f.get('cp') == 3n && !f.get('done')) {
      f.set('done', true)
      const ps = f.getListOfPlayerEntitiesOnTheField()
      if (f.getListLength(ps) > 0n) {
        f.setPlayerSettlementSuccessStatus(f.getCorrespondingValueFromList(ps, 0n), SettlementStatus.Victory)
      }
      f.printString('CP-SETTLED')
      f.settleStage()
    }
  })
export default graph
