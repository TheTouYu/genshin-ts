import { g } from 'genshin-ts/runtime/core'
import { int } from 'genshin-ts/runtime/value'

/**
 * T12 复现 · 《空中花园》式迷宫 —— 隐藏收集物逻辑
 *
 * 设计依据（逐条对应 docs/knowledge-graph/reproduction/T12-design.md）：
 *   决策 4：正常走出 = 正常通关；拿齐全部收集物 = 额外回馈
 *   决策 5：**不用动态文字**告诉玩家"有几个隐藏"——改用空间布局（几何层已落地）
 *   决策 8：不设单向门，本图不做任何封锁
 *
 * 实现要点（都取自图谱，不是拍脑袋）：
 *   - 事件用 `whenTabIsSelected`（选项卡选中时）——`src/definitions/zh_aliases.ts:63`
 *   - **不做"已收集列表"判重**：收集后立刻 `activateDisableTab` 关掉该实体的选项卡，
 *     同一隐藏物就点不到第二次，省掉一个容器（对应 D7 的容器负载提醒）
 *   - 即时反馈用 `activateDisableModelDisplay` 关掉该隐藏物模型
 *
 * 编译与注入（两条硬事实，都踩过）：
 *   1. **必须走正规入口** `node ./bin/gsts.mjs -c <config>`。
 *      `npx tsx src/cli/gsts.ts` 会因 src/dist 双副本导致
 *      `gsts.f is only available in server_* ctxType` 断言失败
 *      （`kCtxStack` 是 `Symbol`，两份 core.ts 各持一个）——见根 CLAUDE.md「类型与运行时单副本」。
 *   2. **信号节点需要目标地图的注册表**（`signal registry is required when encoding signal nodes`，
 *      `src/compiler/ir_to_gia_transform/build_signal_definition.ts:867`）。
 *      所以"集齐后发信号触发场景惊喜"这一步**无目标地图就编译不了**，
 *      必须等用户确认 mapId 并 `assets:signals register` 之后才能恢复。
 *      ——这是 T12 复现链上第一个真正需要用户输入的点，已在设计书 §六 登记。
 */

/** 隐藏收集物总数（与 gen-maze.py 产出的「隐藏_*」实体数一致） */
const TOTAL = 4n

g.server({
  id: 1073741931,
  variables: {
    /** 已收集数量：仅用于判定集齐 */
    已收集数: new int(0),
    /** 集齐后置真（供后续接入信号/惊喜逻辑时做幂等，当前仅记录状态） */
    已集齐: false
  }
}).on('whenTabIsSelected', (evt, f) => {
  // ① 判重 + 即时反馈：关掉该隐藏物的选项卡与模型，玩家立刻看到"收到了"
  f.activateDisableTab(evt.eventSourceEntity, evt.tabId, false)
  f.activateDisableModelDisplay(evt.eventSourceEntity, false)

  // ② 计数
  const collected = f.get('已收集数') + 1n
  f.set('已收集数', collected)

  // ③ 集齐判定：置标志位
  //    注：这里的"场景小惊喜"取信号方案时需要目标地图的信号注册表，故留待注入阶段接入。
  if (collected >= TOTAL) {
    f.set('已集齐', true)
  }
})
