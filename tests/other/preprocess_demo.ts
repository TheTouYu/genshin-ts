import { buildServerGraphRegistriesIRDocuments, g } from 'genshin-ts/runtime/core'

g.server({
  id: 1073741836
}).on('whenEntityIsCreated', (_evt, f) => {
  // 空数组（需要类型标注）
  const xs: bigint[] = []

  // 普通数组构建
  const ys = [1, 2, 3]

  const { localVariable } = f.initLocalVariable('float_list')
  f.setLocalVariable(localVariable, ys)

  // 访问与写入
  const first = ys[0]
  ys[0] = (first + 10) * 5 - float(5 % 76) / (2 + (123 * 3) / 4)

  // 解构拼接（展开）
  const zs = [float(0), ...ys, float(99)]

  // if/else
  if (int(zs[0]) == 0n) {
    f.printString('zero')
  } else {
    f.printString('non-zero')
  }

  // for loop -> finiteLoop
  for (let i = 0n; i < 3n; i++) {
    if (i >= 1n) {
      f.printString('i >= 1')
    } else {
      f.printString('i < 1')
    }
  }

  // while(true) -> finiteLoop(0, loopMax)
  while (true) {
    if (false) {
      break
    }
    return
    f.printString('while body')
  }
})
