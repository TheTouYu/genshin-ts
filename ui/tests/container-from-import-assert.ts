/**
 * ui/tests/container-from-import-assert.ts — 「GIA 导入后的容器模板 → 布局实例 → 存为模板」差分验收
 *
 * 运行：npm run build && npx tsx ui/tests/container-from-import-assert.ts
 * 入口：**dist CLI**（`node dist/src/cli/gsts.js`），不是 tsx 直跑源码——避免假绿。
 * 干净副本：全部命令都在 os.tmpdir() 的临时副本上跑；fixture 只读（前后 sha 断言不变）。
 *
 * 三组真实 GIA 导入快照（workspace/flower-tea/device-package/，必须原样使用）：
 *   ① 花间茶会：1073741843.after-import-20261029.gil（空容器）
 *   ② tetris  ：1073741843.after-import2-20261029.gil（16 个客户端文本框）
 *   ③ football：1073741843.after-import3-20261029.gil（7 个 HUD 文本框，另含前两轮的容器）
 * 基线：1073741843.before-import-20261029.gil（地图骨架，无任何容器）
 *
 * 断言分层：
 *   A. 发现：CLI 自动发现模板组（族 4），子树 组→节点→全部子控件 与源记录一致（ID/名字都不写死，
 *      期望值全部由源 .gil 推导）；
 *   B. 布局实例：每组容器都能生成布局实例——f504=布局、族 3 描述符引用原模板组、布局 f503 追加、
 *      模板 f14 实例列表追加、子控件逐条复制（子 f504=新节点）、`assets:ui list` 子树与源同构；
 *   C. 脚本挂载：实例节点继承模板节点的 f74 挂载（`assets:scripts mounts` 读回同 script guid）；
 *   D. 差分黄金样本：把 CLI 结果与**编辑器自己**造的实例（1073741840.after-layout-templates 的
 *      2049/2050/2051..2066）逐字段比对（ID 归一化）→ 必须 0 差异；
 *   E. 存为模板：after-click-template → after-save-template（编辑器产物）同样 0 差异；
 *   F. 写回闸门：`--write` 不带 `--yes` 必须拒绝（退出码非 0）。
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { parseWireMessage, type WireField } from '../../src/cli/static_assembly/wire.js'
import {
  inventoryContainers,
  subtreeSignature,
  type ContainerTreeNode
} from '../src/container-subtree.js'
import { extractMemberIds, parseRoot9 } from '../src/record.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const CLI = path.join(ROOT, 'dist', 'src', 'cli', 'gsts.js')
const FIXTURES = path.join(ROOT, 'workspace', 'flower-tea', 'device-package')
const LAYOUT_ID = 1073741825

if (!fs.existsSync(CLI)) {
  console.error(`FAIL: dist CLI 缺失（${CLI}）；先 npm run build（本测试不走 tsx 直跑源码）`)
  process.exit(1)
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gsts-container-'))
let passed = 0
const fixtureHashes = new Map<string, string>()

function sha(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function fixtureCopy(name: string): string {
  const source = path.join(FIXTURES, name)
  assert.ok(fs.existsSync(source), `fixture missing: ${source}`)
  const bytes = new Uint8Array(fs.readFileSync(source))
  fixtureHashes.set(source, sha(bytes))
  const target = path.join(TMP, name)
  fs.copyFileSync(source, target)
  return target
}

function runCli(args: string[], options: { expectFail?: boolean } = {}): {
  code: number
  stdout: string
  stderr: string
} {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GSTS_LOCALLOW_DIR: process.env.GSTS_LOCALLOW_DIR ?? '' }
    })
    if (options.expectFail) throw new Error(`expected failure but exit=0: ${args.join(' ')}`)
    return { code: 0, stdout, stderr: '' }
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string; message: string }
    if (!options.expectFail) {
      throw new Error(
        `CLI 失败: gsts ${args.join(' ')}\n  status=${failure.status}\n  ${failure.stderr ?? failure.message}`
      )
    }
    return { code: failure.status ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' }
  }
}

function ok(label: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`ok ${passed} - ${label}`)
}

/** 记录字段签名（varint 值按 token 表归一化；packed ID 列表按 token 归一化；其余字节 hex/文本） */
function recordSignature(fields: readonly WireField[], tokens: Map<number, string>, indent = ''): string[] {
  const out: string[] = []
  for (const field of fields) {
    if (field.wire === 0) {
      const value = Number(field.value)
      out.push(`${indent}f${field.number}=${tokens.get(value) ?? value}`)
      continue
    }
    if (field.wire === 5) {
      out.push(`${indent}f${field.number}=f32:${Buffer.from(field.value as Uint8Array).readFloatLE(0)}`)
      continue
    }
    if (field.wire !== 2) {
      out.push(`${indent}f${field.number}:w${field.wire}`)
      continue
    }
    const data = field.value as Uint8Array
    const nested = parseWireMessage(data)
    if (nested) {
      out.push(`${indent}f${field.number}{`)
      out.push(...recordSignature(nested, tokens, `${indent}  `))
      out.push(`${indent}}`)
      continue
    }
    const values = decodePacked(data)
    if (values && values.length > 0 && values.every((value) => value >= 1073741824)) {
      out.push(`${indent}f${field.number} packed=[${values.map((v) => tokens.get(v) ?? v).join(',')}]`)
      continue
    }
    let text = ''
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(data)
    } catch {
      text = ''
    }
    const printable = text.length > 0 && /^[\x20-\x7e\u4e00-\u9fff]+$/.test(text)
    out.push(
      `${indent}f${field.number} len=${data.length} ` +
        (printable ? JSON.stringify(text) : Buffer.from(data).toString('hex'))
    )
  }
  return out
}

function decodePacked(data: Uint8Array): number[] | undefined {
  const out: number[] = []
  let offset = 0
  while (offset < data.length) {
    let shift = 0
    let value = 0
    let byte: number | undefined
    do {
      byte = data[offset]
      if (byte === undefined) return undefined
      offset += 1
      value += (byte & 0x7f) * 2 ** shift
      shift += 7
      if (shift > 35) return undefined
    } while (byte & 0x80)
    out.push(value >>> 0)
  }
  return out
}

function assertRecordsMatch(
  label: string,
  aBytes: Uint8Array,
  aId: number,
  bBytes: Uint8Array,
  bId: number,
  tokensA: Map<number, string>,
  tokensB: Map<number, string>
): void {
  const recordA = parseRoot9(aBytes).recordsById.get(aId)
  const recordB = parseRoot9(bBytes).recordsById.get(bId)
  assert.ok(recordA, `${label}: 记录 ${aId} 不存在`)
  assert.ok(recordB, `${label}: 记录 ${bId} 不存在`)
  const left = recordSignature(recordA.fields, tokensA)
  const right = recordSignature(recordB.fields, tokensB)
  const diffs: string[] = []
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if ((left[i] ?? '<none>') === (right[i] ?? '<none>')) continue
    diffs.push(`  @${i} A=${left[i] ?? '<none>'} B=${right[i] ?? '<none>'}`)
  }
  assert.equal(diffs.length, 0, `${label}: 与参照记录不同构\n${diffs.join('\n')}`)
}

/** 两侧 token 表：三元素 = [A 侧 ID, B 侧 ID, 归一化标签] */
function buildTokens(pairs: Array<[number, number, string]>): {
  tokensA: Map<number, string>
  tokensB: Map<number, string>
} {
  const tokensA = new Map<number, string>()
  const tokensB = new Map<number, string>()
  for (const [left, right, label] of pairs) {
    tokensA.set(left, label)
    tokensB.set(right, label)
  }
  return { tokensA, tokensB }
}

interface FixtureCase {
  name: string
  /** 期望的「子控件数」集合（由真实快照推导后写死在这里当回归护栏；CLI 侧不写死任何值） */
  expectedChildCounts: number[]
}

const CASES: FixtureCase[] = [
  { name: '1073741843.after-import-20261029.gil', expectedChildCounts: [0] },
  { name: '1073741843.after-import2-20261029.gil', expectedChildCounts: [0, 0, 16] },
  { name: '1073741843.after-import3-20261029.gil', expectedChildCounts: [0, 0, 7, 16] }
]
const BASELINE = '1073741843.before-import-20261029.gil'

// ---------------------------------------------------------------- A/B/C：三组 fixture
for (const testCase of CASES) {
  const source = fixtureCopy(testCase.name)
  const baseline = fixtureCopy(BASELINE)
  const sourceBytes = new Uint8Array(fs.readFileSync(source))
  const sourceInventory = inventoryContainers(sourceBytes)

  const discover = runCli([
    'assets:ui',
    'container',
    'discover',
    '--gil',
    source,
    '--baseline',
    baseline,
    '--format',
    'json'
  ])
  const discovered = JSON.parse(discover.stdout) as {
    templateCount: number
    newSinceBaseline: number[]
    templates: Array<{ groupId: number; name: string; childCount: number; nodeIds: number[] }>
    standaloneTemplateNodes: Array<{ id: number; childCount: number }>
  }

  ok(`${testCase.name}: 自动发现容器模板（基线差分）`, () => {
    assert.equal(discovered.templateCount, sourceInventory.templates.length)
    assert.deepEqual(
      discovered.newSinceBaseline.slice().sort((a, b) => a - b),
      sourceInventory.templates.map((template) => template.groupId).sort((a, b) => a - b)
    )
    // 发现结果与源记录推导一致（ID/名字都不是常量）
    const derived = sourceInventory.templates
      .map((template) => template.childCount)
      .sort((a, b) => a - b)
    assert.deepEqual(discovered.templates.map((t) => t.childCount).sort((a, b) => a - b), derived)
    assert.deepEqual(derived, testCase.expectedChildCounts, '子控件数集合与快照事实不符')
    console.log(
      `     discovered templates=[${discovered.templates.map((t) => `${t.groupId}:${t.name}:${t.childCount}`).join(', ')}]`
    )
  })

  // 全体实例化
  const allOut = path.join(TMP, `${testCase.name}.all.gil`)
  const instantiate = runCli([
    'assets:ui',
    'container',
    'instantiate',
    '--gil',
    source,
    '--baseline',
    baseline,
    '--output',
    allOut,
    '--format',
    'json'
  ])
  const instantiated = JSON.parse(instantiate.stdout) as {
    layoutId: number
    created: Array<{
      templateGroupId: number
      instanceGroupId: number
      instanceNodeId: number
      copiedRecords: number
      childCount: number
      transferredMounts: Array<{ hostId: number; scriptGuids: number[] }>
      selfCheck: string
    }>
  }
  const outBytesAll = new Uint8Array(fs.readFileSync(allOut))
  const outInventoryAll = inventoryContainers(outBytesAll)

  ok(`${testCase.name}: 每个容器模板都生成布局实例且子树同构`, () => {
    assert.equal(instantiated.layoutId, LAYOUT_ID)
    assert.equal(instantiated.created.length, sourceInventory.templates.length)
    for (const created of instantiated.created) {
      const template = sourceInventory.templates.find(
        (item) => item.groupId === created.templateGroupId
      )
      assert.ok(template, `实例 ${created.instanceGroupId} 的模板 ${created.templateGroupId} 不在源图里`)
      // 按 CLI 返回的实例组 ID 定位（图里可能本来就有库实例，不能只按模板引用找）
      const instance = outInventoryAll.instances.find((item) => item.groupId === created.instanceGroupId)
      assert.ok(instance, `模板 ${template.groupId} 没有生成实例`)
      assert.equal(instance.parentId, LAYOUT_ID, '实例组 f504 必须是目标布局')
      assert.equal(instance.family, 'instance')
      assert.equal(
        subtreeSignature(instance.tree),
        subtreeSignature(template.tree),
        `实例 ${instance.groupId} 子树与模板 ${template.groupId} 不同构`
      )
      assert.equal(instance.childCount, template.childCount)
      // 布局 f503 尾部追加
      const layout = parseRoot9(outBytesAll).recordsById.get(LAYOUT_ID)
      assert.ok(layout && extractMemberIds(layout.fields).includes(instance.groupId))
      // 模板 f14 实例列表追加
      const templateAfter = outInventoryAll.templates.find((item) => item.groupId === template.groupId)
      assert.ok(templateAfter && templateAfter.instanceIds.includes(instance.groupId))
    }
    // 挂载随记录复制：实例节点 = 模板节点的挂载集合
    for (const created of instantiated.created) {
      const sourceTemplate = sourceInventory.templates.find(
        (template) => template.groupId === created.templateGroupId
      )
      assert.ok(sourceTemplate)
      const sourceMounts = sourceTemplate.mounts
        .filter((mount) => sourceTemplate.nodeIds.includes(mount.hostId))
        .flatMap((mount) => mount.scriptGuids)
        .sort((a, b) => a - b)
      const instanceMounts = created.transferredMounts
        .flatMap((mount) => mount.scriptGuids)
        .sort((a, b) => a - b)
      assert.deepEqual(instanceMounts, sourceMounts, '实例节点未继承模板节点的脚本挂载')
    }
  })

  ok(`${testCase.name}: assets:ui list 读回子树与源容器同构`, () => {
    const listed = runCli(['assets:ui', 'list', '--gil', allOut, '--format', 'json'])
    const view = JSON.parse(listed.stdout) as { tree: ViewNode[] }
    const layoutNode = view.tree.find((node) => node.id === LAYOUT_ID)
    assert.ok(layoutNode, 'list 树里没有默认布局根')
    const containerNodes = collectContainers(layoutNode)
    assert.equal(containerNodes.length, sourceInventory.templates.length)
    for (const template of sourceInventory.templates) {
      const names = subControlNamesFromTree(template.tree)
      const match = containerNodes.find((node) => subControlNamesFromView(node).join('|') === names.join('|'))
      assert.ok(match, `list 树里找不到与模板 ${template.groupId} 同构的实例（${names.join('|')}）`)
    }
  })

  ok(`${testCase.name}: scripts mounts 读回实例节点挂载`, () => {
    const mounts = JSON.parse(
      runCli(['assets:scripts', 'mounts', '--gil', allOut, '--format', 'json']).stdout
    ) as { mounts: Array<{ hostGuid: number; scriptGuid: number }> }
    for (const created of instantiated.created) {
      const sourceTemplate = sourceInventory.templates.find(
        (template) => template.groupId === created.templateGroupId
      )
      assert.ok(sourceTemplate)
      const expected = sourceTemplate.mounts
        .filter((mount) => sourceTemplate.nodeIds.includes(mount.hostId))
        .flatMap((mount) => mount.scriptGuids)
        .sort((a, b) => a - b)
      const actual = mounts.mounts
        .filter((mount) => mount.hostGuid === created.instanceNodeId)
        .map((mount) => mount.scriptGuid)
        .sort((a, b) => a - b)
      assert.deepEqual(actual, expected, `实例节点 ${created.instanceNodeId} 的挂载读数不符`)
    }
  })

  // 单模板选择（按「子控件数最大」这一派生条件选，不写死 ID/名字）
  const biggest = sourceInventory.templates.reduce((best, item) =>
    item.childCount > best.childCount ? item : best
  )
  const oneOut = path.join(TMP, `${testCase.name}.one.gil`)
  const single = runCli([
    'assets:ui',
    'container',
    'instantiate',
    '--gil',
    source,
    '--container',
    String(biggest.groupId),
    '--output',
    oneOut,
    '--format',
    'json'
  ])
  ok(`${testCase.name}: --container <派生ID> 只实例化选中模板`, () => {
    const payload = JSON.parse(single.stdout) as { created: Array<{ instanceGroupId: number }> }
    assert.equal(payload.created.length, 1)
    const oneOutBytes = new Uint8Array(fs.readFileSync(oneOut))
    const inventory = inventoryContainers(oneOutBytes)
    const sourceTemplates = inventory.templates.length
    const layoutInstances = inventory.instances.filter((item) => item.parentId === LAYOUT_ID)
    assert.equal(layoutInstances.length, 1)
    assert.equal(sourceTemplates, sourceInventory.templates.length, '模板侧不应被改动')
    const instance = layoutInstances[0]
    assert.equal(instance.templateGroupId, biggest.groupId)
    const expectedNames = biggest.tree.children
      .flatMap((node) => node.children.map((child) => `${child.kind}:${child.name}`))
      .join('|')
    const actualNames = instance.tree.children
      .flatMap((node) => node.children.map((child) => `${child.kind}:${child.name}`))
      .join('|')
    assert.equal(actualNames, expectedNames, '实例子控件名字/类型序列与源容器不同')
    assert.equal(instance.childCount, biggest.childCount)
  })
}

// ---------------------------------------------------------------- D：编辑器黄金差分（实例）
// 补充对照（真机导入 + 编辑器拖入布局后保存的快照）；缺失则 SKIP，不影响 A/B/C 主验收。
const EDITOR_INSTANCE_FIXTURE = path.join(FIXTURES, '1073741840.after-layout-templates-20261028-1131.gil')
const EDITOR_SOURCE_FIXTURE = path.join(FIXTURES, '1073741840.after-import3-20261028-1126.gil')
if (!fs.existsSync(EDITOR_SOURCE_FIXTURE) || !fs.existsSync(EDITOR_INSTANCE_FIXTURE)) {
  console.log('SKIP - 编辑器黄金差分（实例）：缺 1073741840.* 快照')
} else {
  const source = fixtureCopy('1073741840.after-import3-20261028-1126.gil')
  const editor = EDITOR_INSTANCE_FIXTURE
  const sourceBytes = new Uint8Array(fs.readFileSync(source))
  const sourceInventory = inventoryContainers(sourceBytes)
  // 派生选择：子控件最多的模板（=16 文本框那棵，不写死 ID）
  const target = sourceInventory.templates.reduce((best, item) =>
    item.childCount > best.childCount ? item : best
  )
  const out = path.join(TMP, 'editor-golden.gil')
  const result = runCli([
    'assets:ui',
    'container',
    'instantiate',
    '--gil',
    source,
    '--container',
    String(target.groupId),
    '--output',
    out,
    '--format',
    'json'
  ])
  const payload = JSON.parse(result.stdout) as {
    created: Array<{ instanceGroupId: number; instanceNodeId: number; recordIds: number[] }>
  }
  const created = payload.created[0]
  const outBytes = new Uint8Array(fs.readFileSync(out))
  const editorBytes = new Uint8Array(fs.readFileSync(editor))
  const editorInventory = inventoryContainers(editorBytes)
  // 编辑器快照里的同模板实例（按模板引用派生，不写死 2049）
  const editorInstance = editorInventory.instances.find(
    (instance) => instance.templateGroupId === target.groupId && instance.parentId === LAYOUT_ID
  )

  ok('黄金样本：与编辑器自己造的布局实例逐字段一致（ID 归一化）', () => {
    assert.ok(editorInstance, '编辑器快照里没有同模板实例')
    const templateNode = target.tree.children[0]
    const instanceNode = editorInstance.tree.children[0]
    assert.ok(templateNode && instanceNode)
    const pairs: Array<[number, number, string]> = [
      [created.instanceGroupId, editorInstance.groupId, '<group>'],
      [created.instanceNodeId, editorInstance.nodeIds[0], '<node>'],
      [templateNode.id, templateNode.id, '<tplnode>']
    ]
    // 子控件：源模板子控件 / 我方实例子控件 / 编辑器实例子控件 三方各自一组标签
    const sourceChildren = target.tree.children.flatMap((node) => node.children.map((c) => c.id))
    const editorChildren = editorInstance.tree.children.flatMap((node) => node.children.map((c) => c.id))
    assert.equal(editorChildren.length, sourceChildren.length)
    const myChildren = created.recordIds.slice(2)
    assert.equal(myChildren.length, editorChildren.length)
    sourceChildren.forEach((id, index) => pairs.push([id, id, `<tplChild${index}>`]))
    myChildren.forEach((id, index) => pairs.push([id, editorChildren[index], `<child${index}>`]))
    const { tokensA, tokensB } = buildTokens(pairs)
    assertRecordsMatch(
      '实例组',
      outBytes,
      created.instanceGroupId,
      editorBytes,
      editorInstance.groupId,
      tokensA,
      tokensB
    )
    assertRecordsMatch(
      '实例节点',
      outBytes,
      created.instanceNodeId,
      editorBytes,
      editorInstance.nodeIds[0],
      tokensA,
      tokensB
    )
    myChildren.forEach((id, index) => {
      assertRecordsMatch(`子控件#${index}`, outBytes, id, editorBytes, editorChildren[index], tokensA, tokensB)
    })
    console.log(
      `     golden: template=${target.groupId} myInstance=${created.instanceGroupId} ` +
        `editorInstance=${editorInstance.groupId} records=${created.recordIds.length}`
    )
  })
}

// ---------------------------------------------------------------- E：存为模板（编辑器黄金差分）
const SAVE_TEMPLATE_SOURCE = path.join(FIXTURES, '1073741843.after-click-template-20261029.gil')
const SAVE_TEMPLATE_EDITOR = path.join(FIXTURES, '1073741843.after-save-template-20261029.gil')
if (!fs.existsSync(SAVE_TEMPLATE_SOURCE) || !fs.existsSync(SAVE_TEMPLATE_EDITOR)) {
  console.log('SKIP - 存为模板黄金差分：缺 after-click/after-save-template 快照')
} else {
  const source = fixtureCopy('1073741843.after-click-template-20261029.gil')
  const editor = SAVE_TEMPLATE_EDITOR
  const sourceBytes = new Uint8Array(fs.readFileSync(source))
  const inventory = inventoryContainers(sourceBytes)
  const instance = inventory.instances[0]
  assert.ok(instance, 'after-click-template 没有库实例')
  const out = path.join(TMP, 'save-template.gil')
  const result = runCli([
    'assets:ui',
    'container',
    'save-template',
    '--gil',
    source,
    '--instance',
    String(instance.groupId),
    '--output',
    out,
    '--format',
    'json'
  ])
  const payload = JSON.parse(result.stdout) as {
    newTemplateGroupId: number
    newTemplateNodeId: number
    newName: string
    previousTemplateGroupId: number | null
  }
  const outBytes = new Uint8Array(fs.readFileSync(out))
  const editorBytes = new Uint8Array(fs.readFileSync(editor))
  const editorInventory = inventoryContainers(editorBytes)
  // 编辑器产物里的新模板 = 引用该实例的模板（派生，不写死 1852）
  const editorTemplate = editorInventory.templates.find((template) =>
    template.instanceIds.includes(instance.groupId)
  )

  ok('存为模板：与编辑器 after-save-template 逐字段一致（ID 归一化）', () => {
    assert.ok(editorTemplate, '编辑器快照里没有引用该实例的模板')
    const myChildren = inventoryContainers(outBytes).templates.find(
      (template) => template.groupId === payload.newTemplateGroupId
    )
    assert.ok(myChildren)
    const editorChildren = editorTemplate.tree.children.flatMap((node) =>
      node.children.map((child) => child.id)
    )
    const myChildIds = myChildren.tree.children.flatMap((node) => node.children.map((child) => child.id))
    assert.equal(myChildIds.length, editorChildren.length)
    const pairs: Array<[number, number, string]> = [
      [payload.newTemplateGroupId, editorTemplate.groupId, '<tpl>'],
      [payload.newTemplateNodeId, editorTemplate.nodeIds[0], '<tplnode>'],
      [instance.groupId, instance.groupId, '<instance>'],
      ...(payload.previousTemplateGroupId !== null
        ? ([[payload.previousTemplateGroupId, payload.previousTemplateGroupId, '<oldTpl>']] as Array<
            [number, number, string]
          >)
        : [])
    ]
    myChildIds.forEach((id, index) => pairs.push([id, editorChildren[index], `<child${index}>`]))
    const { tokensA, tokensB } = buildTokens(pairs)
    assertRecordsMatch(
      '新模板组',
      outBytes,
      payload.newTemplateGroupId,
      editorBytes,
      editorTemplate.groupId,
      tokensA,
      tokensB
    )
    assertRecordsMatch(
      '新模板节点',
      outBytes,
      payload.newTemplateNodeId,
      editorBytes,
      editorTemplate.nodeIds[0],
      tokensA,
      tokensB
    )
    assertRecordsMatch('源实例', outBytes, instance.groupId, editorBytes, instance.groupId, tokensA, tokensB)
    if (payload.previousTemplateGroupId !== null) {
      assertRecordsMatch(
        '旧模板组',
        outBytes,
        payload.previousTemplateGroupId,
        editorBytes,
        payload.previousTemplateGroupId,
        tokensA,
        tokensB
      )
    }
    console.log(
      `     save-template: newTemplate=${payload.newTemplateGroupId} name=${payload.newName} ` +
        `editorTemplate=${editorTemplate.groupId} instance=${instance.groupId}`
    )
  })
}

// ---------------------------------------------------------------- F：写回闸门
ok('写回闸门：--write 不带 --yes 必须拒绝', () => {
  const source = fixtureCopy('1073741843.after-import-20261029.gil')
  const before = sha(new Uint8Array(fs.readFileSync(source)))
  const result = runCli(
    ['assets:ui', 'container', 'instantiate', '--gil', source, '--write'],
    { expectFail: true }
  )
  assert.notEqual(result.code, 0)
  assert.match(result.stderr, /--yes/)
  assert.equal(sha(new Uint8Array(fs.readFileSync(source))), before, '拒绝时不得改源文件')
})

// ---------------------------------------------------------------- fixture 未被修改
ok('fixture 只读：全部源快照 sha 未变', () => {
  for (const [file, expected] of fixtureHashes) {
    assert.equal(sha(new Uint8Array(fs.readFileSync(file))), expected, `fixture 被改动: ${file}`)
  }
})

fs.rmSync(TMP, { recursive: true, force: true })
console.log(`\nCONTAINER-FLOW-RESULT fixtures=${CASES.length} assertions=${passed} verdict=PASS`)

interface ViewNode {
  id: number
  kind: string
  name: string
  children: ViewNode[]
}

/** 语义 list 树里收集容器节点（kind=client-container；递归） */
function collectContainers(node: ViewNode): ViewNode[] {
  const found: ViewNode[] = []
  const visit = (current: ViewNode): void => {
    for (const child of current.children ?? []) {
      if (child.kind === 'client-container') found.push(child)
      visit(child)
    }
  }
  visit(node)
  return found
}

/** 语义 list 视图：容器节点之下的子控件名序列（跳过容器节点本身） */
function subControlNamesFromView(container: ViewNode): string[] {
  const out: string[] = []
  const visit = (current: ViewNode): void => {
    for (const child of current.children ?? []) {
      if (child.kind !== 'client-container-node') out.push(`${child.kind}:${child.name}`)
      visit(child)
    }
  }
  for (const node of container.children ?? []) visit(node)
  return out
}

/** 源记录推导的树：容器节点之下的子控件名序列 */
function subControlNamesFromTree(tree: ContainerTreeNode): string[] {
  const out: string[] = []
  const visit = (current: ContainerTreeNode): void => {
    for (const child of current.children) {
      if (child.kind !== 'client-container-node') out.push(`${child.kind}:${child.name}`)
      visit(child)
    }
  }
  for (const node of tree.children) visit(node)
  return out
}
