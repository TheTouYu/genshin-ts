import { buildSemanticView } from './tree.js'
import type { UiSemanticOptions, UiSemanticView } from './types.js'

/**
 * ui/src/index.ts — 语义层公开 API（票 04）
 *
 * 只读命令核心：list / anchor save|list / diff --anchor 全部走这里；
 * `src/cli/assets_ui.ts` 只负责 CLI 参数接线与 GIL 路径解析。
 */

export * from './types.js'
export * from './record.js'
export * from './tree.js'
export * from './anchor.js'
export * from './diff.js'

export function buildUiSemanticView(
  bytes: Uint8Array,
  options?: UiSemanticOptions
): UiSemanticView {
  return buildSemanticView(bytes, options)
}
