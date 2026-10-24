// @status: 回归（issues/27 客户端 enum_list 参数）
//
// 正例：**没有 tsconfig.json** 的项目里，`f.getRayFilterTypeList([RayFilterType.Scene])` 也必须编过，
//   且 IR 里 get_ray_detection_result 的 args[5]/args[6] 非空。
//   2026-10-24 根因：`ts_to_gs_pipeline.loadTsConfig` 在无 tsconfig 时只用裸 `{target,module}` 兜底，
//   `genshin-ts/*` 导入在类型层退化成 any ⇒ 枚举数组被包成 assemblyList ⇒ 报
//   `Generic parameter not matched`。修复 = 兜底注入指向本 CLI 包的类型别名（genshin_ts_paths.ts）。
// 负例：非法值 `[123]` 必须报「期望枚举列表（enum_list）」，不得是裸泛型不匹配。
//
// 运行：npm run test:client-raycast（内部走 dist CLI，与生产方式一致）
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cliPath = path.join(repoRoot, 'dist', 'src', 'cli', 'gsts.js')
const workRoot = path.join(repoRoot, '.scratch', 'gsts-raycast-regression')

const CONFIG = `export default {
  compileRoot: '.',
  entries: ['./src'],
  outDir: './dist'
}
`

const POSITIVE_SOURCE = `import { g } from 'genshin-ts/runtime/core'

import { RayFilterType } from 'genshin-ts/definitions/client_enums'
import { EntityType, TargetType } from 'genshin-ts/definitions/enum'

g.creationSkill({ id: 1082130499, name: '_GSTS_raycastArgs' }).on('start', (_e: any, f: any) => {
  const hit = f.getRayDetectionResult(
    f.getSelfEntity(),
    f.create3dVector(0, 0, 0),
    f.create3dVector(0, 0, 1),
    12.0,
    TargetType.None,
    f.getEntityTypeList([EntityType.Object]),
    f.getRayFilterTypeList([RayFilterType.Scene, RayFilterType.Hurtbox])
  )
  f.setSkillVariable(1n, f.split3dVector(hit.onHitLocation).xComponent)
})
`

const NEGATIVE_SOURCE = `import { g } from 'genshin-ts/runtime/core'

import { TargetType } from 'genshin-ts/definitions/enum'

g.creationSkill({ id: 1082130500, name: '_GSTS_raycastArgsNeg' }).on('start', (_e: any, f: any) => {
  const hit = f.getRayDetectionResult(
    f.getSelfEntity(),
    f.create3dVector(0, 0, 0),
    f.create3dVector(0, 0, 1),
    12.0,
    TargetType.None,
    f.getEntityTypeList(),
    [123]
  )
  f.setSkillVariable(1n, f.split3dVector(hit.onHitLocation).xComponent)
})
`

function writeProject(name: string, source: string): string {
  const dir = path.join(workRoot, name)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'gsts.config.ts'), CONFIG)
  fs.writeFileSync(path.join(dir, 'src', 'probe.ts'), source)
  return dir
}

function compile(dir: string) {
  const result = spawnSync(process.execPath, [cliPath, '--config', './gsts.config.ts', '--noinject'], {
    cwd: dir,
    encoding: 'utf8'
  })
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`
  }
}

/** 深挖 IR：找到 get_ray_detection_result 节点。 */
function findRayNode(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findRayNode(item)
      if (hit) return hit
    }
    return undefined
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (record.type === 'get_ray_detection_result') return record
    for (const item of Object.values(record)) {
      const hit = findRayNode(item)
      if (hit) return hit
    }
  }
  return undefined
}

function isEmptyArg(arg: unknown): boolean {
  if (arg === null || arg === undefined) return true
  const record = arg as Record<string, unknown>
  if (record.type === 'conn') return false
  if (Array.isArray(record.value)) return record.value.length === 0
  return false
}

try {
  // ---- 正例（无 tsconfig.json）----
  const positiveDir = writeProject('positive', POSITIVE_SOURCE)
  assert.equal(
    fs.existsSync(path.join(positiveDir, 'tsconfig.json')),
    false,
    '正例项目必须没有 tsconfig.json（这是被回归的根因场景）'
  )
  const positive = compile(positiveDir)
  assert.equal(positive.status, 0, `正例编译必须 exit 0，实际 ${positive.status}:\n${positive.output}`)
  assert.equal(
    positive.output.includes('Generic parameter not matched'),
    false,
    `正例不得再出现裸泛型不匹配:\n${positive.output}`
  )

  const irPath = path.join(positiveDir, 'dist', 'src', 'probe.json')
  assert.ok(fs.existsSync(irPath), `IR 未生成: ${irPath}`)
  const ir = JSON.parse(fs.readFileSync(irPath, 'utf8')) as unknown
  const rayNode = findRayNode(ir)
  assert.ok(rayNode, 'IR 里找不到 get_ray_detection_result 节点')
  const args = rayNode.args as unknown[]
  assert.equal(args.length, 7, `get_ray_detection_result 应有 7 个输入，实际 ${args.length}`)
  assert.equal(isEmptyArg(args[5]), false, `args[5]（实体类型筛选）必须非空: ${JSON.stringify(args[5])}`)
  assert.equal(isEmptyArg(args[6]), false, `args[6]（命中层筛选）必须非空: ${JSON.stringify(args[6])}`)

  // GIA 也必须在（说明 enum_list 那条链路真的走通了）
  assert.ok(
    fs.existsSync(path.join(positiveDir, 'dist', 'src', 'probe.gia')),
    'GIA 未生成，enum_list 链路未走通'
  )

  // ---- 负例（[123] 非枚举值）----
  const negativeDir = writeProject('negative', NEGATIVE_SOURCE)
  const negative = compile(negativeDir)
  assert.notEqual(negative.status, 0, `负例必须失败，实际 exit ${negative.status}:\n${negative.output}`)
  assert.equal(
    negative.output.includes('Generic parameter not matched'),
    false,
    `负例不得再报裸泛型不匹配:\n${negative.output}`
  )
  assert.ok(
    negative.output.includes('enum_list') && negative.output.includes('枚举列表'),
    `负例文案必须指出期望类型 enum_list:\n${negative.output}`
  )

  console.log('CLIENT-RAYCAST-ARGS-RESULT pass=2 fail=0 verdict=PASS')
  console.log('  positive: no-tsconfig creation_skill graph compiled, args[5]/args[6] non-empty')
  console.log('  negative: [123] rejected with enum_list expectation message')
} finally {
  fs.rmSync(workRoot, { recursive: true, force: true })
}
