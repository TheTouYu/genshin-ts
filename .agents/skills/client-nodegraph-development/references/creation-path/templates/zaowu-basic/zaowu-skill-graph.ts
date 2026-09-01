import { g } from 'genshin-ts/runtime/core'

import { ZaowuSignal } from './signals.js'

// 造物技能路径探针·20008 造物技能图（C 线 Round 0，2026-08-31，地图 1073741915「变量」）
//
// 与角色技能路径（f2=6→20002，服务端 castSpecifiedSkillInstance 施放，已通）对照，
// 本路径触发权完全在客户端 AI，服务端零参与（官方教程 3.19 标准形态）：
//
//   复杂造物（遗迹守卫，编辑器布设）
//     → 造物状态决策图 _GSTS_zaowuDecision（20007）无条件切换
//     → 造物状态图 _GSTS_zaowuStatus（20009）executeSkill(技能序号 1)
//     → 自定义造物技能 1191182337（f2=28+瞬发，CLI 建配，body 78.1.4 绑本图）
//     → 本图「节点图开始」执行 → sendSignalToServerNodeGraph 回传
//     → 服务器监听图 _GSTS_zaowuListen（1073741830）onSignal 打印。
//
// 期望日志签名（服务器日志 f22，每次施放一条，受技能默认冷却区间节流）：
//   creation-skill-fired v1
g.creationSkill({ id: 1082130436, name: '_GSTS_zaowuSkill' }).on('start', (_evt, f) => {
  f.sendSignalToServerNodeGraph(ZaowuSignal.zaowu_probe, 'creation-skill-fired', 'v1')
})
