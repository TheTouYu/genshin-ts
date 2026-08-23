/**
 * 灯阵教学关卡配置表（v7，2026-08-23 按用户反馈重构）
 *
 * 设计原则转变（2026-08-23 用户反馈 + 日志 2818 铁证）：
 *   旧 v6 六关（1×3 → … → 5×5）依然太难——整局 253 次点击、第一关就是 3×3。
 *   新设计：**关卡本身即教案**，每关用 presetMask 预置成"差一两步就全亮"的局面，
 *   让玩家在"轻松完成 + 感觉自己亲手点亮"的过程中逐个掌握 Lights Out 的技巧。
 *   全部关上限 3×3（砍掉 4×4/5×5），前 5 关都是 1 步解，只有第 6 关是真正的经典挑战。
 *
 * 由浅入深（每关一个教学点，预置掩码均已用 BFS 求解器验证为"1 步即全亮"）：
 *   L1 1×2 全灭  —— 认识"点击=点亮"（点任意一盏 → 两盏全亮，必赢）
 *   L2 1×3 全灭  —— 认识"点击会带动邻居"（点中间 → 三盏全亮）
 *   L3 2×2 单灯亮 —— 认识"点击翻转一个十字"（点对角 → 全亮）
 *   L4 2×3 三灯亮 —— 观察图案找缺口（点左上角 → 全亮）
 *   L5 3×3 四角亮 —— 十字心法：四角亮、点中心补全十字（1 步全亮）
 *   L6 3×3 全灭  —— 综合经典（唯一真正需要思考的挑战关）
 *
 * 索引 = row-major（iz*sizeX+ix）；presetMask 第 i 位 = 第 i 盏灯初始亮。
 * 资源 ID 不变（L1/L2/L3 复用 6129/6133/6134，L4/L5/L6 用 6200/6201/6202）；
 * 图 ID 按占位图自动分配（1825/1826/1827/1829/1830/1831）。
 * 灯头 prefab 1077936130 全关共用；中心点固定在 (5,5)。
 */
export interface LampConfig {
  graphId: number
  prefabId: number
  headPrefabId: number
  sizeX: bigint
  sizeZ: bigint
  originX: number
  originZ: number
  spacing: number
  winTarget: bigint
  level: number
  presetMask: bigint
}

const HEAD_PREFAB = 1077936130

export const LEVELS: LampConfig[] = [
  {
    // L1 1×2：点任意一盏即全亮（教学"点击=点亮"）
    level: 1,
    sizeX: 1n,
    sizeZ: 2n,
    originX: 5,
    originZ: 3.75,
    spacing: 2.5,
    winTarget: 2n,
    presetMask: 0n,
    prefabId: 1077936129,
    headPrefabId: HEAD_PREFAB,
    graphId: 1073741825,
  },
  {
    // L2 1×3：点中间带动两端（教学"邻居联动"）
    level: 2,
    sizeX: 1n,
    sizeZ: 3n,
    originX: 5,
    originZ: 2.5,
    spacing: 2.5,
    winTarget: 3n,
    presetMask: 0n,
    prefabId: 1077936133,
    headPrefabId: HEAD_PREFAB,
    graphId: 1073741826,
  },
  {
    // L3 2×2：只亮右下角（bit3=8），点左上角 → 全亮（教学"十字翻转"）
    level: 3,
    sizeX: 2n,
    sizeZ: 2n,
    originX: 3.75,
    originZ: 3.75,
    spacing: 2.5,
    winTarget: 4n,
    presetMask: 8n,
    prefabId: 1077936134,
    headPrefabId: HEAD_PREFAB,
    graphId: 1073741827,
  },
  {
    // L4 2×3：亮 {3,4,5}（= 56），点左上角 → 全亮（教学"观察找缺口"）
    level: 4,
    sizeX: 2n,
    sizeZ: 3n,
    originX: 3.75,
    originZ: 2.5,
    spacing: 2.5,
    winTarget: 6n,
    presetMask: 56n,
    prefabId: 1077936200,
    headPrefabId: HEAD_PREFAB,
    graphId: 1073741829,
  },
  {
    // L5 3×3：四角亮 {0,2,6,8}（= 325），点中心 → 全亮（教学"十字心法"）
    level: 5,
    sizeX: 3n,
    sizeZ: 3n,
    originX: 2.5,
    originZ: 2.5,
    spacing: 2.5,
    winTarget: 9n,
    presetMask: 325n,
    prefabId: 1077936201,
    headPrefabId: HEAD_PREFAB,
    graphId: 1073741830,
  },
  {
    // L6 3×3 经典全灭：综合挑战（唯一硬关）
    level: 6,
    sizeX: 3n,
    sizeZ: 3n,
    originX: 2.5,
    originZ: 2.5,
    spacing: 2.5,
    winTarget: 9n,
    presetMask: 0n,
    prefabId: 1077936202,
    headPrefabId: HEAD_PREFAB,
    graphId: 1073741831,
  },
]

/** 通关波浪总时长（s）：(总数-1)×0.15 + 显示缓冲 */
export const waveTotalSeconds = (cfg: LampConfig): number =>
  Number(cfg.sizeX * cfg.sizeZ - 1n) * 0.15 + 1.0