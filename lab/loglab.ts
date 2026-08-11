// 日志格式解析实验 4：控制流 + 运算
// 覆盖：if 分支、算术运算（+8）、for 循环、字符串拼接
// 目标：闭合控制流帧结构（条件判断/循环控制）与算术节点编码
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

    // if 分支
    if (f.get('flag')) {
      f.printString('branch-true')
    } else {
      f.printString('branch-false')
    }

    // 算术：count = count + 8 → 50
    f.set('count', f.get('count') + 8)
    f.printString(str(f.get('count')))

    // for 循环 3 次
    for (let i = 0; i < 3; i++) {
      f.printString('loop-body')
    }

    f.printString('done')
  })

export default graph
