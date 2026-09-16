import { g } from 'genshin-ts/runtime/core'
import { Signal } from './signals.js'

/**
 * T12 复现 · 《空中花园》式迷宫 —— 隐藏收集物「拾取」图（图 id 1073741825）
 *
 * ## 本图必须挂 4 份（这是设计约束，不是选择）
 *
 * `docs/game-engine-knowledge/components.md:111`（2026-08-13 魔方 P4 最小实验闭合）：
 *   > 事件名 **whenTabIsSelected**；节点图**挂载在挂载选项卡组件的实体上**触发
 *
 * 4 个隐藏物各自带 tabBar 组件 → **每个实体上都要挂这张图**，否则那个隐藏物点不动。
 *
 * ## 所以本图刻意做成「无状态」
 *
 * 项目已闭合规则：**节点图变量不跨实例**（同一模板摆两个的图变量不互通）。
 * 若在本图里用 `已收集数` 计数，4 份实例会各数各的 → 永远到不了 4 → 集齐回馈永不触发。
 * （2026-09-16 在注入阶段抓到这条，见 PROGRESS.md「架构修正」节。）
 *
 * 因此本图只做两件**只依赖自身**的事，计数交给 `maze-counter.ts`（单实例）：
 *   ① 关掉自己的选项卡 + 模型（判重 + 即时反馈）
 *   ② 发一个信号出去
 *
 * 判重仍不需要容器：关掉选项卡后同一隐藏物就点不到第二次（对应 D7 容器负载提醒）。
 *
 * ## 编译与注入的两条硬事实（都踩过）
 *   1. **必须走正规入口** `node ./bin/gsts.mjs -c <config>`；`npx tsx src/cli/gsts.ts`
 *      会因 src/dist 双副本抛 `gsts.f is only available in server_* ctxType`
 *      （`kCtxStack` 是 `Symbol`，两份 core.ts 各持一个）——见根 CLAUDE.md「类型与运行时单副本」。
 *   2. **信号是编译期强前置**（R13，`build_signal_definition.ts:867`）——
 *      信号未在目标地图注册则编译直接失败，故 `.gia` 与 mapId 绑定，不能先写图后挑图。
 */
g.server({ id: 1073741825 }).on('whenTabIsSelected', (evt, f) => {
  // ① 判重 + 即时反馈：关掉该隐藏物的选项卡与模型，玩家立刻看到「收到了」
  f.activateDisableTab(evt.eventSourceEntity, evt.tabId, false)
  f.activateDisableModelDisplay(evt.eventSourceEntity, false)

  // ② 上报：由中心图（maze-counter）累加与判定集齐
  f.sendSignal(Signal.T12隐藏物已拾取, evt.tabId)
})
