// 千星 GIA/GIL 客户端控件共通 protobuf schema（2026-10-16 移植自模拟器仓
// studio/gia/codec.js 内嵌的 GIA_PROTO 逆向文本，授权提取，D271 共性定谳）。
// GIA 与 .gil r9[2] 是同一 proto message 树的两种容器：
//   GIA  = Root{graph: GraphUnit[]} 标准 GIA 文件（protobufjs 编码）
//   .gil = r9[2] 内 ContentWrapper 流（UiControlGroup.content 的 wire 序列化）
// 关键互认锚（三轮编辑器差分实证）：
//   ContentWrapper.guid=501/info=502/children=503/parent=504/data=505
//   Details.GenericSlot=74（f74 脚本挂载槽，D268）
//   ScriptMapping.{id=1,name=2,file_path=3,source=5}（f50 登记表字段族）
//   RectTransform.{scale=501,anchorMin=502,anchorMax=503,offset=504,size=505,pivot=506}
import protobuf from 'protobufjs'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const protoText = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'gia_proto.proto'),
  'utf8'
)

const { root: protobufRoot } = protobuf.parse(protoText, { keepCase: false })

export const RootType = protobufRoot.lookupType('Root')
export const UiControlGroupType = protobufRoot.lookupType('UiControlGroup')
export const ContentWrapperType = protobufRoot.lookupType('UiControlGroup.ContentWrapper')
export const GraphUnitType = protobufRoot.lookupType('GraphUnit')

/** 控件种类码（PRESET_INDEX，Transform.MultiPlatform.field502 用） */
export const PRESET_INDEX: Record<string, number> = {
  image: 23,
  'server-container': 24,
  container: 25,
  grid: 26,
  reference: 27,
  button: 28,
  animation: 29,
  fullscreen: 30,
  textbox: 31,
  textwindow: 32,
  cursor: 33,
  keyhint: 34
}

/** 平台序（Transform.MultiPlatform.platforms[].platformType） */
export const PLATFORM_INDEX: Record<string, number> = {
  KEYBOARD: 0,
  TOUCHSCREEN: 1,
  CONTROLLER_CONSOLE: 2,
  CONTROLLER_MOBILE: 3
}

export const PLATFORMS = ['KEYBOARD', 'TOUCHSCREEN', 'CONTROLLER_CONSOLE', 'CONTROLLER_MOBILE'] as const
export type PlatformName = (typeof PLATFORMS)[number]
