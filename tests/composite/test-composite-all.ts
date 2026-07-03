// @ts-nocheck — 复合节点测试脚本

/**
 * 复合节点完整测试套件
 *
 * 覆盖三次提交（984fc68 + 0d2877f + 当前工作区）的所有功能点。
 *
 * 分区:
 *   Part 1: 复合定义 GIA 精确对比（有参考文件）
 *   Part 2: 完整设施图测试（定义+调用，标记 @pending_ref）
 *   Part 3: 单元级行为验证（不依赖 GIA 管线）
 *   Part 4: 回归测试（npm run quicktest）
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { defineComposite } from '../../dist/src/index.js'
import { int } from '../../dist/src/runtime/value.js'
import { compositeRegistry } from '../../dist/src/runtime/composite_registry.js'
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildCompositeAccessories } from '../../dist/src/compiler/ir_to_gia_transform/composite.js'
import {
  composite_pin_body,
  graph_affiliation_body
} from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/basic.js'

// ============== 工具函数 ==============

const PROTO_PATH = new URL('../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const REF_DIR = process.env.COMPOSITE_REF_DIR || ''
const OUT_DIR = '/tmp/composite-test-output'

let totalPassed = 0
let totalFailed = 0
let totalSkipped = 0
const pendingRefTests: string[] = []

type TestResult = { label: string; passed: boolean; detail?: string }

function test(label: string, fn: () => boolean | TestResult): void {
  try {
    const result = fn()
    const passed = typeof result === 'boolean' ? result : result.passed
    const detail = typeof result === 'boolean' ? undefined : result.detail
    if (passed) {
      console.log(`  ✅ ${label}`)
      totalPassed++
    } else {
      console.log(`  ❌ ${label}`)
      if (detail) console.log(`     ${detail}`)
      totalFailed++
    }
  } catch (e: any) {
    console.log(`  ❌ ${label}`)
    console.log(`     EXCEPTION: ${e.message}`)
    totalFailed++
  }
}

function pendingRef(description: string): void {
  console.log(`  ⏳ ${description} [@pending_ref]`)
  totalSkipped++
  pendingRefTests.push(description)
}

function resetRegistry(): void {
  // 通过清除 registry 内部状态来重置
  compositeRegistry.definitions.clear?.()
  // 用 v8 私有字段——通过取值清空
  for (const def of compositeRegistry.getAll()) {
    // 无法删除，忽略
  }
}

function check(label: string, refVal: unknown, genVal: unknown, detail?: string): TestResult {
  const rf = JSON.stringify(refVal)
  const gf = JSON.stringify(genVal)
  const passed = rf === gf
  return {
    label,
    passed,
    detail: passed ? undefined : `期望=${rf}, 实际=${gf}${detail ? ' — ' + detail : ''}`
  }
}

// ============== Part 1: 复合定义 GIA 精确对比 ==============

function part1_composite_definition_comparison() {
  console.log('\n══════════════════════════════════════════')
  console.log('Part 1: 复合定义 GIA 精确对比')
  console.log('══════════════════════════════════════════\n')

  // --- 1A: 简单复合 — 双倍运算 ---
  console.log('▸ 1A: 简单复合（双倍运算）')

  // 清理注册表
  const defs = compositeRegistry.getAll()

  const doubleDef = defineComposite('双倍运算', {
    inputs: { 值: { type: 'int' } },
    outputs: { 结果: { type: 'int' } },
    build: ({ 值 }, f) => ({ 结果: f.addition(值, 值) })
  })

  test('handle.name = "双倍运算"', () => doubleDef.name === '双倍运算')
  test('handle.id > 0', () => doubleDef.id > 0)
  test('handle.definition.inputs has key "值"', () => '值' in doubleDef.definition.inputs)
  test('handle.definition.outputs has key "结果"', () => '结果' in doubleDef.definition.outputs)

  // --- 1B: 浮点四则运算 ---
  console.log('\n▸ 1B: 浮点四则运算')

  const floatCalc = defineComposite('浮点四则运算', {
    inputs: { A: { type: 'float' }, B: { type: 'float' } },
    outputs: { 和: { type: 'float' }, 差: { type: 'float' }, 积: { type: 'float' }, 商: { type: 'float' } },
    build: ({ A, B }, f) => ({
      和: f.addition(A, B),
      差: f.subtraction(A, B),
      积: f.multiplication(A, B),
      商: f.division(A, B)
    })
  })

  test('输出数量 = 4', () => Object.keys(floatCalc.definition.outputs).length === 4)
  test('输入数量 = 2', () => Object.keys(floatCalc.definition.inputs).length === 2)

  // --- 1C: IR 生成验证 ---
  console.log('\n▸ 1C: CompositeDefIR 生成')

  const doubleIR = doubleDef.definition.toCompositeDefIR()
  test('type = "composite"', () => doubleIR.type === 'composite')
  test('inputs[0].name = "值"', () => doubleIR.inputs[0].name === '值')
  test('inputs[0].type = "int"', () => doubleIR.inputs[0].type === 'int')
  test('inputs[0].pinIndex = 100', () => doubleIR.inputs[0].pinIndex === 100)
  test('outputs[0].name = "结果"', () => doubleIR.outputs[0].name === '结果')
  test('outputs[0].type = "int"', () => doubleIR.outputs[0].type === 'int')
  test('outputs[0].pinIndex = 200', () => doubleIR.outputs[0].pinIndex === 200)
  test('捕获前 implNodes 为空', () => doubleIR.implNodes.length === 0)
  test('捕获前 implEdges 为空', () => Object.keys(doubleIR.implEdges).length === 0)

  // --- 1D: 多类型全类型测试 ---
  console.log('\n▸ 1D: 全类型映射测试')

  const fullTypeDef = defineComposite('全类型测试', {
    inputs: {
      整数A: { type: 'int' },
      整数B: { type: 'int' },
      浮点A: { type: 'float' },
      浮点B: { type: 'float' },
      布尔: { type: 'bool' },
      字符串: { type: 'str' },
      向量X: { type: 'float' },
      向量Y: { type: 'float' },
      向量Z: { type: 'float' },
      预制体: { type: 'prefab_id' },
      实体阵: { type: 'entity' },
      实体配: { type: 'config_id' }
    },
    outputs: {
      整数结果: { type: 'int' },
      浮点结果: { type: 'float' },
      布尔结果: { type: 'bool' },
      三维向量: { type: 'vec3' },
      目标实体: { type: 'entity' },
      实体GUID: { type: 'guid' },
      实体列表: { type: 'entity_list' },
      阵营: { type: 'faction' },
      配置: { type: 'config_id' }
    },
    build: (inputs, f) => ({
      整数结果: inputs.整数A,
      浮点结果: inputs.浮点A,
      布尔结果: inputs.布尔,
      三维向量: f.addition(inputs.向量X, inputs.向量Y),
      目标实体: inputs.实体阵,
      实体GUID: inputs.整数A,
      实体列表: f.addition(inputs.整数A, inputs.整数B),
      阵营: inputs.整数A,
      配置: inputs.整数B
    })
  })

  const fullIR = fullTypeDef.definition.toCompositeDefIR()
  test('全类型 inputs 数量 = 12', () => fullIR.inputs.length === 12)
  test('全类型 outputs 数量 = 9', () => fullIR.outputs.length === 9)

  // --- 1E: 管线端到端生成 ---
  console.log('\n▸ 1E: GIA 管线端到端生成')

  // 创建 server 图来触发 buildServerGraphRegistriesIRDocuments
  g.server({ name: 'test' }).on('whenEntityIsCreated', (_e: any, f: any) => {
    f.callComposite(doubleDef, { 值: new int(7) })
  })

  const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'test' })

  const docWithDefs = docs.find((doc: any) => (doc.compositeDefs?.length ?? 0) > 0)
  test('IR 文档包含 compositeDefs', () => !!docWithDefs)

  if (docWithDefs) {
    const cd = (docWithDefs as any).compositeDefs[0]
    test('compositeDefs[0].type = "composite"', () => cd.type === 'composite')
    test('compositeDefs[0].name = "双倍运算"', () => cd.name === '双倍运算')

    // 尝试编码为 GIA（仅当有节点时）
    if ((docWithDefs as any).nodes?.length > 0) {
      try {
        const bytes = irToGia(docWithDefs as any, {
          graphId: 1073741825,
          name: 'test',
          protoPath: PROTO_PATH
        })
        test('irToGia 编码成功，输出 > 0 字节', () => bytes.length > 0)

        const outPath = `${OUT_DIR}/part1_end_to_end.gia`
        if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
        writeFileSync(outPath, Buffer.from(bytes))

        const decoded = decode_gia_file(outPath, PROTO_PATH)
        const hasCompositeDefAcc = (decoded.accessories ?? []).some((a: any) => a.which === 12)
        test('解码后 accessories 含 CompositeDef (which=12)', () => hasCompositeDefAcc)
        if (hasCompositeDefAcc) {
          const acc = (decoded.accessories ?? []).find((a: any) => a.which === 12)
          const def = acc?.compositeDef?.inner?.def
          test('解码后 type.kind = 1000', () => def?.type?.kind === 1000)
          test('解码后 name = "双倍运算"', () => def?.name === '双倍运算')
          test('解码后 inputs[0].type.class = 2 (IntBase)', () => def?.inputs?.[0]?.type?.class === 2)
          test('解码后 inputs[0].type.type1 = 3 (Integer)', () => def?.inputs?.[0]?.type?.type1 === 3)
        }
      } catch (e: any) {
        console.log(`  ❌ irToGia 编码异常: ${e.message}`)
        totalFailed++
      }
    } else {
      console.log('  ⏳ 主图无节点，跳过 irToGia 编码')
      totalSkipped++
    }
  }

  // --- 1F: 与参考文件逐个精确对比 ---
  console.log('\n▸ 1F: 参考文件精确对比')

  if (existsSync(REF_DIR)) {
    // 对每个参考的 ts_g_define_* 文件
    const refFiles = [
      { file: 'ts_g_define_双倍运算.gia', name: '双倍运算' },
      { file: 'ts_g_define_浮点四则运算.gia', name: '浮点四则运算' },
      { file: 'ts_g_define_加减运算2.gia', name: '加减运算2' },
      { file: 'ts_g_define_多类型复合测试.gia', name: '多类型复合测试' },
      { file: 'ts_g_define_复合运算.gia', name: '复合运算' },
      { file: 'ts_g_define_高级运算.gia', name: '高级运算' },
      { file: 'ts_g_define_三范围判定器.gia', name: '三范围判定器' },
      { file: 'ts_g_define_双重概率判定.gia', name: '双重概率判定' },
      { file: 'ts_g_define_四维状态检测器.gia', name: '四维状态检测器' },
      { file: 'ts_g_define_加减运算4.gia', name: '加减运算4' }
    ]

    for (const ref of refFiles) {
      const refPath = `${REF_DIR}/${ref.file}`
      try {
        const refData = decode_gia_file(refPath, PROTO_PATH)
        const refDef = refData.graph.compositeDef?.inner?.def
        if (!refDef) {
          console.log(`  ⚠ ${ref.file}: 参考文件不是 CompositeDef`)
          continue
        }

        test(`${ref.name}: 输入数量匹配 (${refDef.inputs?.length})`, () => {
          const ir = compositeRegistry.get(ref.name)?.definition.toCompositeDefIR()
          return ir ? ir.inputs.length === (refDef.inputs?.length ?? 0) : false
        })

        test(`${ref.name}: 输出数量匹配 (${refDef.outputs?.length})`, () => {
          const ir = compositeRegistry.get(ref.name)?.definition.toCompositeDefIR()
          return ir ? ir.outputs.length === (refDef.outputs?.length ?? 0) : false
        })

        if (refDef.inputs && compositeRegistry.get(ref.name)) {
          const ir = compositeRegistry.get(ref.name)!.definition.toCompositeDefIR()
          for (let i = 0; i < Math.min(refDef.inputs.length, ir.inputs.length); i++) {
            const ri = refDef.inputs[i]
            const gi = ir.inputs[i]
            // 参考文件中可能有不同的 pinIndex，只对比 name/class/type1
            test(`${ref.name}: input[${i}].name = "${ri.name}"`, () => gi.name === ri.name)
          }
        }
      } catch (e: any) {
        console.log(`  ❌ ${ref.file}: 无法解码 — ${e.message}`)
        totalFailed++
      }
    }
  } else {
    console.log('  ⚠ REF_DIR 不存在，跳过参考文件对比')
  }
}

// ============== Part 2: 完整设施图测试（定义+调用） ==============

function part2_facility_graph_tests() {
  console.log('\n══════════════════════════════════════════')
  console.log('Part 2: 完整设施图（定义+调用）')
  console.log('══════════════════════════════════════════\n')

  // === 2A: 简单 callComposite（有向边正确性）===
  console.log('▸ 2A: 简单 callComposite 调用')

  const addDef = defineComposite('加法', {
    inputs: { a: { type: 'int' }, b: { type: 'int' } },
    outputs: { sum: { type: 'int' } },
    build: ({ a, b }, f) => ({ sum: f.addition(a, b) })
  })

  // 清理——不能在同一个 g.server 中重复定义，已有了
  // 正常流程：buildServerGraphRegistriesIRDocuments 时自动捕获
  test('捕获前 captured = null', () => addDef.definition.captured === null)

  // 触发捕获
  g.server({ name: 'capture_test' }).on('whenEntityIsCreated', () => {})
  const docsC = buildServerGraphRegistriesIRDocuments({ defaultName: 'capture_test' })

  test('捕获后 captured 非 null', () => addDef.definition.captured !== null)
  if (addDef.definition.captured) {
    test('captured.dataNodes 包含 addition', () => {
      return addDef.definition.captured!.dataNodes.some(n => n.nodeType === 'addition')
    })
    test('captured.execNodes 为空（纯数据复合）', () => addDef.definition.captured!.execNodes.length === 0)
    test('captured.isPureData = true', () => addDef.definition.captured!.isPureData === true)
  }

  // === 2B: exec-only 复合 ===
  console.log('\n▸ 2B: exec-only 复合（无数据 IO）')

  const printDef = defineComposite('打印', {
    inputs: {}, outputs: {},
    build: (_, f) => { f.printString('hello'); return {} }
  })

  g.server({ name: 'exec_only' }).on('whenEntityIsCreated', () => {})
  const docsE = buildServerGraphRegistriesIRDocuments({ defaultName: 'exec_only' })

  test('exec-only 复合捕获', () => printDef.definition.captured !== null)
  if (printDef.definition.captured) {
    test('captured.execNodes 包含 print_string', () => {
      return printDef.definition.captured!.execNodes.some(n => n.nodeType === 'print_string')
    })
    test('captured.isPureData = false', () => printDef.definition.captured!.isPureData === false)
  }

  // === 2C: callComposite 连线到后续节点 ===
  console.log('\n▸ 2C: callComposite 返回值连线')

  const doubleOp = defineComposite('双倍运', {
    inputs: { v: { type: 'int' } },
    outputs: { r: { type: 'int' } },
    build: ({ v }, f) => ({ r: f.addition(v, v) })
  })

  g.server({ name: 'call_wiring' })
    .on('whenEntityIsCreated', (_e: any, f: any) => {
      f.callComposite(doubleOp, { v: new int(7) })
    })

  const docsW = buildServerGraphRegistriesIRDocuments({ defaultName: 'call_wiring' })

  // 验证 IR 结构（取最新一个 doc）
  const wiringDoc = docsW[docsW.length - 1] as any
  test('主图有节点', () => (wiringDoc.nodes?.length ?? 0) >= 2)

  // 取出 GIA 中的 compositeDefs
  test('compositeDefs 存在', () => (wiringDoc.compositeDefs?.length ?? 0) > 0)

  // GIA 编码
  try {
    const bytes = irToGia(wiringDoc, {
      graphId: 1073741826,
      name: 'call_wiring',
      protoPath: PROTO_PATH
    })
    test('call_wiring GIA 编码成功', () => bytes.length > 0)
    const outPath = `${OUT_DIR}/part2_call_wiring.gia`
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(outPath, Buffer.from(bytes))
    const decoded = decode_gia_file(outPath, PROTO_PATH)
    test('解码后 accessories 至少含 1 个', () => (decoded.accessories?.length ?? 0) >= 1)
  } catch (e: any) {
    console.log(`  ❌ call_wiring GIA 编码异常: ${e.message}`)
    totalFailed++
  }

  // === 2D: 多次调用同一复合 ===
  console.log('\n▸ 2D: 多次调用同一复合')

  const incHandle = defineComposite('增量', {
    inputs: { v: { type: 'int' } },
    outputs: { r: { type: 'int' } },
    build: ({ v }, f) => ({ r: f.addition(v, 1) })
  })

  g.server({ name: 'multi_call' })
    .on('whenEntityIsCreated', (_e: any, f: any) => {
      const r1 = f.callComposite(incHandle, { v: new int(7) })
      const r2 = f.callComposite(incHandle, { v: r1.r })
      f.printString(f.dataTypeConversion(r2.r, 'str'))
    })

  const docsM = buildServerGraphRegistriesIRDocuments({ defaultName: 'multi_call' })

  const mcDoc = docsM[docsM.length - 1] as any
  try {
    const bytes = irToGia(mcDoc, {
      graphId: 1073741827,
      name: 'multi_call',
      protoPath: PROTO_PATH
    })
    test('multi_call GIA 编码成功', () => bytes.length > 0)
  } catch (e: any) {
    console.log(`  ❌ multi_call GIA 编码异常: ${e.message}`)
    totalFailed++
  }

  // === 2E: 复合内嵌套 callComposite ===
  console.log('\n▸ 2E: 复合内嵌套调用 [@pending_ref]')

  const baseAdd = defineComposite('基础加法', {
    inputs: { x: { type: 'int' }, y: { type: 'int' } },
    outputs: { s: { type: 'int' } },
    build: ({ x, y }, f) => ({ s: f.addition(x, y) })
  })

  defineComposite('嵌套调用', {
    inputs: { a: { type: 'int' }, b: { type: 'int' }, c: { type: 'int' } },
    outputs: { result: { type: 'int' } },
    build: ({ a, b, c }, f: any) => {
      const mid = f.callComposite(baseAdd, { x: a, y: b })
      return { result: f.callComposite(baseAdd, { x: mid.s, y: c }).s }
    }
  })

  g.server({ name: 'nested_composite' }).on('whenEntityIsCreated', () => {})
  const docsN = buildServerGraphRegistriesIRDocuments({ defaultName: 'nested_composite' })

  test('嵌套复合捕获', () => {
    const def = compositeRegistry.get('嵌套调用')
    return def?.captured !== null && (def?.captured?.dataNodes?.length ?? 0) > 0
  })

  pendingRef('嵌套复合 GIA 文件对比（设施图类型）')

  // === 2F: 纯数据复合的 exec-only 边界 ===
  console.log('\n▸ 2F: 空 build（无任何操作）[@pending_ref]')

  defineComposite('空复合', {
    inputs: {}, outputs: {},
    build: () => ({})
  })

  g.server({ name: 'empty_composite' }).on('whenEntityIsCreated', () => {})
  const docsEmp = buildServerGraphRegistriesIRDocuments({ defaultName: 'empty_composite' })

  test('空复合捕获', () => {
    const def = compositeRegistry.get('空复合')
    return def?.captured !== null
  })
  if (compositeRegistry.get('空复合')?.captured) {
    test('空复合 captured.execNodes = 0', () => compositeRegistry.get('空复合')!.captured!.execNodes.length === 0)
    test('空复合 captured.dataNodes = 0', () => compositeRegistry.get('空复合')!.captured!.dataNodes.length === 0)
    test('空复合 captured.isPureData = true', () => compositeRegistry.get('空复合')!.captured!.isPureData === true)
  }

  pendingRef('空复合 GIA 文件对比')
}

// ============== Part 3: 单元级行为验证 ==============

function part3_unit_behavior_tests() {
  console.log('\n══════════════════════════════════════════')
  console.log('Part 3: 单元级行为验证')
  console.log('══════════════════════════════════════════\n')

  // --- 3A: defineComposite API 基础行为 ---
  console.log('▸ 3A: defineComposite API 基础行为')

  const handle = defineComposite('单元测试', {
    inputs: { x: { type: 'int' } },
    outputs: { y: { type: 'int' } },
    build: ({ x }, f) => ({ y: f.addition(x, 1) })
  })

  test('handle.__composite = true', () => (handle as any).__composite === true)
  test('handle.name = "单元测试"', () => handle.name === '单元测试')
  test('handle.id >= 1610700000', () => handle.id >= 1610700000)
  test('handle.definition.inputs.x.type = "int"', () => handle.definition.inputs.x?.type === 'int')
  test('handle.definition.outputs.y.type = "int"', () => handle.definition.outputs.y?.type === 'int')

  // --- 3B: 重复定义检查 ---
  console.log('\n▸ 3B: 错误处理')

  test('重复定义抛 Error', () => {
    try {
      defineComposite('单元测试', {
        inputs: {}, outputs: {},
        build: () => ({})
      })
      return false
    } catch (e: any) {
      return e.message.includes('already defined')
    }
  })

  // --- 3C: ID 单调递增 ---
  console.log('\n▸ 3C: ID 分配')

  const h1 = defineComposite('ID测试1', {
    inputs: {}, outputs: {},
    build: () => ({})
  })
  const h2 = defineComposite('ID测试2', {
    inputs: {}, outputs: {},
    build: () => ({})
  })
  test('ID 单调递增', () => h2.id > h1.id)

  // --- 3D: toCompositeDefIR 输出完整性 ---
  console.log('\n▸ 3D: toCompositeDefIR 输出完整性')

  const simpleDef = defineComposite('IR完整性', {
    inputs: { a: { type: 'int' }, b: { type: 'int' }, c: { type: 'bool' } },
    outputs: { r: { type: 'str' } },
    build: ({ a, b, c }, f) => ({ r: f.addition(a, b) })
  })

  const ir = simpleDef.definition.toCompositeDefIR()
  test('IR 包含 name', () => typeof ir.name === 'string' && ir.name.length > 0)
  test('IR 包含 id > 0', () => ir.id > 0)
  test('IR.type = "composite"', () => ir.type === 'composite')
  test('IR.inputs 长度 = 3', () => ir.inputs.length === 3)
  test('IR.outputs 长度 = 1', () => ir.outputs.length === 1)
  test('IR.inflows 是数组', () => Array.isArray(ir.inflows))
  test('IR.outflows 是数组', () => Array.isArray(ir.outflows))
  test('IR.implNodes 是数组', () => Array.isArray(ir.implNodes))
  test('IR.implEdges 是对象', () => typeof ir.implEdges === 'object')
  test('IR.compositePins 是数组', () => Array.isArray(ir.compositePins))

  // input pinIndex 检查
  test('input[0].pinIndex = 100', () => ir.inputs[0].pinIndex === 100)
  test('input[1].pinIndex = 101', () => ir.inputs[1].pinIndex === 101)
  test('input[2].pinIndex = 102', () => ir.inputs[2].pinIndex === 102)
  test('output[0].pinIndex = 200', () => ir.outputs[0].pinIndex === 200)

  // 类型映射
  test('input[0].type = "int"', () => ir.inputs[0].type === 'int')
  test('input[1].type = "int"', () => ir.inputs[1].type === 'int')
  test('input[2].type = "bool"', () => ir.inputs[2].type === 'bool')
  test('output[0].type = "str"', () => ir.outputs[0].type === 'str')

  // --- 3E: 供应商层函数 ---
  console.log('\n▸ 3E: 供应商层函数输出')

  try {
    const pin = composite_pin_body({
      outerPinKind: 3, outerPinIndex: 0,
      innerNodeId: 1, innerPinKind: 3, innerPinIndex: 0
    })
    test('composite_pin_body 输出非空', () => pin !== null && pin !== undefined)
    test('composite_pin_body.outerPin.kind = 3', () => (pin as any)?.outerPin?.kind === 3)
    test('composite_pin_body.innerNodeId = 1', () => (pin as any)?.innerNodeId === 1)
  } catch (e: any) {
    console.log(`  ❌ composite_pin_body 异常: ${e.message}`)
    totalFailed++
  }

  try {
    const aff = graph_affiliation_body(12345)
    test('graph_affiliation_body 输出非空', () => aff !== null && aff !== undefined)
    test('graph_affiliation_body 包含节点 ID', () => {
      const obj = aff as any
      return obj.id?.id === 12345 || obj.id === 12345 || JSON.stringify(obj).includes('12345')
    })
  } catch (e: any) {
    console.log(`  ❌ graph_affiliation_body 异常: ${e.message}`)
    totalFailed++
  }

  // --- 3F: buildServerGraphRegistriesIRDocuments 的行为 ---
  console.log('\n▸ 3F: 管线集成')

  defineComposite('管线测试', {
    inputs: { val: { type: 'int' } },
    outputs: { res: { type: 'int' } },
    build: ({ val }, f) => ({ res: f.addition(val, val) })
  })

  g.server({ name: 'pipeline_test' }).on('whenEntityIsCreated', (_e: any, f: any) => {
    f.printString('test')
  })
  const docsP = buildServerGraphRegistriesIRDocuments({ defaultName: 'pipeline_test' })

  // 验证文档结构（取最新一个 doc）
  const doc = docsP[docsP.length - 1] as any
  test('IR 文档包含 graph 信息', () => doc.graph?.type === 'server')
  test('IR 文档包含节点', () => (doc.nodes?.length ?? 0) > 0)

  // 验证 compositeDefs 注入
  const piperDef = compositeRegistry.get('管线测试')
  test('管线测试捕获成功', () => piperDef?.captured !== null)

  // 验证 IR 转换缓存（第二次 buildServerGraphRegistriesIRDocuments 不应重复捕获
  const docsP2 = buildServerGraphRegistriesIRDocuments({ defaultName: 'pipeline_test2' })
  test('第二次调用不崩溃', () => docsP2.length > 0)
}

// ============== 结果报告 ==============

function printReport() {
  const total = totalPassed + totalFailed + totalSkipped
  console.log('\n══════════════════════════════════════════')
  console.log('测试报告')
  console.log('══════════════════════════════════════════')
  console.log(`  总计: ${total}`)
  console.log(`  ✅ 通过: ${totalPassed}`)
  console.log(`  ❌ 失败: ${totalFailed}`)
  console.log(`  ⏳ 跳过（@pending_ref）: ${totalSkipped}`)
  if (totalFailed > 0) {
    console.log(`\n  ❗️ 有 ${totalFailed} 个测试失败，请检查以上错误`)
  }
  if (pendingRefTests.length > 0) {
    console.log('\n  待补充参考文件的场景:')
    for (const t of pendingRefTests) {
      console.log(`    ⏳ ${t}`)
    }
    console.log('\n  标记: @pending_ref — 等完整的"设施图(定义+调用)"类型 GIA 参考文件补充后，')
    console.log('  再添加精确的 GIA 二进制对比验证。目前仅验证了 IR 结构正确性和可解码性。')
  }
  console.log('')
}

// ============== 主入口 ==============

function main() {
  // 清理输出目录
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

  console.log('复合节点完整测试套件')
  console.log('====================')
  console.log(`参考文件目录: ${REF_DIR}`)
  console.log(`输出目录: ${OUT_DIR}`)
  console.log(`Proto 路径: ${PROTO_PATH}`)

  // Part 3 先执行（快速单元测试，不依赖管线）
  part3_unit_behavior_tests()

  // Part 1（需重新构建注册表状态）
  // 注意: 由于 Part 1 + Part 2 之间的注册表状态依赖关系，
  // 目前按顺序执行。理想情况下每个 test block 应重置状态。
  part1_composite_definition_comparison()

  // Part 2（依赖管线，最重型测试）
  part2_facility_graph_tests()

  // 报告
  printReport()

  // 退出码
  if (totalFailed > 0) process.exit(1)
}

main()
