import { g } from 'genshin-ts/runtime/core'
import { configId, faction, guid, prefabId, str as strValue } from 'genshin-ts/runtime/value'
import * as E from 'genshin-ts/definitions/enum'

// AUTO-GENERATED: composite node coverage core (wire)
// Run: npx tsx scripts/generate-composite-node-gia-tests.ts
//
// Each composite wraps one ordinary f.* API call inside defineComposite().
// This complements tests/generated/* by checking that ordinary node functionality can be captured into composite impl graphs.

const comp_addition_1_float = g.defineComposite("自动复合-core-1-addition-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // addition :: float
    const ret1 = f.addition(vFloat, vFloat)
    const s2 = f.dataTypeConversion(ret1, 'str')
    f.printString(s2)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done addition")]), 0)
    return {}
  }
})

const comp_addition_2_int = g.defineComposite("自动复合-core-2-addition-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // addition :: int
    const ret3 = f.addition(vInt, vInt)
    const s4 = f.dataTypeConversion(ret3, 'str')
    f.printString(s4)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done addition")]), 0)
    return {}
  }
})

const comp_subtraction_3_float = g.defineComposite("自动复合-core-3-subtraction-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // subtraction :: float
    const ret5 = f.subtraction(vFloat, vFloat)
    const s6 = f.dataTypeConversion(ret5, 'str')
    f.printString(s6)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done subtraction")]), 0)
    return {}
  }
})

const comp_subtraction_4_int = g.defineComposite("自动复合-core-4-subtraction-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // subtraction :: int
    const ret7 = f.subtraction(vInt, vInt)
    const s8 = f.dataTypeConversion(ret7, 'str')
    f.printString(s8)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done subtraction")]), 0)
    return {}
  }
})

const comp_multiplication_5_float = g.defineComposite("自动复合-core-5-multiplication-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // multiplication :: float
    const ret9 = f.multiplication(vFloat, vFloat)
    const s10 = f.dataTypeConversion(ret9, 'str')
    f.printString(s10)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done multiplication")]), 0)
    return {}
  }
})

const comp_multiplication_6_int = g.defineComposite("自动复合-core-6-multiplication-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // multiplication :: int
    const ret11 = f.multiplication(vInt, vInt)
    const s12 = f.dataTypeConversion(ret11, 'str')
    f.printString(s12)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done multiplication")]), 0)
    return {}
  }
})

const comp_division_7_float = g.defineComposite("自动复合-core-7-division-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // division :: float
    const ret13 = f.division(vFloat, vFloat)
    const s14 = f.dataTypeConversion(ret13, 'str')
    f.printString(s14)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done division")]), 0)
    return {}
  }
})

const comp_division_8_int = g.defineComposite("自动复合-core-8-division-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // division :: int
    const ret15 = f.division(vInt, vInt)
    const s16 = f.dataTypeConversion(ret15, 'str')
    f.printString(s16)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done division")]), 0)
    return {}
  }
})

const comp_exponentiation_9_float = g.defineComposite("自动复合-core-9-exponentiation-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // exponentiation :: float
    const ret17 = f.exponentiation(vFloat, vFloat)
    const s18 = f.dataTypeConversion(ret17, 'str')
    f.printString(s18)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done exponentiation")]), 0)
    return {}
  }
})

const comp_exponentiation_10_int = g.defineComposite("自动复合-core-10-exponentiation-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // exponentiation :: int
    const ret19 = f.exponentiation(vInt, vInt)
    const s20 = f.dataTypeConversion(ret19, 'str')
    f.printString(s20)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done exponentiation")]), 0)
    return {}
  }
})

const comp_takeLargerValue_11_float = g.defineComposite("自动复合-core-11-takeLargerValue-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // takeLargerValue :: float
    const ret21 = f.takeLargerValue(vFloat, vFloat)
    const s22 = f.dataTypeConversion(ret21, 'str')
    f.printString(s22)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done takeLargerValue")]), 0)
    return {}
  }
})

const comp_takeLargerValue_12_int = g.defineComposite("自动复合-core-12-takeLargerValue-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // takeLargerValue :: int
    const ret23 = f.takeLargerValue(vInt, vInt)
    const s24 = f.dataTypeConversion(ret23, 'str')
    f.printString(s24)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done takeLargerValue")]), 0)
    return {}
  }
})

const comp_takeSmallerValue_13_float = g.defineComposite("自动复合-core-13-takeSmallerValue-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // takeSmallerValue :: float
    const ret25 = f.takeSmallerValue(vFloat, vFloat)
    const s26 = f.dataTypeConversion(ret25, 'str')
    f.printString(s26)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done takeSmallerValue")]), 0)
    return {}
  }
})

const comp_takeSmallerValue_14_int = g.defineComposite("自动复合-core-14-takeSmallerValue-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // takeSmallerValue :: int
    const ret27 = f.takeSmallerValue(vInt, vInt)
    const s28 = f.dataTypeConversion(ret27, 'str')
    f.printString(s28)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done takeSmallerValue")]), 0)
    return {}
  }
})

const comp_absoluteValueOperation_15_float = g.defineComposite("自动复合-core-15-absoluteValueOperation-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // absoluteValueOperation :: float
    const ret29 = f.absoluteValueOperation(vFloat)
    const s30 = f.dataTypeConversion(ret29, 'str')
    f.printString(s30)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done absoluteValueOperation")]), 0)
    return {}
  }
})

const comp_absoluteValueOperation_16_int = g.defineComposite("自动复合-core-16-absoluteValueOperation-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // absoluteValueOperation :: int
    const ret31 = f.absoluteValueOperation(vInt)
    const s32 = f.dataTypeConversion(ret31, 'str')
    f.printString(s32)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done absoluteValueOperation")]), 0)
    return {}
  }
})

const comp_signOperation_17_float = g.defineComposite("自动复合-core-17-signOperation-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // signOperation :: float
    const ret33 = f.signOperation(vFloat)
    const s34 = f.dataTypeConversion(ret33, 'str')
    f.printString(s34)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done signOperation")]), 0)
    return {}
  }
})

const comp_signOperation_18_int = g.defineComposite("自动复合-core-18-signOperation-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // signOperation :: int
    const ret35 = f.signOperation(vInt)
    const s36 = f.dataTypeConversion(ret35, 'str')
    f.printString(s36)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done signOperation")]), 0)
    return {}
  }
})

const comp_rangeLimitingOperation_19_float = g.defineComposite("自动复合-core-19-rangeLimitingOperation-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // rangeLimitingOperation :: float
    const ret37 = f.rangeLimitingOperation(vFloat, vFloat, vFloat)
    const s38 = f.dataTypeConversion(ret37, 'str')
    f.printString(s38)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done rangeLimitingOperation")]), 0)
    return {}
  }
})

const comp_rangeLimitingOperation_20_int = g.defineComposite("自动复合-core-20-rangeLimitingOperation-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // rangeLimitingOperation :: int
    const ret39 = f.rangeLimitingOperation(vInt, vInt, vInt)
    const s40 = f.dataTypeConversion(ret39, 'str')
    f.printString(s40)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done rangeLimitingOperation")]), 0)
    return {}
  }
})

const comp_lessThan_21_float = g.defineComposite("自动复合-core-21-lessThan-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // lessThan :: float
    const ret41 = f.lessThan(vFloat, vFloat)
    const s42 = f.dataTypeConversion(ret41, 'str')
    f.printString(s42)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done lessThan")]), 0)
    return {}
  }
})

const comp_lessThan_22_int = g.defineComposite("自动复合-core-22-lessThan-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // lessThan :: int
    const ret43 = f.lessThan(vInt, vInt)
    const s44 = f.dataTypeConversion(ret43, 'str')
    f.printString(s44)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done lessThan")]), 0)
    return {}
  }
})

const comp_lessThanOrEqualTo_23_float = g.defineComposite("自动复合-core-23-lessThanOrEqualTo-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // lessThanOrEqualTo :: float
    const ret45 = f.lessThanOrEqualTo(vFloat, vFloat)
    const s46 = f.dataTypeConversion(ret45, 'str')
    f.printString(s46)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done lessThanOrEqualTo")]), 0)
    return {}
  }
})

const comp_lessThanOrEqualTo_24_int = g.defineComposite("自动复合-core-24-lessThanOrEqualTo-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // lessThanOrEqualTo :: int
    const ret47 = f.lessThanOrEqualTo(vInt, vInt)
    const s48 = f.dataTypeConversion(ret47, 'str')
    f.printString(s48)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done lessThanOrEqualTo")]), 0)
    return {}
  }
})

const comp_greaterThan_25_float = g.defineComposite("自动复合-core-25-greaterThan-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // greaterThan :: float
    const ret49 = f.greaterThan(vFloat, vFloat)
    const s50 = f.dataTypeConversion(ret49, 'str')
    f.printString(s50)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done greaterThan")]), 0)
    return {}
  }
})

const comp_greaterThan_26_int = g.defineComposite("自动复合-core-26-greaterThan-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // greaterThan :: int
    const ret51 = f.greaterThan(vInt, vInt)
    const s52 = f.dataTypeConversion(ret51, 'str')
    f.printString(s52)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done greaterThan")]), 0)
    return {}
  }
})

const comp_greaterThanOrEqualTo_27_float = g.defineComposite("自动复合-core-27-greaterThanOrEqualTo-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // greaterThanOrEqualTo :: float
    const ret53 = f.greaterThanOrEqualTo(vFloat, vFloat)
    const s54 = f.dataTypeConversion(ret53, 'str')
    f.printString(s54)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done greaterThanOrEqualTo")]), 0)
    return {}
  }
})

const comp_greaterThanOrEqualTo_28_int = g.defineComposite("自动复合-core-28-greaterThanOrEqualTo-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // greaterThanOrEqualTo :: int
    const ret55 = f.greaterThanOrEqualTo(vInt, vInt)
    const s56 = f.dataTypeConversion(ret55, 'str')
    f.printString(s56)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done greaterThanOrEqualTo")]), 0)
    return {}
  }
})

const comp_getMaximumValueFromList_29_float = g.defineComposite("自动复合-core-29-getMaximumValueFromList-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // getMaximumValueFromList :: float
    const ret57 = f.getMaximumValueFromList(f.assemblyList([vFloat, vFloat, vFloat], "float"))
    const s58 = f.dataTypeConversion(ret57, 'str')
    f.printString(s58)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getMaximumValueFromList")]), 0)
    return {}
  }
})

const comp_getMaximumValueFromList_30_int = g.defineComposite("自动复合-core-30-getMaximumValueFromList-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // getMaximumValueFromList :: int
    const ret59 = f.getMaximumValueFromList(f.assemblyList([vInt, vInt, vInt], "int"))
    const s60 = f.dataTypeConversion(ret59, 'str')
    f.printString(s60)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getMaximumValueFromList")]), 0)
    return {}
  }
})

const comp_getMinimumValueFromList_31_float = g.defineComposite("自动复合-core-31-getMinimumValueFromList-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // getMinimumValueFromList :: float
    const ret61 = f.getMinimumValueFromList(f.assemblyList([vFloat, vFloat, vFloat], "float"))
    const s62 = f.dataTypeConversion(ret61, 'str')
    f.printString(s62)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getMinimumValueFromList")]), 0)
    return {}
  }
})

const comp_getMinimumValueFromList_32_int = g.defineComposite("自动复合-core-32-getMinimumValueFromList-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // getMinimumValueFromList :: int
    const ret63 = f.getMinimumValueFromList(f.assemblyList([vInt, vInt, vInt], "int"))
    const s64 = f.dataTypeConversion(ret63, 'str')
    f.printString(s64)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getMinimumValueFromList")]), 0)
    return {}
  }
})

const comp_equal_33_bool = g.defineComposite("自动复合-core-33-equal-bool", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // equal :: bool
    const ret65 = f.equal(vBool, vBool)
    const s66 = f.dataTypeConversion(ret65, 'str')
    f.printString(s66)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done equal")]), 0)
    return {}
  }
})

const comp_equal_34_configId = g.defineComposite("自动复合-core-34-equal-configId", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // equal :: configId
    const ret67 = f.equal(vConfig, vConfig)
    const s68 = f.dataTypeConversion(ret67, 'str')
    f.printString(s68)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done equal")]), 0)
    return {}
  }
})

const comp_equal_35_entity = g.defineComposite("自动复合-core-35-equal-entity", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // equal :: entity
    const ret69 = f.equal(e, e)
    const s70 = f.dataTypeConversion(ret69, 'str')
    f.printString(s70)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done equal")]), 0)
    return {}
  }
})

const comp_equal_36_faction = g.defineComposite("自动复合-core-36-equal-faction", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // equal :: faction
    const ret71 = f.equal(vFaction, vFaction)
    const s72 = f.dataTypeConversion(ret71, 'str')
    f.printString(s72)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done equal")]), 0)
    return {}
  }
})

const comp_dataTypeConversion_37_dict_bool_int_ = g.defineComposite("自动复合-core-37-dataTypeConversion-dict<bool, int>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // dataTypeConversion :: dict<bool, int>
    const ret73 = f.dataTypeConversion(vBool, "int")
    const s74 = f.dataTypeConversion(ret73, 'str')
    f.printString(s74)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done dataTypeConversion")]), 0)
    return {}
  }
})

const comp_dataTypeConversion_38_dict_bool_str_ = g.defineComposite("自动复合-core-38-dataTypeConversion-dict<bool, str>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // dataTypeConversion :: dict<bool, str>
    const ret75 = f.dataTypeConversion(vBool, "str")
    f.printString(ret75)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done dataTypeConversion")]), 0)
    return {}
  }
})

const comp_dataTypeConversion_39_dict_entity_str_ = g.defineComposite("自动复合-core-39-dataTypeConversion-dict<entity, str>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // dataTypeConversion :: dict<entity, str>
    const ret76 = f.dataTypeConversion(e, "str")
    f.printString(ret76)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done dataTypeConversion")]), 0)
    return {}
  }
})

const comp_dataTypeConversion_40_dict_float_int_ = g.defineComposite("自动复合-core-40-dataTypeConversion-dict<float, int>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // dataTypeConversion :: dict<float, int>
    const ret77 = f.dataTypeConversion(vFloat, "int")
    const s78 = f.dataTypeConversion(ret77, 'str')
    f.printString(s78)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done dataTypeConversion")]), 0)
    return {}
  }
})

const comp_assemblyList_41_bool = g.defineComposite("自动复合-core-41-assemblyList-bool", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // assemblyList :: bool
    const ret79 = f.assemblyList(f.assemblyList([vBool, vBool, vBool], "bool"), "bool")
    const len80 = f.getListLength(ret79)
    const s81 = f.dataTypeConversion(len80, 'str')
    f.printString(s81)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done assemblyList")]), 0)
    return {}
  }
})

const comp_assemblyList_42_configId = g.defineComposite("自动复合-core-42-assemblyList-configId", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // assemblyList :: configId
    const ret82 = f.assemblyList(f.assemblyList([vConfig, vConfig, vConfig], "config_id"), "config_id")
    const len83 = f.getListLength(ret82)
    const s84 = f.dataTypeConversion(len83, 'str')
    f.printString(s84)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done assemblyList")]), 0)
    return {}
  }
})

const comp_assemblyList_43_entity = g.defineComposite("自动复合-core-43-assemblyList-entity", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // assemblyList :: entity
    const ret85 = f.assemblyList(f.assemblyList([e, e, e], "entity"), "entity")
    const len86 = f.getListLength(ret85)
    const s87 = f.dataTypeConversion(len86, 'str')
    f.printString(s87)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done assemblyList")]), 0)
    return {}
  }
})

const comp_assemblyList_44_faction = g.defineComposite("自动复合-core-44-assemblyList-faction", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // assemblyList :: faction
    const ret88 = f.assemblyList(f.assemblyList([vFaction, vFaction, vFaction], "faction"), "faction")
    const len89 = f.getListLength(ret88)
    const s90 = f.dataTypeConversion(len89, 'str')
    f.printString(s90)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done assemblyList")]), 0)
    return {}
  }
})

const comp_getListLength_45_bool = g.defineComposite("自动复合-core-45-getListLength-bool", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // getListLength :: bool
    const ret91 = f.getListLength(f.assemblyList([vBool, vBool, vBool], "bool"))
    const s92 = f.dataTypeConversion(ret91, 'str')
    f.printString(s92)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListLength")]), 0)
    return {}
  }
})

const comp_getListLength_46_configId = g.defineComposite("自动复合-core-46-getListLength-configId", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // getListLength :: configId
    const ret93 = f.getListLength(f.assemblyList([vConfig, vConfig, vConfig], "config_id"))
    const s94 = f.dataTypeConversion(ret93, 'str')
    f.printString(s94)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListLength")]), 0)
    return {}
  }
})

const comp_getListLength_47_entity = g.defineComposite("自动复合-core-47-getListLength-entity", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // getListLength :: entity
    const ret95 = f.getListLength(f.assemblyList([e, e, e], "entity"))
    const s96 = f.dataTypeConversion(ret95, 'str')
    f.printString(s96)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListLength")]), 0)
    return {}
  }
})

const comp_getListLength_48_faction = g.defineComposite("自动复合-core-48-getListLength-faction", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // getListLength :: faction
    const ret97 = f.getListLength(f.assemblyList([vFaction, vFaction, vFaction], "faction"))
    const s98 = f.dataTypeConversion(ret97, 'str')
    f.printString(s98)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListLength")]), 0)
    return {}
  }
})

const comp_listIterationLoop_49_bool = g.defineComposite("自动复合-core-49-listIterationLoop-bool", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // listIterationLoop :: bool
    f.listIterationLoop(f.assemblyList([vBool, vBool, vBool], "bool"), () => { f.printString("wire_cb_listIterationLoop_1") })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done listIterationLoop")]), 0)
    return {}
  }
})

const comp_listIterationLoop_50_configId = g.defineComposite("自动复合-core-50-listIterationLoop-configId", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // listIterationLoop :: configId
    f.listIterationLoop(f.assemblyList([vConfig, vConfig, vConfig], "config_id"), () => { f.printString("wire_cb_listIterationLoop_1") })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done listIterationLoop")]), 0)
    return {}
  }
})

const comp_listIterationLoop_51_entity = g.defineComposite("自动复合-core-51-listIterationLoop-entity", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // listIterationLoop :: entity
    f.listIterationLoop(f.assemblyList([e, e, e], "entity"), () => { f.printString("wire_cb_listIterationLoop_1") })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done listIterationLoop")]), 0)
    return {}
  }
})

const comp_listIterationLoop_52_faction = g.defineComposite("自动复合-core-52-listIterationLoop-faction", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // listIterationLoop :: faction
    f.listIterationLoop(f.assemblyList([vFaction, vFaction, vFaction], "faction"), () => { f.printString("wire_cb_listIterationLoop_1") })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done listIterationLoop")]), 0)
    return {}
  }
})

const comp_printString_53 = g.defineComposite("自动复合-core-53-printString", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    f.printString(vStr)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done printString")]), 0)
    return {}
  }
})

const comp_finiteLoop_54 = g.defineComposite("自动复合-core-54-finiteLoop", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    f.finiteLoop(vInt, vInt, () => { f.printString("wire_cb_finiteLoop_2") })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done finiteLoop")]), 0)
    return {}
  }
})

const comp_doubleBranch_55 = g.defineComposite("自动复合-core-55-doubleBranch", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    f.doubleBranch(vBool, () => { f.printString("wire_cb_doubleBranch_1") }, () => { f.printString("wire_cb_doubleBranch_2") })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done doubleBranch")]), 0)
    return {}
  }
})

const comp_multipleBranches_56_int = g.defineComposite("自动复合-core-56-multipleBranches-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // multipleBranches :: int
    f.multipleBranches(vInt, ({ 1: () => { f.printString("wire_b1_multipleBranches_1") }, default: () => { f.printString("wire_bd_multipleBranches_1") } }))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done multipleBranches")]), 0)
    return {}
  }
})

const comp_multipleBranches_57_str = g.defineComposite("自动复合-core-57-multipleBranches-str", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vBool = f.equal(1n, 1n)
    const vGuid = f.queryGuidByEntity(e)
    const vFaction = f.queryEntityFaction(e)
    const vVec3 = f.create3dVector(1, 2, 3)
    const vStr = f.dataTypeConversion(1n, 'str')
    const vConfig = f.queryPlayerClass(e)
    // multipleBranches :: str
    f.multipleBranches(vStr, ({ 1: () => { f.printString("wire_b1_multipleBranches_1") }, default: () => { f.printString("wire_bd_multipleBranches_1") } }))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done multipleBranches")]), 0)
    return {}
  }
})

const graph = g.server({
  mode: 'beyond',
  type: 'entity',
  name: "V2-全类型自动复合-core-wire-step1",
  id: 1073741925
})

graph.on('whenEntityIsCreated', (_e, f) => {
  f.callComposite(comp_addition_1_float, {})
  f.callComposite(comp_addition_2_int, {})
  f.callComposite(comp_subtraction_3_float, {})
  f.callComposite(comp_subtraction_4_int, {})
  f.callComposite(comp_multiplication_5_float, {})
  f.callComposite(comp_multiplication_6_int, {})
  f.callComposite(comp_division_7_float, {})
  f.callComposite(comp_division_8_int, {})
  f.callComposite(comp_exponentiation_9_float, {})
  f.callComposite(comp_exponentiation_10_int, {})
  f.callComposite(comp_takeLargerValue_11_float, {})
  f.callComposite(comp_takeLargerValue_12_int, {})
  f.callComposite(comp_takeSmallerValue_13_float, {})
  f.callComposite(comp_takeSmallerValue_14_int, {})
  f.callComposite(comp_absoluteValueOperation_15_float, {})
  f.callComposite(comp_absoluteValueOperation_16_int, {})
  f.callComposite(comp_signOperation_17_float, {})
  f.callComposite(comp_signOperation_18_int, {})
  f.callComposite(comp_rangeLimitingOperation_19_float, {})
  f.callComposite(comp_rangeLimitingOperation_20_int, {})
  f.callComposite(comp_lessThan_21_float, {})
  f.callComposite(comp_lessThan_22_int, {})
  f.callComposite(comp_lessThanOrEqualTo_23_float, {})
  f.callComposite(comp_lessThanOrEqualTo_24_int, {})
  f.callComposite(comp_greaterThan_25_float, {})
  f.callComposite(comp_greaterThan_26_int, {})
  f.callComposite(comp_greaterThanOrEqualTo_27_float, {})
  f.callComposite(comp_greaterThanOrEqualTo_28_int, {})
  f.callComposite(comp_getMaximumValueFromList_29_float, {})
  f.callComposite(comp_getMaximumValueFromList_30_int, {})
  f.callComposite(comp_getMinimumValueFromList_31_float, {})
  f.callComposite(comp_getMinimumValueFromList_32_int, {})
  f.callComposite(comp_equal_33_bool, {})
  f.callComposite(comp_equal_34_configId, {})
  f.callComposite(comp_equal_35_entity, {})
  f.callComposite(comp_equal_36_faction, {})
  f.callComposite(comp_dataTypeConversion_37_dict_bool_int_, {})
  f.callComposite(comp_dataTypeConversion_38_dict_bool_str_, {})
  f.callComposite(comp_dataTypeConversion_39_dict_entity_str_, {})
  f.callComposite(comp_dataTypeConversion_40_dict_float_int_, {})
  f.callComposite(comp_assemblyList_41_bool, {})
  f.callComposite(comp_assemblyList_42_configId, {})
  f.callComposite(comp_assemblyList_43_entity, {})
  f.callComposite(comp_assemblyList_44_faction, {})
  f.callComposite(comp_getListLength_45_bool, {})
  f.callComposite(comp_getListLength_46_configId, {})
  f.callComposite(comp_getListLength_47_entity, {})
  f.callComposite(comp_getListLength_48_faction, {})
  f.callComposite(comp_listIterationLoop_49_bool, {})
  f.callComposite(comp_listIterationLoop_50_configId, {})
  f.callComposite(comp_listIterationLoop_51_entity, {})
  f.callComposite(comp_listIterationLoop_52_faction, {})
  f.callComposite(comp_printString_53, {})
  f.callComposite(comp_finiteLoop_54, {})
  f.callComposite(comp_doubleBranch_55, {})
  f.callComposite(comp_multipleBranches_56_int, {})
  f.callComposite(comp_multipleBranches_57_str, {})
})
