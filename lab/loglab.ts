// 日志格式解析实验 5：四则运算 + while 循环 + 嵌套 if + 大于比较
// 目标：闭合 subtraction/multiplication/division/modulo 操作码（301-304）、
//       while 循环编译形态、嵌套 double_branch、大于比较（103）
import { g } from 'genshin-ts/runtime/core'

const graph = g
  .server({
    id: 1073741825,
    variables: {
      count: 42,
      flag: true
    }
  })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.printString('start')

    // 四则运算：42-10=32, *2=64, /4=16
    f.set('count', f.get('count') - 10)
    f.printString(str(f.get('count')))
    f.set('count', f.multiplication(f.get('count'), 2))
    f.printString(str(f.get('count')))
    f.set('count', f.division(f.get('count'), 4))
    f.printString(str(f.get('count')))

    // while 循环 2 次
    let i = 0
    while (i < 2) {
      f.printString('while-body')
      i = i + 1
    }

    // 嵌套 if + 大于比较（count=1 不大于 50 → nested-false）
    if (f.get('flag')) {
      if (f.get('count') > 50) {
        f.printString('nested-true')
      } else {
        f.printString('nested-false')
      }
    }

    f.printString('done')
  })

export default graph
