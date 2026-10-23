/**
 * ui/ 语义层类型（票 04）
 *
 * 概念树节点 schema（对齐 ui/DESIGN.md 3.2）：
 *   { id, path, role, kind, name, geometry?, children[], refs[], props{}, unknown[] }
 * - id：root9 502 记录为数值 ID；记录内虚拟子项（页签页面/消息项等）用字符串锚点
 *   （如 "2097:page#1"），path 始终唯一。
 * - 未知结构走 fail-closed：unknown[] 记录未解码字段/结构标记，不猜测语义。
 */

export type UiKind =
  | 'layout'
  | 'floating-page'
  | 'container'
  | 'library'
  | 'custom-button'
  | 'interactive-button'
  | 'custom-switch'
  | 'textbox'
  | 'image'
  | 'input-box'
  | 'message-queue'
  | 'tab'
  | 'close-button'
  | 'client-container'
  | 'client-container-node'
  | 'client-textbox'
  | 'client-cursor-area'
  | 'client-reference'
  | 'client-grid'
  | 'client-button'
  | 'client-textwindow'
  | 'client-keyhint'
  | 'client-image'
  | 'client-animation'
  | 'client-fullscreen-animation'
  | 'client-control'
  | 'template'
  | 'instance'
  | 'official'
  | 'asset'
  | 'asset-group'
  | 'material-group'
  | 'material-member'
  | 'style-group'
  | 'message-item'
  | 'tab-page'
  | 'unknown'

export type UiRole =
  | 'layout'
  | 'template'
  | 'instance'
  | 'official'
  | 'library'
  | 'group'
  | 'member'
  | 'internal'
  | 'unknown'

export type SurfacePlacement = 'layout' | 'container' | 'library'

export interface UiKindSpec {
  kind: UiKind
  label: string
  /** 合法放置面（DESIGN 1.2 用户权威 + 轮 64 实证） */
  placement: SurfacePlacement[]
  /** 默认几何（编辑器默认值；仅用于回显/校验，不写回） */
  defaultGeometry?: { size: readonly [number, number] }
}

/**
 * 类型注册表（元数据驱动）。
 * 判别 = 组件签名 + parent 上下文 + kind 常量；新增类型只需加 schema，不写新函数。
 */
export const UI_KIND_REGISTRY: Record<UiKind, UiKindSpec> = {
  layout: { kind: 'layout', label: '布局', placement: [] },
  'floating-page': { kind: 'floating-page', label: '悬浮交互页', placement: ['library'] },
  container: { kind: 'container', label: '页面容器', placement: [] },
  library: { kind: 'library', label: '控件组库', placement: [] },
  'custom-button': {
    kind: 'custom-button',
    label: '自定义按钮',
    placement: ['layout', 'container'],
    defaultGeometry: { size: [180, 52] }
  },
  'interactive-button': {
    kind: 'interactive-button',
    label: '交互按钮',
    placement: ['layout', 'container'],
    defaultGeometry: { size: [180, 52] }
  },
  'custom-switch': {
    kind: 'custom-switch',
    label: '自定义开关',
    placement: ['layout', 'container'],
    defaultGeometry: { size: [180, 52] }
  },
  textbox: { kind: 'textbox', label: '文本框', placement: ['layout', 'container'] },
  image: { kind: 'image', label: '图片', placement: ['layout', 'container'] },
  'input-box': { kind: 'input-box', label: '图文输入框', placement: ['layout', 'container'] },
  'message-queue': {
    kind: 'message-queue',
    label: '消息队列',
    placement: ['layout', 'container'],
    defaultGeometry: { size: [150, 150] }
  },
  tab: {
    kind: 'tab',
    label: '页签',
    placement: ['container'],
    defaultGeometry: { size: [500, 100] }
  },
  'close-button': { kind: 'close-button', label: '交互页关闭按钮', placement: [] },
  // 客户端控件（UI 控件模板/容器内；判别=compTypes 84–99 + 23/86，见 client-kinds.ts）
  'client-container': { kind: 'client-container', label: '客户端控件容器', placement: ['layout'] },
  'client-container-node': { kind: 'client-container-node', label: '容器节点', placement: ['container'] },
  'client-textbox': { kind: 'client-textbox', label: '文本框', placement: ['container'] },
  'client-cursor-area': { kind: 'client-cursor-area', label: '光标检测区域', placement: ['container'] },
  'client-reference': { kind: 'client-reference', label: '模板引用控件', placement: ['container'] },
  'client-grid': { kind: 'client-grid', label: '网格视窗', placement: ['container'] },
  'client-button': { kind: 'client-button', label: '预设按钮', placement: ['container'] },
  'client-textwindow': { kind: 'client-textwindow', label: '文本视窗', placement: ['container'] },
  'client-keyhint': { kind: 'client-keyhint', label: '按键提示', placement: ['container'] },
  'client-image': { kind: 'client-image', label: '图片', placement: ['container'] },
  'client-animation': { kind: 'client-animation', label: '界面动效', placement: ['container'] },
  'client-fullscreen-animation': {
    kind: 'client-fullscreen-animation',
    label: '全屏界面动效',
    placement: ['container']
  },
  'client-control': { kind: 'client-control', label: '客户端控件', placement: ['container'] },
  template: { kind: 'template', label: '控件模板', placement: [] },
  instance: { kind: 'instance', label: '实例', placement: [] },
  official: { kind: 'official', label: '官方预制', placement: [] },
  asset: { kind: 'asset', label: '素材容器', placement: [] },
  'asset-group': { kind: 'asset-group', label: '素材组', placement: [] },
  'material-group': { kind: 'material-group', label: '状态素材组', placement: [] },
  'material-member': { kind: 'material-member', label: '素材成员', placement: [] },
  'style-group': { kind: 'style-group', label: '样式素材组', placement: [] },
  'message-item': { kind: 'message-item', label: '消息项', placement: [] },
  'tab-page': { kind: 'tab-page', label: '页签页面项', placement: [] },
  unknown: { kind: 'unknown', label: '未知', placement: [] }
}

export interface UiGeometry {
  /** 编辑器绝对坐标（1600×900 中心 = 800,450） */
  position?: readonly [number, number]
  size?: readonly [number, number]
  /** 设备槽数量（键鼠/移动触屏/主机手柄/移动手柄） */
  deviceSlots: number
  /** 各设备槽是否一致；不一致时 geometry 仅回显槽 0 并标记 unknown */
  slotsConsistent: boolean
}

export interface UiSemanticNode {
  id: number | string
  path: string
  role: UiRole
  kind: UiKind
  name: string
  geometry?: UiGeometry
  children: UiSemanticNode[]
  refs: Record<string, Array<number | string>>
  props: Record<string, unknown>
  unknown: string[]
}

/** root9 502 记录元数据（wire 层，用于语义树构建） */
export interface UiRecordMeta {
  id: number
  raw: Uint8Array
  fields: readonly import('../../src/cli/static_assembly/wire.js').WireField[]
  /** f505 内容组件 type 码（t15/t23/t12/t25/t38/t45/t50...） */
  compTypes: number[]
  /** 顶层 f502 槽 record family type 码（layout=7 / template=4 / instance=3 / official=5 / asset=55 / group=6） */
  familyTypes: number[]
  kind: UiKind
  role: UiRole
  name: string
  parentId: number | null
  /** 是否在 root9 f501 顶层索引 */
  indexed: boolean
}

export interface UiSemanticOptions {
  /** 只输出扁平视图（不构建树） */
  flatOnly?: boolean
  /** kind 过滤 */
  kind?: UiKind
  /** path 子串过滤 */
  path?: string
}

export interface UiSemanticView {
  schemaVersion: number
  kind: 'ui-semantic-view'
  mapId?: string
  sourceSha256: string
  recordSetHash: string
  tree: UiSemanticNode[]
  flat: UiSemanticNode[]
}

export interface UiAnchorFile {
  schemaVersion: number
  kind: 'ui-anchor'
  mapId: string
  anchors: Record<
    string,
    {
      label: string
      createdAt: string
      sourceSha256: string
      recordSetHash: string
      nodes: UiSemanticNode[]
      tree: UiSemanticNode[]
    }
  >
}
