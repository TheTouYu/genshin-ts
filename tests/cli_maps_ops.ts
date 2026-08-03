import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { buildFile, decodeUtf8, readUint32BE } from '../src/injector/binary.js'
import { readGilPayloadFields } from '../src/cli/gil_extract_utils.js'
import { createMap, listMaps, renameMap } from '../src/cli/maps.js'
import { emitWireMessage, parseWireMessage, printableWireText } from '../src/cli/static_assembly/wire.js'

// 临时目录：saveLevelDir = <tmp>/110170759/Beyond_Local_Save_Level（父目录名 = 账号 ID）
const root = mkdtempSync(path.join(tmpdir(), 'gsts-maps-ops-'))
const saveLevelDir = path.join(root, '110170759', 'Beyond_Local_Save_Level')
mkdirSync(saveLevelDir, { recursive: true })
const playerId = 110170759

// 用真实编辑器 .gip 快照副本作为注册表基线（轮 6 捕获，含 17 张图）
const gipPath = path.join(saveLevelDir, '..', 'Beyond_Local_Save_Player.gip')
writeFileSync(gipPath, readFileSync('/home/h/genshin-ts-evidence/map-name/exp2/raw/player-before.gip'))
const gipEntryCount = () =>
  parseWireMessage(readGilPayloadFields(gipPath).payload)!.filter(
    (f) => f.number === 2 && f.wire === 2
  ).length
const gipNameOf = (mapId: number) => {
  const root = parseWireMessage(readGilPayloadFields(gipPath).payload)!
  for (const f of root) {
    if (f.number !== 2 || f.wire !== 2) continue
    const entry = parseWireMessage(f.value as Uint8Array)!
    if (entry.find((x) => x.number === 1 && x.wire === 0)?.value === mapId) {
      return printableWireText(entry.find((x) => x.number === 2 && x.wire === 2)?.value as Uint8Array)
    }
  }
  return undefined
}

function nameOf(gilPath: string): string | undefined {
  const { payload, fields } = readGilPayloadFields(gilPath)
  const name = fields.find((field) => field.p0 === 2 && field.depth === 1)
  return name ? decodeUtf8(payload.subarray(name.dataStart, name.dataEnd)) : undefined
}

// --- createMap：空目录创建骨架 ---
const created = createMap(saveLevelDir, '未分类页签_存档_测试', { warn: () => {} })
assert.ok(existsSync(created.gilPath), 'created file exists')
assert.equal(created.name, '未分类页签_存档_测试')
const bytes = new Uint8Array(readFileSync(created.gilPath))
assert.equal(readUint32BE(bytes, 8), 0x0326, 'headTag')
assert.equal(readUint32BE(bytes, bytes.length - 4), 0x0679, 'tailTag')
const rootFields = parseWireMessage(bytes.slice(20, -4))!
assert.deepEqual(
  rootFields.map((f) => [f.number, f.wire, f.value]),
  [
    [1, 0, created.mapId],
    [2, 2, new TextEncoder().encode('未分类页签_存档_测试')],
    [34, 0, 1],
    [39, 0, playerId],
    [40, 0, Math.floor(Date.now() / 1000)],
    [41, 0, 1]
  ],
  'new-map skeleton fields match editor-observed layout'
)
assert.equal(created.size, bytes.length)
// .gip 注册：条目数 +1，名字正确
assert.equal(gipEntryCount(), 18, 'gip entry appended')
assert.equal(gipNameOf(created.mapId), '未分类页签_存档_测试', 'gip entry name')
// 页签树“未分类页签”容器内地图链接 +1
const gipLinks = () => {
  const root = parseWireMessage(readGilPayloadFields(gipPath).payload)!
  const tabs = root.find((f) => f.number === 1 && f.wire === 2)
  const tabTree = parseWireMessage(tabs!.value as Uint8Array)!
  const folder = tabTree.find((f) => f.number === 3 && f.wire === 2)
  const folderMsg = parseWireMessage(folder!.value as Uint8Array)!
  return folderMsg.filter((f) => f.number === 5 && f.wire === 2).length
}
assert.equal(gipLinks(), 18, 'folder link appended')

// --- createMap：ID 递增（最大 +1） ---
const created2 = createMap(saveLevelDir, '第二张', { warn: () => {} })
assert.equal(created2.mapId, created.mapId + 1)
assert.equal(gipEntryCount(), 19, 'second gip entry appended')

// --- createMap --graphs：名字列表 + ID 自动分配（空地图从 1073741825 起） ---
const created3 = createMap(saveLevelDir, '带占位图', {
  warn: () => {},
  graphs: ['挂载测试', '碰撞模块', '浮空蓄力']
})
const g3 = created3.graphs
assert.deepEqual(
  g3.map((g) => [g.graphId, g.name]),
  [
    [1073741825, '挂载测试'],
    [1073741826, '碰撞模块'],
    [1073741827, '浮空蓄力']
  ],
  'empty map: graph ids start at 1073741825 with given names'
)
// root 10 含 3 个图 wrapper，root 6 的“未分类页签”tab 含 3 条 folder entry
const g3Root = parseWireMessage(new Uint8Array(readFileSync(created3.gilPath)).slice(20, -4))!
const g3Top10 = parseWireMessage(
  (g3Root.find((f) => f.number === 10 && f.wire === 2)!.value as Uint8Array)
)!
assert.equal(g3Top10.filter((f) => f.number === 1 && f.wire === 2).length, 3, 'three graph wrappers')
const g3Top6 = parseWireMessage(
  (g3Root.find((f) => f.number === 6 && f.wire === 2)!.value as Uint8Array)
)!
const g3Folder = g3Top6
  .filter((f) => f.number === 1 && f.wire === 2)
  .map((f) => parseWireMessage(f.value as Uint8Array)!)
  .find((inner) => inner.find((x) => x.number === 1 && x.wire === 0)?.value === 4)!
const g3Tab = parseWireMessage(
  (g3Folder.find((f) => f.number === 3 && f.wire === 2)!.value as Uint8Array)
)!
assert.equal(g3Tab.filter((f) => f.number === 5 && f.wire === 2).length, 3, 'three folder entries')
// listMaps 可见新图
assert.ok(
  listMaps(saveLevelDir, { includeName: true }).maps.some(
    (m) => m.mapId === created3.mapId && m.name === '带占位图'
  )
)

// --- nextGraphId：对已有节点图的地图自动分配 max+1 ---
const { nextGraphId } = await import('../src/cli/assets_node_graphs.js')
assert.equal(nextGraphId(new Uint8Array(readFileSync(created3.gilPath)).slice(20, -4)), 1073741828, 'next after existing graphs')
// 空 payload（无 root 10）→ 固定起始值
assert.equal(nextGraphId(new Uint8Array(0)), 1073741825, 'empty payload uses fixed start')

// --- listMaps includeName：能读出名字 ---
const listed = listMaps(saveLevelDir, { includeName: true }, { now: () => Date.now() })
const listedPairs = listed.maps.map((m) => [m.mapId, m.name] as const)
for (const [mapId, name] of listedPairs) {
  assert.equal(
    listedPairs.filter(([id]) => id === mapId).length,
    1,
    `map ${mapId} listed once`
  )
}
assert.ok(
  listedPairs.some(([id, name]) => id === created.mapId && name === '未分类页签_存档_测试'),
  'listMaps reads root-2 names'
)
assert.ok(listedPairs.some(([id, name]) => id === created2.mapId && name === '第二张'))
// 默认（不 includeName）不读文件内容
let reads = 0
listMaps(saveLevelDir, {}, {
  readFile: ((..._args: unknown[]) => {
    reads++
    throw new Error('must not read')
  }) as never
})
assert.equal(reads, 0, 'no file reads without includeName')

// --- renameMap：改 root 2，其余字段与 header 保留 ---
const renamed = renameMap(saveLevelDir, created.mapId, '改名后A', { warn: () => {} })
assert.equal(renamed.oldName, '未分类页签_存档_测试')
assert.equal(renamed.newName, '改名后A')
assert.equal(nameOf(created.gilPath), '改名后A')
const renamedBytes = new Uint8Array(readFileSync(created.gilPath))
assert.equal(readUint32BE(renamedBytes, 8), 0x0326, 'header preserved')
assert.equal(readUint32BE(renamedBytes, renamedBytes.length - 4), 0x0679, 'trailer preserved')
const renamedRoot = parseWireMessage(renamedBytes.slice(20, -4))!
assert.deepEqual(
  renamedRoot.filter((f) => f.number !== 2).map((f) => [f.number, f.wire, f.value]),
  rootFields.filter((f) => f.number !== 2).map((f) => [f.number, f.wire, f.value]),
  'only root 2 changed'
)
// 备份文件存在且内容 = 改名前的原始文件
const backups = readdirSync(path.join(saveLevelDir, '.gsts', 'backups'))
assert.equal(backups.length, 1, 'one backup created')
assert.equal(nameOf(path.join(saveLevelDir, '.gsts', 'backups', backups[0])), '未分类页签_存档_测试')
// listMaps 反映新名字
assert.equal(listMaps(saveLevelDir, { includeName: true }).maps.find((m) => m.mapId === created.mapId)!.name, '改名后A')
// .gip 同步改名
assert.equal(gipNameOf(created.mapId), '改名后A', 'gip name updated by rename')

// --- renameMap：非法地图（无 root 2）报错 ---
const fakeGil = path.join(saveLevelDir, '999999999.gil')
const fakePayload = emitWireMessage([{ number: 3, wire: 2, value: new TextEncoder().encode('x') }])
const fakeHeader = { schema: 1, headTag: 0x0326, fileType: 2, tailTag: 0x0679 }
writeFileSync(fakeGil, buildFile(fakePayload, fakeHeader))
assert.throws(() => renameMap(saveLevelDir, 999999999, '新名', { warn: () => {} }), /no name field/)

// --- renameMap：目标不存在报错 ---
assert.throws(() => renameMap(saveLevelDir, 123456789, '新名', { warn: () => {} }), /ENOENT|not found/)

console.log('CLI maps create/rename/name tests passed')
