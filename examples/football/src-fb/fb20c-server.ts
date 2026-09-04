// fb20c-server.ts —— 票 20 · E0 轮服务端装配图（type 20000，2026-09-04）
//
// 职责（**只做一次性装配，零施放节点**——E0 判据的前提就是"图内与服务端都不 cast"，
// 触发权必须完全在「定时触发技能」单位状态里，见设计单 §7.2）：
//   ① addCharacterSkill 把技能配置 1098907653（6+瞬发，body-f5 绑 20002 图 1082130439）
//      装配到角色的**自定义技能槽 12**（= 已存在状态实测指向的槽位，见下）；
//   ② addUnitStatus 把「定时触发技能」状态（地图已有资产 id=1077936132，非本轮新建）
//      施加到同一角色。之后角色每触发间隔自动施放一次槽内技能 = 20002 图每拍执行 = Q1-Q5。
//
// 挂载（**注入轮执行，本轮未挂**）：目标=球实体 1077936135；磁盘现状该实体挂载
//   1073741832(_GSTS_fbIdleListen)/1833(fbSink)/1834(fbRender_1)/1835(fbInput)——
//   同实体定时器名清单 = fb_seed / fb_render / fb_beat（fb-input 起），与本图
//   fb20c_arm_once 零交集，名单制不串扰（2026-09-04 assets:mounts list 回读）。
//   注：BOARD 速查里的 1073741830(fbRender)/1831(fbSvlisten) 已被票 19 5.3a 拆分退役，
//   以本行磁盘回读为准。
// 寻址铁律（client-nodegraph-development 二-1）：角色实体**不可** entity(字面量)——
//   必须 玩家列表[0] → getAllCharacterEntitiesOfSpecifiedPlayer(player)[0] 动态取。
// 节拍：whenEntityIsCreated → **一次性**非循环定时器 2s（等角色就位；非循环=自终止，满足
//   "定时器必须有停止条件"），单次装配，图变量 fb20c_armed 幂等守卫。
//   ⚠️ 为何不做「0.5s 循环重补」自愈（盘点实测该状态 初始持续时间=1.0s，1s 后会到期）：
//   层数上限实测=1，重复 addUnitStatus 的引擎语义（叠层失败/是否重置剩余时长/会不会把
//   定时触发的计时基准也重置）**未实测**——它可能反过来污染 Q1 要测的施放率。
//   → 本轮保持单变量：持续时间由用户在编辑器设为**无限**（用户待办已列）；
//     若用户那边无法设无限，第 2 轮再按实测语义决定重补形态（登记为备选，不当结论用）。
// 角色寻址铁律（client-nodegraph-development 二-1）：角色实体**不可** entity(字面量)——
//   必须 玩家列表[0] → getAllCharacterEntitiesOfSpecifiedPlayer(player)[0] 动态取。
// 打印纪律：装配回执打点=全生命周期 2 行（关键状态入口）；E0 常态数据面零 print
//   （走 fb20_echo 信号 + 详情开窗帧流）。
// Q1 判据面（设计单 §7.1）：判据=「服务端事件流到达率」——故本图必须订阅 fb20_echo。
//   账务形态照设计单 §2.3 + fb-idle-listen 先例：**图变量**总计数（DSL 声明即生效，
//   免资产预注册）+ 最近值；**分 tag 计数不进变量——判读从帧流取（票 18 口径）**，
//   零实体变量写、零 print。到达率=帧流里各 tag 的秒桶计数（extract_rates.py 现成件）。
//   ≈3-4 帧/echo × 40 echo/s ⇒ 本图 ~150 帧/s，远低于 2.5k 负载线（容量账 §带宽）。
import { g } from 'genshin-ts/runtime/core'
import { CharacterSkillSlot, OriginalSlotSkillHandling } from 'genshin-ts/definitions/enum'
import { int } from 'genshin-ts/runtime/value'

import { Fb20Signal } from './signals20.js'

// configId(...) / dict(...) 为服务端图 DSL 上下文全局（d2-skill.ts 的 configId 先例：
// 不 import——从 runtime/value 导入得到的是类构造器，运行期报 Class constructor 错，
// client-nodegraph-development 三-6 同族）；int 作变量声明类型走 new int(0) 构造形态
// （fb-idle-listen.ts 同例，仅编译期元数据）。

// ———— 真值（2026-09-04 CLI 注册回读 + 只读盘点工具 analysis/20-e0-list-unit-status.ts） ————
const SKILL_CFG = 1098907653n // GSTS-fb20c-timer：template 6 + 瞬发，body-f5 绑 1082130439
// 单位状态=地图上**已存在**的 id 1077936132「定时触发技能」（效果 2110001，非本轮新建）。
// 盘点实测其参数**尚未配置**：触发间隔 f13 省略=0.0、技能引用槽 10 空、槽 3 指向槽位 12。
// → 用户须在编辑器把该状态「触发间隔」设 **0.1s**（0.0 大概率永不触发）并把「技能引用」
//   指到 1098907653；持续时间设**无限**（实测 1.0s 会在 1s 后到期）。槽位本图已迁就为
//   CustomSkillSlot12（= 状态实测指向的槽位），用户**不必**改槽位。
const STATUS_CFG = 1077936132n

g.server({
  id: 1073741836,
  name: '_GSTS_fb20cServer',
  variables: {
    fb20c_armed: new int(0),
    fb20c_sig_n: new int(0),
    fb20c_sig_last: new int(0)
  }
})
  .on('whenEntityIsCreated', (_evt, f) => {
    const ball = f.getSelfEntity()
    f.startTimer(ball, 'fb20c_arm_once', false, [2])
  })
  .on('whenTimerIsTriggered', (evt, f) => {
    const ball = f.getSelfEntity()
    // 名单制分发：只认本图定时器名，else 一律空分支（五D 工程纪律）
    f.doubleBranch(f.equal(evt.timerName, 'fb20c_arm_once'), () => {
      const armed = f.getNodeGraphVariable('fb20c_armed').asType('int')
      f.doubleBranch(f.equal(armed, 0n), () => {
        f.setNodeGraphVariable('fb20c_armed', 1n, false)
        // 角色寻址：场上第一个玩家 → 该玩家第一个角色
        const playerList = f.getListOfPlayerEntitiesOnTheField()
        const player = f.getCorrespondingValueFromList(playerList, 0n)
        const character = f.getCorrespondingValueFromList(
          f.getAllCharacterEntitiesOfSpecifiedPlayer(player),
          0n
        )
        // ① 装配：配置进自定义技能槽 **12**——对齐已存在状态的实测槽位（槽3=32 ⇒ 32−20=12），
        //    用户在编辑器就**不必再改槽位**（少一处手动动作=少一处错）。
        //    若用户改选了别的槽位，本行改一个枚举名即可（重编译重注入）。
        f.addCharacterSkill(
          character,
          configId(SKILL_CFG),
          CharacterSkillSlot.CustomSkillSlot12,
          OriginalSlotSkillHandling.Destroy
        )
        // ② 施加「定时触发技能」状态（施加者=角色自身，1 层，参数字典空）
        const res = f.addUnitStatus(
          character,
          character,
          configId(STATUS_CFG),
          1n,
          dict(0)
        )
        // 一次性装配回执（slotId=0 ⇒ 状态施加失败，优先怀疑 STATUS_CFG 未回填/状态配置非法）
        f.printString('fb20c:armed')
        f.printString(f.dataTypeConversion(res.slotId, 'str'))
      }, () => {})
    }, () => {})
  })
  // Q1 服务端到达面：每 echo 一次 → 图变量总计数 +1、记录最近值（保底观测面）。
  // 与 §2.3 草案的两处偏差（如实入账）：① fb20_sig_n/last 用**图变量**而非实体自定义变量
  // ——免资产预注册（三-8 红线只约束客户端读，服务端图变量 DSL 声明即生效，
  // fb-idle-listen 同族），省两个变量注册动作；② 分 tag 计数不落变量（票 18 口径：
  // 判读从帧流按 tag 精确分桶，extract_rates.py 现成件）。
  .onSignal(Fb20Signal.fb20_echo, (evt, f) => {
    const n = f.getNodeGraphVariable('fb20c_sig_n').asType('int')
    f.setNodeGraphVariable('fb20c_sig_n', n + 1n, false)
    f.setNodeGraphVariable('fb20c_sig_last', evt.params.e, false)
  })
