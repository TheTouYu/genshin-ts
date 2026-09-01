// 足球客户端算力最小通路·fb-server（服务端图，E1，2026-09-02，地图 1073741908）
//
// 照抄 zt-lane dispatcher（1915 已验证形态）缩比：无邮箱多生产者（dispatcher 兼任务源）。
// 职责（服务端唯一常驻 = 1s 轮询 + 4s 看门狗，静止零高频定时器）：
//   · fb_dsp 1s 轮询：寄存器空闲（epoch==ack）→ 发下一任务（测试载荷 epoch+1，
//     fb_ti = pe*1000+i，闭式 fb_sum = pe*8000+36——节点预算纪律，替代 8 节点求和链）
//   · fb_wd 4s 看门狗：在途任务（epoch!=ack）超时 → 重提交 (sum+epoch) 对（单写者
//     不变量：载荷已原子写全，重发只需门值）
//   · onSignal(fb_echo)：ack 只前进不回退；stale 过期回声拦下；tear 撕裂打点；
//     fb:cnt 打点回传 c（E2 计数器观测面——应逐拍递增）
// 挂载：关卡实体 1094713345（1915 zt-main 同构）。定时器名单制：本图只认 fb_dsp/fb_wd，
// else 一律空分支（同实体他图定时器广播不吃进——工程纪律）。
import { g } from 'genshin-ts/runtime/core'

import { FbSignal } from './signals.js'

g
  .server({ id: 1073741830, name: '_GSTS_fbServer' })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.printString('fb:armed')
    f.startTimer(f.getSelfEntity(), 'fb_dsp', true, [1])
    f.startTimer(f.getSelfEntity(), 'fb_wd', true, [4])
  })
  .on('whenTimerIsTriggered', (evt, f) => {
    f.doubleBranch(f.equal(evt.timerName, 'fb_dsp'), () => {
      const owner = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
      const e = f.getCustomVariable(owner, 'fb_epoch').asType('int')
      const a = f.getCustomVariable(owner, 'fb_ack').asType('int')
      f.doubleBranch(f.equal(e, a), () => {
        const pe = e + 1n
        f.setCustomVariable(owner, 'fb_t1', pe * 1000n + 1n, false)
        f.setCustomVariable(owner, 'fb_t2', pe * 1000n + 2n, false)
        f.setCustomVariable(owner, 'fb_t3', pe * 1000n + 3n, false)
        f.setCustomVariable(owner, 'fb_t4', pe * 1000n + 4n, false)
        f.setCustomVariable(owner, 'fb_t5', pe * 1000n + 5n, false)
        f.setCustomVariable(owner, 'fb_t6', pe * 1000n + 6n, false)
        f.setCustomVariable(owner, 'fb_t7', pe * 1000n + 7n, false)
        f.setCustomVariable(owner, 'fb_t8', pe * 1000n + 8n, false)
        f.setCustomVariable(owner, 'fb_sum', pe * 8000n + 36n, false)
        f.setCustomVariable(owner, 'fb_epoch', pe, false)
        f.printString('fb:dsp')
      }, () => {
      })
    }, () => {
      f.doubleBranch(f.equal(evt.timerName, 'fb_wd'), () => {
        const owner2 = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
        const e2 = f.getCustomVariable(owner2, 'fb_epoch').asType('int')
        const a2 = f.getCustomVariable(owner2, 'fb_ack').asType('int')
        f.doubleBranch(f.equal(e2, a2), () => {
        }, () => {
          f.setCustomVariable(owner2, 'fb_sum', e2 * 8000n + 36n, false)
          f.setCustomVariable(owner2, 'fb_epoch', e2, false)
          f.printString('fb:repub')
        })
      }, () => {
      })
    })
  })
  .onSignal(FbSignal.fb_echo, (evt, f) => {
    // first-wins 三分支（多造物部署 2026-09-02：5 造物同代并发回声，只应用第一个）
    //   e < cur → stale 拦下；e == cur → dup 丢弃（打点供并发统计）；e > cur → 应用
    const owner = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
    const cur = f.getCustomVariable(owner, 'fb_ack').asType('int')
    f.doubleBranch(f.equal(evt.params.tag, 'ok'), () => {
      f.doubleBranch(f.lessThan(evt.params.e, cur), () => {
        f.printString('fb:stale')
      }, () => {
        f.doubleBranch(f.equal(evt.params.e, cur), () => {
          f.printString('fb:dup')
          f.printString(f.dataTypeConversion(evt.params.e, 'str'))
        }, () => {
          f.setCustomVariable(owner, 'fb_ack', evt.params.e, false)
          f.printString('fb:ack')
          f.printString(f.dataTypeConversion(evt.params.e, 'str'))
          f.printString('fb:cnt')
          f.printString(f.dataTypeConversion(evt.params.c, 'str'))
        })
      })
    }, () => {
      f.printString('fb:tear')
      f.printString(f.dataTypeConversion(evt.params.e, 'str'))
    })
  })
