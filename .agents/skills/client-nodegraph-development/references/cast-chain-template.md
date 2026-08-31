# 服务端→客户端调用链完整模板（cast-chain-template）

> 状态：已验证（2026-08-31，地图 1073741915 日志 3040/3044；官方 1913 日志 3030 帧级对照）
> 来源：`verify/d2-client/`（D2 任务产物）+ 魔方 A 线六轮排查定论。
> 本文件是 client-nodegraph-development 技能的深度参考——照抄起步，按需裁剪。

## 0. 资产准备清单（一次性，全部 CLI 可完成）

```bash
# 1) 客户端图占位（若地图尚无 20002 图）：自动分配 ID（段起始 1082130433）
node bin/gsts.mjs assets:node-graphs create --gil <map.gil> --type 20002 --name <图名> --write

# 2) 技能配置：6 模板(自定义技能) + 瞬发 + body-f5 绑定客户端图
node bin/gsts.mjs assets:skill-config create --gil <map.gil> --template 6 --instant \
  --name <技能名> --graph-id <20002图ID> --write

# 3) 回传信号（客户端发送节点必须绑定真实信号三元组；str/int 已验，float/vec3 待验）
node bin/gsts.mjs assets:signals register --gil <map.gil> --name <信号名> --param tag:str --param val:int --write

# 4) 信号定义提取进源码（自动）：src/resources/signals.ts
```

模板×图类型×绑定位置速查（36/6/28 × 瞬发/普通全组合已闭合）：

| 模板 | 图类型 | 瞬发绑定 | 普通绑定 | 程序化施放 |
|---|---|---|---|---|
| 6 自定义技能 | 20002 | body `4[1].30.1.5` f5（轨道点 1073741825+7n） | 事件轨道 `4[2].45.1` f4（打点 1001/1004/1007） | ✅ 推荐 |
| 36 普通技能 | 20010 | body f5 | 事件轨道 f4（打点 3001） | ❌ 需按键/操控状态 |
| 28 自定义造物 | 20008 | body `4[1].78.1` f4（root20 联动） | 事件轨道 f4（打点 7001001） | 造物用 |

## 1. 服务端施放图（照抄版，基于 verify/d2-client/d2-skill.ts）

```typescript
import { g } from 'genshin-ts/runtime/core'
import { CharacterSkillSlot, OriginalSlotSkillHandling } from 'genshin-ts/definitions/enum'
import { XxxSignal } from './signals.js'

g.server({ id: <图id>, name: '<图名>' })
  .on('whenEntityIsCreated', (_evt, f) => {
    // 定时驱动（事件驱动亦可：When Custom Variable Changes / 信号监听）
    f.startTimer(f.getSelfEntity(), 'tick', true, [5])
  })
  .on('whenTimerIsTriggered', (_evt, f) => {
    // ① 角色实体动态获取（铁律：角色不可 GUID 寻址；实体必须是角色非玩家）
    const character = f.getCorrespondingValueFromList(
      f.getAllCharacterEntitiesOfSpecifiedPlayer(
        f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
      ),
      0n
    )
    // ② 装配（新角色保守步骤；CustomSkillSlot1=3121, Destroy=2810）
    f.addCharacterSkill(
      character, configId(<技能配置ID>n),
      CharacterSkillSlot.CustomSkillSlot1, OriginalSlotSkillHandling.Destroy
    )
    // ③ 创建实例（返回实例 ID，如 10000001——不是配置 ID）
    const inst = f.createCustomSkillInstance(character, configId(<技能配置ID>n))
    // ④ 实例 ID 中转（官方形态=玩家实体自定义变量'技能实例ID'；图变量亦可）
    const owner = f.getPlayerEntityToWhichTheCharacterBelongs(character)
    f.setCustomVariable(owner, '技能实例ID', inst, false)
    // ⑤ 施放（实例 ID + 不校验按键）
    f.castSpecifiedSkillInstance(
      character,
      f.getCustomVariable(owner, '技能实例ID').asType('int'),
      false
    )
    // ⑥ 打点（排查用，验收后可删）
    f.printString('cast-fired')
  })
  .onSignal(XxxSignal.<信号名>, (evt, f) => {
    f.printString(evt.params.tag)
    f.printString(f.dataTypeConversion(evt.params.val, 'str'))
  })
```

变体：
- **跨 tick 版**：②③④在一个定时器/初始化回调，⑤在下一个——实例 ID 用图变量中转
  （DSL `variables:{ probeSkillId: new int(0) }` 声明，无需注册）。同 tick 与跨 tick 均已验证可行。
- **官方事件驱动版**（1913 玩家-界面）：When Custom Variable Changes('指令') → 取角色 →
  读变量 → cast——适合"指令变量变化触发客户端计算"的生产形态。

## 2. 客户端图（照抄版，基于 verify/d2-client/d2-client-skill.ts）

```typescript
import { g } from 'genshin-ts/runtime/core'
import { XxxSignal } from './signals.js'

g.characterSkill({ id: <20002图id>, name: '<图名>' }).on('start', (_evt, f) => {
  // 「节点图开始」顺序执行；无定时器——一次 start 全算完（官方 191 节点图 1438 帧/次，无 f6 不计服务端负载）
  // 局部变量 API（对象式）：
  const score = f.localVariable('int', 42n, { name: 'score' })
  score.set(100n)          // set 后 score.value 读回 = 100（D2 已验）
  const list = f.localVariable('int_list', [1n, 2n, 3n], { name: 'seq' })
  // 读预注册的自定义变量（手段 3；未注册=读不到，head=04 无 OUT 行判据）
  // 回传服务器（手段 4）：
  f.sendSignalToServerNodeGraph(XxxSignal.<信号名>, 'set', score.value)
  f.sendSignalToServerNodeGraph(XxxSignal.<信号名>, 'len', f.getListLength(list.value))
})
```

编译注入差异（详见 SKILL.md 第三节八条）：主配置全图 `--noinject` 编译 → 单文件注入
（config.inject.nodeGraphId 指向 20002 图位）；客户端图不经 mounts attach。

## 3. 帧级预期（日志验收对照）

成功会话的记录序列（服务端图视角，数字为示意）：

```
rec_A  服务端图：… create 帧 OUT0:Integer=10000001（实例 ID）
       （addCharacterSkill 帧 IN2:EnumItem=3121 IN3:EnumItem=2810 OUT0=技能ID——OUT 空=被状态拦截！）
rec_B  服务端图：cast 帧 IN0:Entity=<角色> IN1:Integer=10000001 IN2:Boolean=（false）
rec_C  客户端图：f8=2097154 记录，head=图内节点序号，无 f6（紧随 cast 记录）
rec_D  服务端图：onSignal 触发（监听信号帧 + print 参数值）
```

失败形态速查（决策树详见 SKILL.md 第五节）：

| 日志形态 | 根因方向 |
|---|---|
| cast 帧全对、无 f8 记录、add 同链 OUT 空 | 角色控制类状态（禁锢）——第一嫌疑 |
| cast 帧全对、无 f8、模板 36 | 需操控状态——换 6+瞬发 |
| create OUT 空 | 实体链断（角色寻址） |
| f8 有、无 onSignal | 信号 def / 参数类型 |
| armed print 都无 | 服务端图没跑（挂载/图位） |

## 4. 排查方法论备忘（六轮排查沉淀）

1. **先全历史日志扫描**：`for f in *.gia; do gia_log.py $f records --summary | grep 2097154` ——
   确认目标地图"从未通过"还是"曾经通过"（历史记录只做线索，运行时证据为准）。
2. **跨地图阳性对照**：拿 1915/1916 做对照，可疑变量逐个对齐；技能配置可做字节级 diff
   （root15 f4[1] 记录），客户端图可做结构化 .gia diff（decode-gia）。
3. **帧级归因优先**：cast 输入全有效仍不触发时，问题必在"引擎层释放"而非"链路 wire"——
   查角色状态/技能类型/绑定形态，不要继续改图。
4. **用户是最快的编辑器侧事实来源**：节点图里搜不到的状态（禁锢=编辑器施加）直接问。
