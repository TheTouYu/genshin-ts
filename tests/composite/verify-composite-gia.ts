#!/usr/bin/env npx tsx
/**
 * 复合节点 GIA 文件比对工具
 *
 * 用法:
 *   npx tsx tests/composite/verify-composite-gia.ts <参考.gia> <生成.gia> [--verbose]
 *
 * 功能:
 *   对两个 CompositeDef 类型的 GIA 文件做结构化比对
 *   - 接口比对（inputs/outputs 的名称和类型）
 *   - accessories 数量比对
 *   - 可选：impl 节点比对（--verbose）
 */

import { readFileSync } from 'fs'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const refPath = process.argv[2]
const genPath = process.argv[3]
const verbose = process.argv.includes('--verbose')

if (!refPath || !genPath) {
  console.error('用法: npx tsx tests/composite/verify-composite-gia.ts <参考.gia> <生成.gia> [--verbose]')
  process.exit(1)
}

function load(path: string) {
  try {
    return decode_gia_file(path)
  } catch (e) {
    console.error(`无法解码 ${path}:`, e)
    process.exit(1)
  }
}

const ref = load(refPath)
const gen = load(genPath)

let passed = 0
let failed = 0

function ok(label: string, ...extra: string[]) {
  console.log(`  ✅ ${label}${extra.length ? ' — ' + extra.join(' ') : ''}`)
  passed++
}

function fail(label: string, refVal: unknown, genVal: unknown) {
  console.log(`  ❌ ${label}`)
  console.log(`     参考: ${JSON.stringify(refVal)}`)
  console.log(`     生成: ${JSON.stringify(genVal)}`)
  failed++
}

function check(label: string, refVal: unknown, genVal: unknown) {
  const rf = JSON.stringify(refVal)
  const gf = JSON.stringify(genVal)
  if (rf === gf) {
    ok(label)
  } else {
    fail(label, refVal, genVal)
  }
}

// 提取 CompositeDef
const refG = ref.graph
const genG = gen.graph
const refDef = refG.compositeDef?.inner?.def
const genDef = genG.compositeDef?.inner?.def

console.log('')
console.log(`参考: ${refPath}`)
console.log(`生成: ${genPath}`)
console.log('')

if (!refDef && !genDef) {
  console.log('两个文件都不是 CompositeDef 类型，跳过复合节点比对')
  check('graph.which', refG.which, genG.which)
  check('graph.name', refG.name, genG.name)
  check('accessories count', ref.accessories?.length, gen.accessories?.length)
  console.log(`\n✅ 通过: ${passed}, ❌ 失败: ${failed}`)
  process.exit(failed > 0 ? 1 : 0)
}

if (!refDef) { console.error('参考文件不是 CompositeDef'); process.exit(1) }
if (!genDef) { console.error('生成文件不是 CompositeDef'); process.exit(1) }

console.log('=== 基本信息 ===')
check('name', refDef.name, genDef.name)
check('type.kind', refDef.type?.kind, genDef.type?.kind)
check('description', refDef.description ?? '', genDef.description ?? '')

console.log('\n=== 执行流接口 ===')
check('inflows count', refDef.inflows?.length ?? 0, genDef.inflows?.length ?? 0)
check('outflows count', refDef.outflows?.length ?? 0, genDef.outflows?.length ?? 0)

if (verbose) {
  for (let i = 0; i < Math.max(refDef.inflows?.length ?? 0, genDef.inflows?.length ?? 0); i++) {
    const r = refDef.inflows?.[i]; const g = genDef.inflows?.[i]
    check(`inflow[${i}].pinIndex`, r?.pinIndex, g?.pinIndex)
    check(`inflow[${i}].visible`, r?.visible, g?.visible)
  }
  for (let i = 0; i < Math.max(refDef.outflows?.length ?? 0, genDef.outflows?.length ?? 0); i++) {
    const r = refDef.outflows?.[i]; const g = genDef.outflows?.[i]
    check(`outflow[${i}].pinIndex`, r?.pinIndex, g?.pinIndex)
  }
}

console.log('\n=== 数据接口 — inputs ===')
check('inputs count', refDef.inputs?.length ?? 0, genDef.inputs?.length ?? 0)
const maxIn = Math.max(refDef.inputs?.length ?? 0, genDef.inputs?.length ?? 0)
for (let i = 0; i < maxIn; i++) {
  const r = refDef.inputs?.[i]; const g = genDef.inputs?.[i]
  if (!r && !g) continue
  if (!r) { fail(`input[${i}]`, '存在', '缺失'); continue }
  if (!g) { fail(`input[${i}]`, '缺失', '存在'); continue }
  check(`input[${i}].name`, r.name, g.name)
  check(`input[${i}].type.class`, r.type?.class, g.type?.class)
  check(`input[${i}].type.type1`, r.type?.type1, g.type?.type1)
  check(`input[${i}].type.type2`, r.type?.type2, g.type?.type2)
  check(`input[${i}].pinIndex`, r.pinIndex, g.pinIndex)
  if (verbose) check(`input[${i}].visible`, r.visible, g.visible)
}

console.log('\n=== 数据接口 — outputs ===')
check('outputs count', refDef.outputs?.length ?? 0, genDef.outputs?.length ?? 0)
const maxOut = Math.max(refDef.outputs?.length ?? 0, genDef.outputs?.length ?? 0)
for (let i = 0; i < maxOut; i++) {
  const r = refDef.outputs?.[i]; const g = genDef.outputs?.[i]
  if (!r && !g) continue
  if (!r) { fail(`output[${i}]`, '存在', '缺失'); continue }
  if (!g) { fail(`output[${i}]`, '缺失', '存在'); continue }
  check(`output[${i}].name`, r.name, g.name)
  check(`output[${i}].type.class`, r.type?.class, g.type?.class)
  check(`output[${i}].type.type1`, r.type?.type1, g.type?.type1)
  check(`output[${i}].type.type2`, r.type?.type2, g.type?.type2)
  check(`output[${i}].pinIndex`, r.pinIndex, g.pinIndex)
}

console.log('\n=== 外部引用 (accessories) ===')
check('accessories count', ref.accessories?.length ?? 0, gen.accessories?.length ?? 0)

// 验证 accessories 里的子复合节点
if (verbose) {
  const refAccs = ref.accessories ?? []
  const genAccs = gen.accessories ?? []
  for (let i = 0; i < Math.max(refAccs.length, genAccs.length); i++) {
    const ra = refAccs[i]; const ga = genAccs[i]
    if (!ra || !ga) {
      fail(`accessory[${i}]`, ra ? '存在' : '缺失', ga ? '存在' : '缺失')
      continue
    }
    check(`accessory[${i}].which`, ra.which, ga.which)
    check(`accessory[${i}].name`, ra.name, ga.name)
    const rHasCD = !!ra.compositeDef
    const gHasCD = !!ga.compositeDef
    if (rHasCD || gHasCD) {
      check(`accessory[${i}].compositeDef`, rHasCD, gHasCD)
    }
  }
}

console.log(`\n✅ 通过: ${passed}, ❌ 失败: ${failed}`)
process.exit(failed > 0 ? 1 : 0)
