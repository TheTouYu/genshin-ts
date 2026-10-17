// 灯阵（游戏②）—— 走到灯柱旁按 F 点亮，8 根全亮通关
//
// 通道：选项卡当**位置传感器**（whenTabIsSelected 载荷里的 selectorEntity 是角色实体，
// 唯一能读到真坐标的通道）；点位判定用**平方距离**（避免开方节点，也避开浮点比较误差）。
import { g } from 'genshin-ts/runtime/core'
import { SettlementStatus } from 'genshin-ts/definitions/enum'

const GOAL_N = 8n
const graph = g.server({ id: 1073741825, variables: { booted: false, done: false, cnt: 0n,
  lit1: false, lit2: false, lit3: false, lit4: false, lit5: false, lit6: false, lit7: false, lit8: false } })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    if (f.get('booted')) return
    f.set('booted', true)
    f.printString('LZ-BOOT')
  })
  .on('whenTabIsSelected', (e: any, f: any) => {
    const loc = f.getEntityLocationAndRotation(e.selectorEntity).location
    f.printString('LZ-PX'); f.printString(f.dataTypeConversion(loc.x, 'str'))
    f.printString('LZ-PZ'); f.printString(f.dataTypeConversion(loc.z, 'str'))
    const dx1 = f.subtraction(loc.x, 12.0)
    const dz1 = f.subtraction(loc.z, 0.0)
    const d1 = f.addition(f.multiplication(dx1, dx1), f.multiplication(dz1, dz1))
    if (f.lessThan(d1, 9.0) && !f.get('lit1')) {
      f.set('lit1', true)
      f.set('cnt', f.addition(f.get('cnt'), 1n))
      f.printString('LZ-LIT1')
    }
    const dx2 = f.subtraction(loc.x, 8.49)
    const dz2 = f.subtraction(loc.z, 8.49)
    const d2 = f.addition(f.multiplication(dx2, dx2), f.multiplication(dz2, dz2))
    if (f.lessThan(d2, 9.0) && !f.get('lit2')) {
      f.set('lit2', true)
      f.set('cnt', f.addition(f.get('cnt'), 1n))
      f.printString('LZ-LIT2')
    }
    const dx3 = f.subtraction(loc.x, 0.0)
    const dz3 = f.subtraction(loc.z, 12.0)
    const d3 = f.addition(f.multiplication(dx3, dx3), f.multiplication(dz3, dz3))
    if (f.lessThan(d3, 9.0) && !f.get('lit3')) {
      f.set('lit3', true)
      f.set('cnt', f.addition(f.get('cnt'), 1n))
      f.printString('LZ-LIT3')
    }
    const dx4 = f.subtraction(loc.x, -8.49)
    const dz4 = f.subtraction(loc.z, 8.49)
    const d4 = f.addition(f.multiplication(dx4, dx4), f.multiplication(dz4, dz4))
    if (f.lessThan(d4, 9.0) && !f.get('lit4')) {
      f.set('lit4', true)
      f.set('cnt', f.addition(f.get('cnt'), 1n))
      f.printString('LZ-LIT4')
    }
    const dx5 = f.subtraction(loc.x, -12.0)
    const dz5 = f.subtraction(loc.z, 0.0)
    const d5 = f.addition(f.multiplication(dx5, dx5), f.multiplication(dz5, dz5))
    if (f.lessThan(d5, 9.0) && !f.get('lit5')) {
      f.set('lit5', true)
      f.set('cnt', f.addition(f.get('cnt'), 1n))
      f.printString('LZ-LIT5')
    }
    const dx6 = f.subtraction(loc.x, -8.49)
    const dz6 = f.subtraction(loc.z, -8.49)
    const d6 = f.addition(f.multiplication(dx6, dx6), f.multiplication(dz6, dz6))
    if (f.lessThan(d6, 9.0) && !f.get('lit6')) {
      f.set('lit6', true)
      f.set('cnt', f.addition(f.get('cnt'), 1n))
      f.printString('LZ-LIT6')
    }
    const dx7 = f.subtraction(loc.x, -0.0)
    const dz7 = f.subtraction(loc.z, -12.0)
    const d7 = f.addition(f.multiplication(dx7, dx7), f.multiplication(dz7, dz7))
    if (f.lessThan(d7, 9.0) && !f.get('lit7')) {
      f.set('lit7', true)
      f.set('cnt', f.addition(f.get('cnt'), 1n))
      f.printString('LZ-LIT7')
    }
    const dx8 = f.subtraction(loc.x, 8.49)
    const dz8 = f.subtraction(loc.z, -8.49)
    const d8 = f.addition(f.multiplication(dx8, dx8), f.multiplication(dz8, dz8))
    if (f.lessThan(d8, 9.0) && !f.get('lit8')) {
      f.set('lit8', true)
      f.set('cnt', f.addition(f.get('cnt'), 1n))
      f.printString('LZ-LIT8')
    }
    if (f.get('cnt') >= GOAL_N && !f.get('done')) {
      f.set('done', true)
      f.printString('LZ-ALL')
      const players = f.getListOfPlayerEntitiesOnTheField()
      if (f.getListLength(players) > 0n) {
        f.setPlayerSettlementSuccessStatus(f.getCorrespondingValueFromList(players, 0n), SettlementStatus.Victory)
      }
      f.printString('LZ-SETTLED')
      f.settleStage()
    }
  })
export default graph
