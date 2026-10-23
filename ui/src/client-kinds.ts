/**
 * ui/src/client-kinds.ts — 客户端控件判别表（2026-10-23 hl 差分，零差分可得）
 *
 * 客户端控件与服务端 UI 控件共用 root9 记录，但组件签名是另一段：
 *   基础码 = 15（通用）+ 86（客户端控件标记）；容器组 = 15 + 23（无 86）。
 *   类型码（从 hl 的 11 个官方预制实测读出，互不冲突）：
 *     84 文本框 · 85 光标检测区域 · 89 模板引用控件 · 91 容器节点 · 92 网格视窗
 *     93 预设按钮 · 94 文本视窗 · 95 按键提示 · 96(+97) 图片 · 98 界面动效 · 99 全屏界面动效
 * 证据：~/genshin-ts-evidence/ui-layout-attach/2026-10-23-hl-container/raw/hl-v1-empty-container.gil
 * 规则：references/ui-controls.md「布局挂载」；服务端表见 types.ts UI_KIND_REGISTRY。
 */

import type { UiKind } from './types.js'

/** 类型码 → 语义 kind（服务端控件码 25/38/45/50-54/11+43/44/76-79 与本段不冲突） */
export const CLIENT_KIND_BY_CODE: Readonly<Record<number, UiKind>> = {
  84: 'client-textbox',
  85: 'client-cursor-area',
  89: 'client-reference',
  91: 'client-container-node',
  92: 'client-grid',
  93: 'client-button',
  94: 'client-textwindow',
  95: 'client-keyhint',
  96: 'client-image',
  98: 'client-animation',
  99: 'client-fullscreen-animation'
}

/** 判别顺序：容器组(23) → 客户端标记(86)+类型码 → 未知 86 */
const ORDER = [84, 85, 89, 91, 92, 93, 94, 95, 96, 98, 99] as const

/**
 * 服务端 UI 控件签名码（用于排除：23 是通用 group 标记，服务端按钮也带 23）。
 * 见 types.ts UI_KIND_REGISTRY 与 record.ts kindOfRecord 的判别链。
 */
const SERVER_SIGNATURES = new Set([11, 25, 38, 44, 45, 46, 47, 48, 49, 50, 52, 54, 58, 76, 77, 78, 79])

export function clientKindOf(compTypes: readonly number[]): UiKind | undefined {
  if (!compTypes.includes(15)) return undefined
  const hasClientMarker = compTypes.includes(86)
  // 容器组：23(通用 group) + 82(客户端容器组) 且无服务端控件签名（服务端按钮也带 23，实测 1073742032）
  if (
    compTypes.includes(23) &&
    compTypes.includes(82) &&
    !hasClientMarker &&
    !compTypes.some((code) => SERVER_SIGNATURES.has(code))
  ) {
    return 'client-container'
  }
  if (!hasClientMarker) return undefined
  for (const code of ORDER) {
    if (compTypes.includes(code)) return CLIENT_KIND_BY_CODE[code]
  }
  return 'client-control'
}
