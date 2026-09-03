// fb-input.ts —— 输入图（票 19 三图拆分，2026-09-03）：低频/事件驱动功能收容
// 职责：R3 操作台踢球入口（whenTabIsSelected 9 选项→邮箱直投 KICK/RESET）+ E1 回声
// 账务（onSignal(fb_echo)：stale/dup/ack/tear 分口径 + 任务类型唤醒拍门）+ fb_beat
// 拍门处理（gate 置位——旧链回退兼容；新链 fb-phys2 不读 gate）。
// 静态大节点（踢球力度表 ~150 节点）收在这里——数据/渲染图测试时不用开它日志。
// fb_dsp（E1 测试载荷轮询）随三图拆分退役：其回声噪音 > 观测价值（19 收口观测面关闭）。
// 复合 fbMailPost 来自 fb-shared.ts。
import { g } from 'genshin-ts/runtime/core'
import { float, int } from 'genshin-ts/runtime/value'
import { FbSignal } from './signals.js'
import { fbMailPost, TT_KICK, TT_RESET, HOME_X, HOME_Y, HOME_ST } from './fb-shared.js'

// 踢球力度定点系数（vel/spin ×1000 定点编码，与 R2-DESIGN §4 载荷一致）
const AUTO_FIXK = 1000

const graph = g
  .server({
    id: 1073741835, // 占位：注入按 config.nodeGraphId 改写（单文件注入语义）
    name: '_GSTS_fbInput'
  })
  // ================================================================
  // R3 操作台踢球入口（票 06）：whenTabIsSelected（tabBar 挂球实体自身）→ 直投邮箱
  //   tab 1..8：KICK 任务（t2..t4=vel×1000 / t5..t7=spin×1000，九选项表数据选择求和）
  //   tab 9：RESET 任务（中圈 Rest，同进球复位）
  // 用户接管即终止自动锚点序列（fb_auto 归零在渲染图消费侧无效——改为直接置邮箱空转？
  // 实测口径：渲染图 fb_auto 是图变量，本图不可写；用户接管场景=手动 tab 与 auto 并发
  // 投递竞争——旧实现以 fb_auto=0 终止。三图拆分后改由渲染图 Rest 进入拍读取
  // fb_manual_pending（实体变量）方案复杂，先按旧语义近似：手动 tab 投递新任务本身
  // 会让 auto 序列失步（epoch 前进），渲染图 auto 推进受 seqlock ack 门约束，实测为准）
  // ================================================================
  .on('whenTabIsSelected', (evt, f) => {
    f.printString('fb:tab')
    f.printString(f.dataTypeConversion(evt.tabId, 'str'))
    const owner = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
    const cur = f.getCustomVariable(owner, 'fb_epoch').asType('int')
    const peT = cur + 1n // 算术在分支 ctx 外预计算（多分支闭包内元对象 +1n 会字符串化）
    f.doubleBranch(f.equal(evt.tabId, 9n), () => {
      f.callComposite(fbMailPost, {
        owner,
        pe: peT,
        t1: new int(TT_RESET),
        t2: new int(HOME_X),
        t3: new int(HOME_Y),
        t4: new int(HOME_X),
        t5: new int(0),
        t6: new int(0),
        t7: new int(0),
        t8: new int(HOME_ST)
      })
    }, () => {
      // 九选项标定：vel m/s / spin rad/s，世界轴 v4 旧表移植。
      // 数据选择求和（hit_i∈{0,1} 互斥）；字面量展开（数组索引在 DSL 闭包内会变成
      // 运行时列表取值——02 编译坑，勿回退成循环/索引）
      const b2f = (b: any) => f.dataTypeConversion(f.dataTypeConversion(b, 'int'), 'float')
      const h1 = b2f(f.equal(evt.tabId, new int(1)))
      const h2 = b2f(f.equal(evt.tabId, new int(2)))
      const h3 = b2f(f.equal(evt.tabId, new int(3)))
      const h4 = b2f(f.equal(evt.tabId, new int(4)))
      const h5 = b2f(f.equal(evt.tabId, new int(5)))
      const h6 = b2f(f.equal(evt.tabId, new int(6)))
      const h7 = b2f(f.equal(evt.tabId, new int(7)))
      const h8 = b2f(f.equal(evt.tabId, new int(8)))
      // 1 轻射(-14,4,6, 内旋0,-6,0) 2 重射(-24,5,0, 0,-8,0) 3 高吊(-15,14,0, 上旋0,0,6)
      // 4 内旋弧(-16,6,12, 0,-9,0) 5 外旋弧(-16,6,-12, 0,9,0) 6 上旋低平(18,4,12, 0,0,10)
      // 7 下旋(-14,5,8, 0,0,-8) 8 横传(4,6,18, 6,0,0)（注释顺序=选项卡位 1..8，9=复位）
      let velAcc: any = f.create3dVector(0, 0, 0)
      velAcc = f._3dVectorAddition(velAcc, f._3dVectorZoom(f.create3dVector(-14, 4, 6), h1))
      velAcc = f._3dVectorAddition(velAcc, f._3dVectorZoom(f.create3dVector(-24, 5, 0), h2))
      velAcc = f._3dVectorAddition(velAcc, f._3dVectorZoom(f.create3dVector(-15, 14, 0), h3))
      velAcc = f._3dVectorAddition(velAcc, f._3dVectorZoom(f.create3dVector(-16, 6, 12), h4))
      velAcc = f._3dVectorAddition(velAcc, f._3dVectorZoom(f.create3dVector(-16, 6, -12), h5))
      velAcc = f._3dVectorAddition(velAcc, f._3dVectorZoom(f.create3dVector(18, 4, 12), h6))
      velAcc = f._3dVectorAddition(velAcc, f._3dVectorZoom(f.create3dVector(-14, 5, 8), h7))
      velAcc = f._3dVectorAddition(velAcc, f._3dVectorZoom(f.create3dVector(4, 6, 18), h8))
      let spinAcc: any = f.create3dVector(0, 0, 0)
      spinAcc = f._3dVectorAddition(spinAcc, f._3dVectorZoom(f.create3dVector(0, -6, 0), h1))
      spinAcc = f._3dVectorAddition(spinAcc, f._3dVectorZoom(f.create3dVector(0, -8, 0), h2))
      spinAcc = f._3dVectorAddition(spinAcc, f._3dVectorZoom(f.create3dVector(0, 0, 6), h3))
      spinAcc = f._3dVectorAddition(spinAcc, f._3dVectorZoom(f.create3dVector(0, -9, 0), h4))
      spinAcc = f._3dVectorAddition(spinAcc, f._3dVectorZoom(f.create3dVector(0, 9, 0), h5))
      spinAcc = f._3dVectorAddition(spinAcc, f._3dVectorZoom(f.create3dVector(0, 0, 10), h6))
      spinAcc = f._3dVectorAddition(spinAcc, f._3dVectorZoom(f.create3dVector(0, 0, -8), h7))
      spinAcc = f._3dVectorAddition(spinAcc, f._3dVectorZoom(f.create3dVector(6, 0, 0), h8))
      const v = f.split3dVector(velAcc)
      const s = f.split3dVector(spinAcc)
      const toInt = (x: any) =>
        f.dataTypeConversion(f.multiplication(x, new float(AUTO_FIXK)), 'int')
      f.callComposite(fbMailPost, {
        owner,
        pe: peT,
        t1: new int(TT_KICK),
        t2: toInt(v.xComponent),
        t3: toInt(v.yComponent),
        t4: toInt(v.zComponent),
        t5: toInt(s.xComponent),
        t6: toInt(s.yComponent),
        t7: toInt(s.zComponent),
        t8: new int(0)
      })
    })
  })
  // ================================================================
  // onSignal(fb_echo)：E1 first-wins（stale/dup/ack/tear）+ 任务类型唤醒拍门
  // ================================================================
  .onSignal(FbSignal.fb_echo, (evt, f) => {
    const owner = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
    const cur = f.getCustomVariable(owner, 'fb_ack').asType('int')
    f.doubleBranch(f.equal(evt.params.tag, 'ok'), () => {
      f.doubleBranch(f.lessThan(evt.params.e, cur), () => {
        f.printString('fb:stale')
      }, () => {
        f.doubleBranch(f.equal(evt.params.e, cur), () => {
          // 打印纪律（用户 2026-09-03 定则）：dup=多造物回声常态，零打印
        }, () => {
          f.setCustomVariable(owner, 'fb_ack', evt.params.e, false)
          // 任务应用唤醒：读邮箱 t1（同 handler 内无并发写者），真实任务类型才开拍门；
          // fb:ack 只在真实任务唤醒时打（关键状态入口）
          const ball = f.getSelfEntity()
          const t1 = f.getCustomVariable(owner, 'fb_t1').asType('int')
          const beatDt = f.getCustomVariable(ball, 'fb_p_dt').asType('float')
          f.doubleBranch(f.equal(t1, TT_RESET), () => {
            f.printString('fb:ack')
            f.printString(f.dataTypeConversion(evt.params.e, 'str'))
            f.startTimer(ball, 'fb_beat', true, f.assemblyList([beatDt], 'float'))
          }, () => {
            f.doubleBranch(f.equal(t1, TT_KICK), () => {
              f.printString('fb:ack')
              f.printString(f.dataTypeConversion(evt.params.e, 'str'))
              f.startTimer(ball, 'fb_beat', true, f.assemblyList([beatDt], 'float'))
            }, () => {
            })
          })
        })
      })
    }, () => {
      // 非 'ok' 回声：E5 观测（tag='e5'，任务拍限频）与真实撕裂分开口径
      f.doubleBranch(f.equal(evt.params.tag, 'e5'), () => {
        f.printString('fb:e5')
        f.printString(f.dataTypeConversion(evt.params.e, 'str'))
      }, () => {
        f.printString('fb:tear')
        f.printString(f.dataTypeConversion(evt.params.e, 'str'))
      })
    })
  })
  // ================================================================
  // 定时器名单制：只认 fb_beat（拍门 gate 置位；旧链回退兼容）——else 空
  // ================================================================
  .on('whenTimerIsTriggered', (evt, f) => {
    f.doubleBranch(f.equal(evt.timerName, 'fb_beat'), () => {
      const ballB = f.getSelfEntity()
      f.setCustomVariable(ballB, 'fb_ball_gate', 1n, false)
    }, () => {
    })
  })

export default graph
