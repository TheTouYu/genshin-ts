import { CharacterSkillSlot } from 'genshin-ts/definitions/enum'
import { g } from 'genshin-ts/runtime/core'

g.server({
  id: 1073741858,
  lang: 'zh'
}).on('whenHpIsRecovered', (_evt, f) => {
  const a = 12
  const b = 5
  const c = 3

  _evt.recoverTagList.forEach((t) => {
    console.log(t)
  })

  const ggg = ['1', '2', ..._evt.recoverTagList, '2']

  f.打印字符串('1233')

  f.createProjectile(123, [1, 2, 3], [4, 5, 6], entity(0), entity(0), false, 100, [1n, 2n, 3n])
  // f.getSelfEntity().player.character.player

  f.queryCharacterSkill(entity(f.getSelfEntity().player), CharacterSkillSlot.CustomSkillSlot10)

  entity(f.getSelfEntity().player).activateBasicMotionDevice('123')
  f.getSelfEntity().playTimedEffects(123, 'avc', false, false, [0, 0, 0], [0, 0, 0], 0, false)
  f.getSelfEntity().destroy()
  const gg = f.getSelfEntity().pos

  const powInt = 2n ** 5n
  const powFloat = 2.5 ** 2
  const modInt = 13 % 5
  const modFloat = 7 % 2

  const shl = a << c
  const shr = a >> c
  const ushr = a >>> c

  const band = a & b
  const bor = a | b
  const bxor = a ^ b
  const bnot = ~b

  const land = true && false
  const lor = false || true

  f.printString('ops: start')
  f.printString(str(powInt))
  f.printString(str(powFloat))
  f.printString(str(modInt))
  f.printString(str(modFloat))
  f.printString(str(shl))
  f.printString(str(shr))
  f.printString(str(ushr))
  f.printString(str(band))
  f.printString(str(bor))
  f.printString(str(bxor))
  f.printString(str(bnot))
  f.printString(str(land))
  f.printString(str(lor))

  const write = f.writeByBit(0b1111, 0b10, 1, 2)
  const read = f.readByBit(0b110110, 1, 3)
  f.printString(str(write))
  f.printString(str(read))
  f.printString('ops: end')
})
