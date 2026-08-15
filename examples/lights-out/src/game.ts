// 灯阵玩法逻辑 v3（2026-08-15）
// 架构（ADR-0004）：1 图 × 9 灯柱挂载 + 信号广播 + 308 显隐 + 实体自定义变量
//  - 状态：lit/head 存灯柱实体自定义变量（type 1 在位；规避图变量共享风险）
//  - 灯头：whenEntityIsCreated 动态创建（createPrefab 灯头元件，y 固定 0.95），引用存实体变量
//  - 明暗：activateDisableModelDisplay(灯头, lit)（U4b 已验证 308 生效）
//  - 邻居：信号广播 lamp_toggle(senderPos) → 距离判定（>0.1 且 <=3.0 排除自身与对角，
//    网格间距 2.5：邻居 2.5、对角 3.54）
//  - 连锁：只传一层（接收方翻转后不再广播）
//  - v3：单参数信号（senderPos:vec3）验证版——删除多余的 int 字段，CLI update 重新生成
//    规范布局（版本 4=4 一致）
import { defineSignal, g } from 'genshin-ts/runtime/core'
import { listLiteral, str } from 'genshin-ts/runtime/value'

const LampSig = {
  lamp_toggle: defineSignal('lamp_toggle', [['senderPos', 'vec3']])
} as const

// 灯头元件 prefabId（createPrefab 的 prefabId 只能字面量）
const LAMP_HEAD_PREFAB = 1077936130

const graph = g
  .server({ id: 1073741825 })

  // ① 灯柱创建 → 动态创建灯头 + 初始化（lit=false，灯头隐藏）
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    const self = f.getSelfEntity()
    const loc = f.getEntityLocationAndRotation(self).location
    const head = f.createPrefab(
      LAMP_HEAD_PREFAB,
      f.create3dVector(loc.x, 0.95, loc.z),
      f.create3dVector(0, 0, 0),
      self,
      false,
      0,
      new listLiteral('int')
    )
    f.setCustomVariable(self, new str('lit'), false, false)
    f.setCustomVariable(self, new str('head'), head, false)
    f.activateDisableModelDisplay(head, false)
    f.printString('lamp-head-created')
    f.printString('lamp-init')
  })

  // ② 点击灯柱 → 翻转自身 + 广播位置
  .on('whenTabIsSelected', (evt: any, f: any) => {
    const self = evt.eventSourceEntity
    const lit = f.equal(f.getCustomVariable(self, new str('lit')).asType('bool'), true)
    const head = f.getCustomVariable(self, new str('head')).asType('entity')
    f.doubleBranch(
      lit,
      () => {
        f.setCustomVariable(self, new str('lit'), false, false)
        f.activateDisableModelDisplay(head, false)
      },
      () => {
        f.setCustomVariable(self, new str('lit'), true, false)
        f.activateDisableModelDisplay(head, true)
      }
    )
    const loc = f.getEntityLocationAndRotation(self).location
    f.sendSignal(LampSig.lamp_toggle, loc)
    f.printString('lamp-toggle')
  })

  // ③ 收到邻居信号 → 翻转（不广播，链止一层）
  // 距离判定三态（W4 插桩）：<=0.1 自身（self-skip）/ <=3.0 邻居（翻转）/ 其余对角与远处（far-skip）
  .onSignal(LampSig.lamp_toggle, (evt: any, f: any) => {
    const self = f.getSelfEntity()
    const loc = f.getEntityLocationAndRotation(self).location
    const dist = f.distanceBetweenTwoCoordinatePoints(loc, evt.params.senderPos)
    f.doubleBranch(
      f.lessThanOrEqualTo(dist, 0.1),
      () => {
        f.printString('lamp-recv-self-skip')
      },
      () => {
        f.doubleBranch(
          f.lessThanOrEqualTo(dist, 3.0),
          () => {
            const lit = f.equal(f.getCustomVariable(self, new str('lit')).asType('bool'), true)
            const head = f.getCustomVariable(self, new str('head')).asType('entity')
            f.doubleBranch(
              lit,
              () => {
                f.setCustomVariable(self, new str('lit'), false, false)
                f.activateDisableModelDisplay(head, false)
              },
              () => {
                f.setCustomVariable(self, new str('lit'), true, false)
                f.activateDisableModelDisplay(head, true)
              }
            )
            f.printString('lamp-neighbor-toggle')
          },
          () => {
            f.printString('lamp-recv-far-skip')
          }
        )
      }
    )
  })

export default graph
