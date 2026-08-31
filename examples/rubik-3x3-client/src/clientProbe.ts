// rubik-3x3-client 第 1 轮：最小客户端图实验
//
// 目标：打通 gstsClient DSL（20010 角色操控技能图）→ 编译 → 注入 → 游戏运行 → 日志
// （客户端图记录 f8=2097154）的完整链路。
//
// 触发方式（参照魔方-客户端优化版本架构）：服务器施放技能实例 → 技能「节点图事件轨道」打点
// → 客户端图「节点图开始」顺序执行。技能配置与事件轨道绑定是编辑器侧工作（地图 1073741914）。
//
// 本图极简逻辑：设置局部变量 → 读回 → 向服务器节点图发送信号 rubik3x3_client_probe
// （check='client-probe'、val=str(计数)）。服务器 game 图监听该信号并 printString，
// 服务器日志 f22 文本可 grep 'client-probe' 命中，客户端侧记录 f8=2097154。
// 注意：客户端图里 str/int/bool/float/list 是全局转换函数（TS 转换改写为 dataTypeConversion），
// 不要从 'genshin-ts/runtime/value' 导入（那是服务端的类构造器，运行时会炸）。
import { g } from 'genshin-ts/runtime/core'

/**
 * 20002 客户端图 id（角色技能图，地图 1073741914 内编辑器创建的空图）。
 * 2026-08-31 用户定论：触发技能用「角色自定义技能」（template 6）而非角色操控技能（20010/36）
 * ——历史跑通组合 = 1098907651（6+瞬发，body-f5 绑定 1082130434）。
 */
export const CLIENT_PROBE_GRAPH_ID = 1082130434

g.characterSkill({
  id: CLIENT_PROBE_GRAPH_ID,
  name: '_GSTS_clientProbe'
}).on('start', (_evt, f) => {
  f.setLocalVariable('probeCount', 42n)
  const count = f.getLocalVariable('probeCount').asType('int')
  f.sendSignalToServerNodeGraph('rubik3x3_client_probe', 'client-probe', str(count))
})
