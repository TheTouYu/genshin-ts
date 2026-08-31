import { g } from 'genshin-ts/runtime/core'

// 计算通道 v2·Round 2 生产者B（t=20/22/24 各投 1）——只写邮箱 ztq_b，不碰寄存器。
g.server({ id: 1073741839, name: '_GSTS_ztPB' })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.printString('lane:pb-armed')
    f.startTimer(f.getSelfEntity(), 'p1', false, [20])
    f.startTimer(f.getSelfEntity(), 'p2', false, [22])
    f.startTimer(f.getSelfEntity(), 'p3', false, [24])
  })
  .on('whenTimerIsTriggered', (evt, f) => {
    f.doubleBranch(f.equal(evt.timerName, 'p1'), () => {
        const cur = f.getCustomVariable(f.getSelfEntity(), 'ztq_b').asType('int')
        f.setCustomVariable(f.getSelfEntity(), 'ztq_b', cur + 1n, false)
        f.printString('lane:enqB')
    }, () => {
      f.doubleBranch(f.equal(evt.timerName, 'p2'), () => {
          const cur = f.getCustomVariable(f.getSelfEntity(), 'ztq_b').asType('int')
          f.setCustomVariable(f.getSelfEntity(), 'ztq_b', cur + 1n, false)
          f.printString('lane:enqB')
      }, () => {
        f.doubleBranch(f.equal(evt.timerName, 'p3'), () => {
          const cur3 = f.getCustomVariable(f.getSelfEntity(), 'ztq_b').asType('int')
          f.setCustomVariable(f.getSelfEntity(), 'ztq_b', cur3 + 1n, false)
          f.printString('lane:enqB')
        }, () => {
        })
      })
    })
  })
