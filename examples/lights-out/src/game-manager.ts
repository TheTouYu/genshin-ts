// 灯阵关卡管理图 v6（最小图 1073741890，2026-08-22 重构）
// 挂载：管理台实体 1077936191（tabBar「开始游戏」）
//
// 新流程：
//  ① 管理台创建 → 待开始（仅管理台 + 引导牌，无关卡）
//  ② 点「开始游戏」→ 动态创建关卡 1（按 LEVELS[0] 参量）
//  ③ 通关(level_clear) → 控制台旋转庆祝 → 广播 win_wave(level) 触发波浪动画
//                  → 计时 buildNext 0.3 s 后创建下一关
//  ④ 全部通关 → game-clear + 30 s 自动胜利结算
//  ⑤ 注：「重开本关」「返回上一关」「提示」三项交互（批次 3）预留位置
import { defineSignal, g } from 'genshin-ts/runtime/core'
import { listLiteral, str } from 'genshin-ts/runtime/value'
import { SettlementStatus } from 'genshin-ts/definitions/enum'
import { LEVELS, waveTotalSeconds } from './levels.js'

// 解析期常量：每个关卡的编译期配置（避免在 handler 内用 LEVELS[i]，
// Stage 2 IR 构建无法把 JS 数组下标作为图节点解析）。
const L1 = LEVELS[0]
const L2 = LEVELS[1]
const L3 = LEVELS[2]
const L4 = LEVELS[3]
const L5 = LEVELS[4]
const L6 = LEVELS[5]

const M = {
  level_clear: defineSignal('level_clear', [['level', 'int']]),
  win_wave: defineSignal('win_wave', [['level', 'int']]),
  lamp_wipe: defineSignal('lamp_wipe', [['level', 'int']]),
  // 批次 3：管理台交互扩展
  level_restart: defineSignal('level_restart', [['level', 'int']]),
  level_back: defineSignal('level_back', [['level', 'int']]),
  level_hint_ask: defineSignal('level_hint_ask', [['level', 'int']]),
  lamp_hint: defineSignal('lamp_hint', [['level', 'int'], ['seq', 'int']]),
} as const

// 单灯柱位置生成（闭包内联，未走 f.division 等运行时节点）
// sizeX, sizeZ, spacing, originX, originZ 为编译期常量
const buildLevelBlock = (
  f: any,
  self: any,
  cfg: typeof LEVELS[number],
) => {
  const n = cfg.sizeX * cfg.sizeZ
  for (let k = 0n; k < n; k++) {
    const ix = f.moduloOperation(k, cfg.sizeX)
    const iz = f.division(k, cfg.sizeX)
    const x = f.addition(
      cfg.originX,
      f.multiplication(f.dataTypeConversion(ix, 'float'), cfg.spacing),
    )
    const z = f.addition(
      cfg.originZ,
      f.multiplication(f.dataTypeConversion(iz, 'float'), cfg.spacing),
    )
    f.createPrefab(
      cfg.prefabId,
      f.create3dVector(x, 0, z),
      f.create3dVector(0, 0, 0),
      self,
      false,
      0,
      new listLiteral('int'),
    )
  }
  f.printString(`level${cfg.level}-ready`)
}

const graph = g
  .server({ id: 1073741828 })

  // ① 管理台就绪
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    f.printString('manager-ready')
  })

  // ② TabBar 分支：1 开始 / 2 重开本关 / 3 返回上一关 / 4 提示
  .on('whenTabIsSelected', (evt: any, f: any) => {
    const self = f.getSelfEntity()
    f.doubleBranch(
      f.equal(evt.tabId, 1),
      () => {
        f.printString('game-start-clicked')
        f.printString('level1-building')
        buildLevelBlock(f, self, L1)
        // 交互修复（2026-08-23 日志 2818：game-start-clicked 出现 12 次 → 重复建关）：
        // 建完第一关后立刻禁用「开始游戏」选项卡，游玩期间点不到，避免误触重复开灯。
        f.activateDisableTab(self, 1, false)
        f.printString('start-tab-disabled')
      },
      () => {
        f.doubleBranch(
          f.equal(evt.tabId, 2),
          () => {
            // 重开本关：清空当前所有灯柱再重建第一关
            f.printString('restart-clicked')
            f.sendSignal(M.lamp_wipe, 1)
            f.sendSignal(M.lamp_wipe, 2)
            f.sendSignal(M.lamp_wipe, 3)
            f.sendSignal(M.lamp_wipe, 4)
            f.sendSignal(M.lamp_wipe, 5)
            f.sendSignal(M.lamp_wipe, 6)
            f.startTimer(self, 'restart', false, [0.5])
          },
          () => {
            f.doubleBranch(
              f.equal(evt.tabId, 3),
              () => {
                f.printString('back-clicked')
                // 返回上一关：清空当前关卡 + 重建第一关（简化：回到起点）
                f.sendSignal(M.lamp_wipe, 1)
                f.sendSignal(M.lamp_wipe, 2)
                f.sendSignal(M.lamp_wipe, 3)
                f.sendSignal(M.lamp_wipe, 4)
                f.sendSignal(M.lamp_wipe, 5)
                f.sendSignal(M.lamp_wipe, 6)
                f.startTimer(self, 'back', false, [0.5])
              },
              () => {
                f.doubleBranch(
                  f.equal(evt.tabId, 4),
                  () => {
                    f.printString('hint-clicked')
                    // 提示：随机点亮一盏当前关卡未亮的灯（简化：对关卡 1）
                    const seq = f.getRandomInteger(0n, 2n)
                    f.sendSignal(M.lamp_hint, 1, seq)
                  },
                  () => {},
                )
              },
            )
          },
        )
      },
    )
  })

  // ③④ 通关 → 波浪动画 → 倒计时创建下一关
  .onSignal(M.level_clear, (evt: any, f: any) => {
    const self = f.getSelfEntity()
    const level = evt.params.level
    // 控制台旋转庆祝 + 广播波浪信号
    f.addUniformBasicRotationBasedMotionDevice(self, 'celebrate', 2.0, 180, [0, 1, 0])
    f.printString('console-spin')
    f.sendSignal(M.win_wave, level)
    // 按关卡选择波浪时长（常量表已离线计算为 number）
    f.doubleBranch(
      f.equal(level, 1),
      () => {
        f.startTimer(self, 'wipe1', false, [1.15 + 0.2])
        f.startTimer(self, 'build2', false, [1.15 + 0.3])
      },
      () => {
        f.doubleBranch(
          f.equal(level, 2),
          () => {
            f.startTimer(self, 'wipe2', false, [1.3 + 0.2])
            f.startTimer(self, 'build3', false, [1.3 + 0.3])
          },
          () => {
            f.doubleBranch(
              f.equal(level, 3),
              () => {
                f.startTimer(self, 'wipe3', false, [1.45 + 0.2])
                f.startTimer(self, 'build4', false, [1.45 + 0.3])
              },
              () => {
                f.doubleBranch(
                  f.equal(level, 4),
                  () => {
                    f.startTimer(self, 'wipe4', false, [1.75 + 0.2])
                    f.startTimer(self, 'build5', false, [1.75 + 0.3])
                  },
                  () => {
                    f.doubleBranch(
                      f.equal(level, 5),
                      () => {
                        f.startTimer(self, 'wipe5', false, [2.2 + 0.2])
                        f.startTimer(self, 'build6', false, [2.2 + 0.3])
                      },
                      () => {
                        // level 6：触发 win30，wipe 由波浪本身（已是 win_wave）触发；
                        // 不再创建 build7
                        f.startTimer(self, 'wipe6', false, [2.2 + 0.2])
                      },
                    )
                  },
                )
              },
            )
          },
        )
      },
    )
    f.printString(`level${level}-complete`)
  })

  // 倒计时创建下一关 / 全部通关 → 30 s 自动胜利
  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    const self = f.getSelfEntity()
    f.doubleBranch(
      f.equal(evt.timerName, new str('build2')),
      () => {
        f.printString('level2-building')
        buildLevelBlock(f, self, L2)
      },
      () => {
        f.doubleBranch(
          f.equal(evt.timerName, new str('build3')),
          () => {
            f.printString('level3-building')
            buildLevelBlock(f, self, L3)
          },
          () => {
            f.doubleBranch(
              f.equal(evt.timerName, new str('build4')),
              () => {
                f.printString('level4-building')
                buildLevelBlock(f, self, L4)
              },
              () => {
                f.doubleBranch(
                  f.equal(evt.timerName, new str('build5')),
                  () => {
                    f.printString('level5-building')
                    buildLevelBlock(f, self, L5)
                  },
                  () => {
                    f.doubleBranch(
                      f.equal(evt.timerName, new str('build6')),
                      () => {
                        f.printString('level6-building')
                        buildLevelBlock(f, self, L6)
                      },
                      () => {
                        f.doubleBranch(
                          f.equal(evt.timerName, new str('wipe1')),
                          () => {
                            f.sendSignal(M.lamp_wipe, 1)
                            f.printString('wipe1-sent')
                          },
                          () => {
                            f.doubleBranch(
                              f.equal(evt.timerName, new str('wipe2')),
                              () => {
                                f.sendSignal(M.lamp_wipe, 2)
                                f.printString('wipe2-sent')
                              },
                              () => {
                                f.doubleBranch(
                                  f.equal(evt.timerName, new str('wipe3')),
                                  () => {
                                    f.sendSignal(M.lamp_wipe, 3)
                                    f.printString('wipe3-sent')
                                  },
                                  () => {
                                    f.doubleBranch(
                                      f.equal(evt.timerName, new str('wipe4')),
                                      () => {
                                        f.sendSignal(M.lamp_wipe, 4)
                                        f.printString('wipe4-sent')
                                      },
                                      () => {
                                        f.doubleBranch(
                                          f.equal(evt.timerName, new str('wipe5')),
                                          () => {
                                            f.sendSignal(M.lamp_wipe, 5)
                                            f.printString('wipe5-sent')
                                          },
                                          () => {
                                            f.doubleBranch(
                                              f.equal(evt.timerName, new str('wipe6')),
                                              () => {
                                                f.sendSignal(M.lamp_wipe, 6)
                                                f.printString('wipe6-sent')
                                              },
                                              () => {
                                                f.doubleBranch(
                                                  f.equal(evt.timerName, new str('win30')),
                                                  () => {
                                                    const player =
                                                      f.getPlayerEntityToWhichTheCharacterBelongs(self)
                                                    f.setPlayerSettlementSuccessStatus(
                                                      player,
                                                      SettlementStatus.Victory,
                                                    )
                                                    f.printString('win-auto-30s')
                                                  },
                                                  () => {},
                                                )
                                              },
                                            )
                                          },
                                        )
                                      },
                                    )
                                  },
                                )
                              },
                            )
                          },
                        )
                      },
                    )
                  },
                )
              },
            )
          },
        )
      },
    )
  })

  // 当 LEVEL 6 通关时，win_wave 后 4 s 启动结算
  .onSignal(M.win_wave, (evt: any, f: any) => {
    const self = f.getSelfEntity()
    f.doubleBranch(
      f.equal(evt.params.level, 6),
      () => {
        f.printString('game-clear')
        // 全通后重新启用「开始游戏」，允许下一局重开
        f.activateDisableTab(self, 1, true)
        f.printString('start-tab-enabled')
        f.startTimer(self, 'win30', false, [30.0])
      },
      () => {},
    )
  })

  // 处理 restart / back 定时器：在 0.5 s 后重新创建第 1 关（示例）
  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    const self = f.getSelfEntity()
    f.doubleBranch(
      f.equal(evt.timerName, new str('restart')),
      () => {
        f.printString('restart-building')
        buildLevelBlock(f, self, L1)
      },
      () => {
        f.doubleBranch(
          f.equal(evt.timerName, new str('back')),
          () => {
            f.printString('back-building')
            buildLevelBlock(f, self, L1)
          },
          () => {},
        )
      },
    )
  })

export default graph
