import assert from 'node:assert/strict'

import { SettlementStatus } from '../src/definitions/enum.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../src/runtime/core.js'

/**
 * O-2026-08-22-1 回归：复合节点 enum/enumeration 类型输入。
 *
 * createTypedValue 的 switch 曾无 enum/enumeration 分支 → 复合 enum 输入落 default 返回
 * generic()；enumerationsEqual 的 parseValue(x, 'enum') 要求 instanceof enumeration →
 * 编译期（复合捕获阶段）抛 "Invalid value type: enum"。
 * 影响：无法用 DSL 复刻「枚举→整数/字符串/执行分支」类复合节点
 * （原版资源包 1610612755/1610612759/1610612757/1610612758 等）。
 */

const enumInputComp = g.defineComposite('enum_input_test_comp', {
  inputs: { status: { type: 'enumeration' } },
  outputs: { isVictory: { type: 'bool' } },
  build: ({ status }, f) => {
    // 修复前：status 是 generic 实例 → parseValue('enum') 校验失败 → 抛 Invalid value type: enum
    const eq = f.enumerationsEqual(
      status as never,
      SettlementStatus.Victory as never
    )
    return { isVictory: eq }
  }
})

g.server({ id: 1073742001, name: 'enum-input-test' }).on('whenEntityIsCreated', (_evt, f) => {
  f.callComposite(enumInputComp, { status: SettlementStatus.Victory })
})

// 复合 build 在捕获阶段执行 createTypedValue + enumerationsEqual——修复前此处抛错
const docs = buildServerGraphRegistriesIRDocuments() as any[]
assert.ok(docs.length >= 1, 'at least one IR document')
const doc = docs[0]
assert.equal(doc.graph.id, 1073742001, 'server graph id')

// 复合调用保留
const callNodes = doc.nodes.filter((n: any) => n.type === '__composite_call__')
assert.ok(callNodes.length >= 1, 'composite call node exists')

// enumerations_equal 数据节点被注册（复合 impl 内；修复前捕获阶段直接抛 Invalid value type: enum）
const def = doc.compositeDefs.find((d: any) => d.name === 'enum_input_test_comp')
assert.ok(def, 'composite def present')
const implNodes = def.implNodes ?? []
const eqImpl = implNodes.find((n: any) => n.type === 'enumerations_equal')
assert.ok(eqImpl, 'enumerations_equal node in composite impl (no Invalid value type: enum)')
assert.equal(eqImpl.args.length, 2, 'enumerations_equal has two enum args')

console.log('composite_enum_input_test: PASS')
