import { g } from 'genshin-ts/runtime/core'

// 计算通道 v2·Round 2 生产者A（t=3 投 5 个串行基准 + t=20/22/24 各投 1）
// 只写自己邮箱 ztq_a（挂在本图实体=关卡实体上），绝不碰寄存器——单写者纪律。
g.server({ id: 1073741838, name: '_GSTS_ztPA' })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.printString('lane:pa-armed')
    f.startTimer(f.getSelfEntity(), 'p0', false, [3])
    f.startTimer(f.getSelfEntity(), 'p1', false, [20])
    f.startTimer(f.getSelfEntity(), 'p2', false, [22])
    f.startTimer(f.getSelfEntity(), 'p3', false, [24])
  })
  .on('whenTimerIsTriggered', (evt, f) => {
    f.doubleBranch(f.equal(evt.timerName, 'p0'), () => {
      f.setCustomVariable(f.getSelfEntity(), 'ztq_a', 5n, false)
      f.printString('lane:enqA-batch5')
    }, () => {
      f.doubleBranch(f.equal(evt.timerName, 'p1'), () => {
          const cur = f.getCustomVariable(f.getSelfEntity(), 'ztq_a').asType('int')
          f.setCustomVariable(f.getSelfEntity(), 'ztq_a', cur + 1n, false)
          f.printString('lane:enqA')
      }, () => {
        f.doubleBranch(f.equal(evt.timerName, 'p2'), () => {
            const cur = f.getCustomVariable(f.getSelfEntity(), 'ztq_a').asType('int')
            f.setCustomVariable(f.getSelfEntity(), 'ztq_a', cur + 1n, false)
            f.printString('lane:enqA')
        }, () => {
          f.doubleBranch(f.equal(evt.timerName, 'p3'), () => {
            const cur3 = f.getCustomVariable(f.getSelfEntity(), 'ztq_a').asType('int')
            f.setCustomVariable(f.getSelfEntity(), 'ztq_a', cur3 + 1n, false)
            f.printString('lane:enqA')
          }, () => {
          })
        })
      })
    })
  })
