// 3×3 逻辑表（由 tools/gen-3x3-logic-table.mjs 生成，CubeLib 验证）——勿手改
// 供 game.ts 图变量 int_list 初始值使用

export const faceCornerFrom = [1n, 3n, 5n, 7n, 0n, 2n, 4n, 6n, 0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 2n, 3n, 6n, 7n, 0n, 1n, 4n, 5n]
export const faceCornerTo = [5n, 1n, 7n, 3n, 2n, 6n, 0n, 4n, 1n, 3n, 0n, 2n, 6n, 4n, 7n, 5n, 3n, 7n, 2n, 6n, 4n, 0n, 5n, 1n]
export const faceCornerTwist = [1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n]
export const faceEdgeFrom = [1n, 5n, 8n, 10n, 3n, 7n, 9n, 11n, 0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 0n, 4n, 8n, 9n, 2n, 6n, 10n, 11n]
export const faceEdgeTo = [10n, 8n, 1n, 5n, 9n, 11n, 7n, 3n, 3n, 0n, 1n, 2n, 5n, 6n, 7n, 4n, 8n, 9n, 4n, 0n, 11n, 10n, 2n, 6n]
export const faceEdgeFlip = [0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n]
export const middleEdgeFrom = [0n, 2n, 4n, 6n, 8n, 9n, 10n, 11n, 1n, 3n, 5n, 7n]
export const middleEdgeTo = [4n, 0n, 6n, 2n, 10n, 8n, 11n, 9n, 5n, 1n, 7n, 3n]
export const middleEdgeFlip = [1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n]
export const middleCenterFrom = [0n, 1n, 2n, 3n, 2n, 3n, 4n, 5n, 0n, 1n, 4n, 5n]
export const middleCenterTo = [2n, 3n, 1n, 0n, 4n, 5n, 3n, 2n, 4n, 5n, 1n, 0n]
export const wholeCornerFrom = [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n]
export const wholeCornerTo = [4n, 5n, 0n, 1n, 6n, 7n, 2n, 3n, 1n, 3n, 0n, 2n, 5n, 7n, 4n, 6n, 1n, 5n, 3n, 7n, 0n, 4n, 2n, 6n]
export const wholeCornerTwist = [1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n]
export const wholeEdgeFrom = [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n, 0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n, 0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n]
export const wholeEdgeTo = [2n, 10n, 6n, 11n, 0n, 8n, 4n, 9n, 1n, 3n, 5n, 7n, 3n, 0n, 1n, 2n, 7n, 4n, 5n, 6n, 9n, 11n, 8n, 10n, 8n, 5n, 10n, 1n, 9n, 7n, 11n, 3n, 4n, 0n, 6n, 2n]
export const wholeEdgeFlip = [1n, 0n, 0n, 1n, 1n, 0n, 0n, 1n, 1n, 0n, 0n, 1n, 1n, 0n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n]
export const wholeCenterFrom = [0n, 1n, 2n, 3n, 4n, 5n, 0n, 1n, 2n, 3n, 4n, 5n, 0n, 1n, 2n, 3n, 4n, 5n]
export const wholeCenterTo = [3n, 2n, 0n, 1n, 4n, 5n, 0n, 1n, 5n, 4n, 2n, 3n, 4n, 5n, 2n, 3n, 1n, 0n]

// 26 个块实体顺序：角 0..7 / 棱 8..19 / 心 20..25
export const BLOCK_PREFAB_IDS = [
  1077936155n,
  1077936157n,
  1077936149n,
  1077936151n,
  1077936172n,
  1077936174n,
  1077936166n,
  1077936168n,
  1077936150n,
  1077936154n,
  1077936156n,
  1077936152n,
  1077936167n,
  1077936171n,
  1077936173n,
  1077936169n,
  1077936160n,
  1077936158n,
  1077936165n,
  1077936163n,
  1077936153n,
  1077936170n,
  1077936159n,
  1077936164n,
  1077936162n,
  1077936161n
]
