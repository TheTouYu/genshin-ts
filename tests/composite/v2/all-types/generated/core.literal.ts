import { g } from 'genshin-ts/runtime/core'
import { configId, faction, guid, prefabId, str as strValue } from 'genshin-ts/runtime/value'
import * as E from 'genshin-ts/definitions/enum'

// AUTO-GENERATED: composite node coverage core (literal)
// Run: npx tsx scripts/generate-composite-node-gia-tests.ts
//
// Each composite wraps one ordinary f.* API call inside defineComposite().
// This complements tests/generated/* by checking that ordinary node functionality can be captured into composite impl graphs.

const comp_addition_1_float = g.defineComposite("自动复合-core-1-addition-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // addition :: float
    const ret3 = f.addition(1.25, 2.25)
    const s4 = f.dataTypeConversion(ret3, 'str')
    f.printString(s4)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done addition")]), 0)
    return {}
  }
})

const comp_addition_2_int = g.defineComposite("自动复合-core-2-addition-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // addition :: int
    const ret7 = f.addition(5n, 6n)
    const s8 = f.dataTypeConversion(ret7, 'str')
    f.printString(s8)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done addition")]), 0)
    return {}
  }
})

const comp_subtraction_3_float = g.defineComposite("自动复合-core-3-subtraction-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // subtraction :: float
    const ret11 = f.subtraction(9.25, 10.25)
    const s12 = f.dataTypeConversion(ret11, 'str')
    f.printString(s12)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done subtraction")]), 0)
    return {}
  }
})

const comp_subtraction_4_int = g.defineComposite("自动复合-core-4-subtraction-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // subtraction :: int
    const ret15 = f.subtraction(13n, 14n)
    const s16 = f.dataTypeConversion(ret15, 'str')
    f.printString(s16)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done subtraction")]), 0)
    return {}
  }
})

const comp_multiplication_5_float = g.defineComposite("自动复合-core-5-multiplication-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // multiplication :: float
    const ret19 = f.multiplication(17.25, 18.25)
    const s20 = f.dataTypeConversion(ret19, 'str')
    f.printString(s20)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done multiplication")]), 0)
    return {}
  }
})

const comp_multiplication_6_int = g.defineComposite("自动复合-core-6-multiplication-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // multiplication :: int
    const ret23 = f.multiplication(21n, 22n)
    const s24 = f.dataTypeConversion(ret23, 'str')
    f.printString(s24)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done multiplication")]), 0)
    return {}
  }
})

const comp_division_7_float = g.defineComposite("自动复合-core-7-division-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // division :: float
    const ret27 = f.division(25.25, 26.25)
    const s28 = f.dataTypeConversion(ret27, 'str')
    f.printString(s28)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done division")]), 0)
    return {}
  }
})

const comp_division_8_int = g.defineComposite("自动复合-core-8-division-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // division :: int
    const ret31 = f.division(29n, 30n)
    const s32 = f.dataTypeConversion(ret31, 'str')
    f.printString(s32)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done division")]), 0)
    return {}
  }
})

const comp_exponentiation_9_float = g.defineComposite("自动复合-core-9-exponentiation-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // exponentiation :: float
    const ret35 = f.exponentiation(33.25, 34.25)
    const s36 = f.dataTypeConversion(ret35, 'str')
    f.printString(s36)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done exponentiation")]), 0)
    return {}
  }
})

const comp_exponentiation_10_int = g.defineComposite("自动复合-core-10-exponentiation-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // exponentiation :: int
    const ret39 = f.exponentiation(37n, 38n)
    const s40 = f.dataTypeConversion(ret39, 'str')
    f.printString(s40)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done exponentiation")]), 0)
    return {}
  }
})

const comp_takeLargerValue_11_float = g.defineComposite("自动复合-core-11-takeLargerValue-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // takeLargerValue :: float
    const ret43 = f.takeLargerValue(41.25, 42.25)
    const s44 = f.dataTypeConversion(ret43, 'str')
    f.printString(s44)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done takeLargerValue")]), 0)
    return {}
  }
})

const comp_takeLargerValue_12_int = g.defineComposite("自动复合-core-12-takeLargerValue-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // takeLargerValue :: int
    const ret47 = f.takeLargerValue(45n, 46n)
    const s48 = f.dataTypeConversion(ret47, 'str')
    f.printString(s48)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done takeLargerValue")]), 0)
    return {}
  }
})

const comp_takeSmallerValue_13_float = g.defineComposite("自动复合-core-13-takeSmallerValue-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // takeSmallerValue :: float
    const ret51 = f.takeSmallerValue(49.25, 50.25)
    const s52 = f.dataTypeConversion(ret51, 'str')
    f.printString(s52)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done takeSmallerValue")]), 0)
    return {}
  }
})

const comp_takeSmallerValue_14_int = g.defineComposite("自动复合-core-14-takeSmallerValue-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // takeSmallerValue :: int
    const ret55 = f.takeSmallerValue(53n, 54n)
    const s56 = f.dataTypeConversion(ret55, 'str')
    f.printString(s56)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done takeSmallerValue")]), 0)
    return {}
  }
})

const comp_absoluteValueOperation_15_float = g.defineComposite("自动复合-core-15-absoluteValueOperation-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // absoluteValueOperation :: float
    const ret58 = f.absoluteValueOperation(57.25)
    const s59 = f.dataTypeConversion(ret58, 'str')
    f.printString(s59)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done absoluteValueOperation")]), 0)
    return {}
  }
})

const comp_absoluteValueOperation_16_int = g.defineComposite("自动复合-core-16-absoluteValueOperation-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // absoluteValueOperation :: int
    const ret61 = f.absoluteValueOperation(60n)
    const s62 = f.dataTypeConversion(ret61, 'str')
    f.printString(s62)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done absoluteValueOperation")]), 0)
    return {}
  }
})

const comp_signOperation_17_float = g.defineComposite("自动复合-core-17-signOperation-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // signOperation :: float
    const ret64 = f.signOperation(63.25)
    const s65 = f.dataTypeConversion(ret64, 'str')
    f.printString(s65)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done signOperation")]), 0)
    return {}
  }
})

const comp_signOperation_18_int = g.defineComposite("自动复合-core-18-signOperation-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // signOperation :: int
    const ret67 = f.signOperation(66n)
    const s68 = f.dataTypeConversion(ret67, 'str')
    f.printString(s68)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done signOperation")]), 0)
    return {}
  }
})

const comp_rangeLimitingOperation_19_float = g.defineComposite("自动复合-core-19-rangeLimitingOperation-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // rangeLimitingOperation :: float
    const ret72 = f.rangeLimitingOperation(69.25, 70.25, 71.25)
    const s73 = f.dataTypeConversion(ret72, 'str')
    f.printString(s73)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done rangeLimitingOperation")]), 0)
    return {}
  }
})

const comp_rangeLimitingOperation_20_int = g.defineComposite("自动复合-core-20-rangeLimitingOperation-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // rangeLimitingOperation :: int
    const ret77 = f.rangeLimitingOperation(74n, 75n, 76n)
    const s78 = f.dataTypeConversion(ret77, 'str')
    f.printString(s78)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done rangeLimitingOperation")]), 0)
    return {}
  }
})

const comp_lessThan_21_float = g.defineComposite("自动复合-core-21-lessThan-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // lessThan :: float
    const ret81 = f.lessThan(79.25, 80.25)
    const s82 = f.dataTypeConversion(ret81, 'str')
    f.printString(s82)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done lessThan")]), 0)
    return {}
  }
})

const comp_lessThan_22_int = g.defineComposite("自动复合-core-22-lessThan-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // lessThan :: int
    const ret85 = f.lessThan(83n, 84n)
    const s86 = f.dataTypeConversion(ret85, 'str')
    f.printString(s86)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done lessThan")]), 0)
    return {}
  }
})

const comp_lessThanOrEqualTo_23_float = g.defineComposite("自动复合-core-23-lessThanOrEqualTo-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // lessThanOrEqualTo :: float
    const ret89 = f.lessThanOrEqualTo(87.25, 88.25)
    const s90 = f.dataTypeConversion(ret89, 'str')
    f.printString(s90)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done lessThanOrEqualTo")]), 0)
    return {}
  }
})

const comp_lessThanOrEqualTo_24_int = g.defineComposite("自动复合-core-24-lessThanOrEqualTo-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // lessThanOrEqualTo :: int
    const ret93 = f.lessThanOrEqualTo(91n, 92n)
    const s94 = f.dataTypeConversion(ret93, 'str')
    f.printString(s94)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done lessThanOrEqualTo")]), 0)
    return {}
  }
})

const comp_greaterThan_25_float = g.defineComposite("自动复合-core-25-greaterThan-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // greaterThan :: float
    const ret97 = f.greaterThan(95.25, 96.25)
    const s98 = f.dataTypeConversion(ret97, 'str')
    f.printString(s98)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done greaterThan")]), 0)
    return {}
  }
})

const comp_greaterThan_26_int = g.defineComposite("自动复合-core-26-greaterThan-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // greaterThan :: int
    const ret101 = f.greaterThan(99n, 100n)
    const s102 = f.dataTypeConversion(ret101, 'str')
    f.printString(s102)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done greaterThan")]), 0)
    return {}
  }
})

const comp_greaterThanOrEqualTo_27_float = g.defineComposite("自动复合-core-27-greaterThanOrEqualTo-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // greaterThanOrEqualTo :: float
    const ret105 = f.greaterThanOrEqualTo(103.25, 104.25)
    const s106 = f.dataTypeConversion(ret105, 'str')
    f.printString(s106)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done greaterThanOrEqualTo")]), 0)
    return {}
  }
})

const comp_greaterThanOrEqualTo_28_int = g.defineComposite("自动复合-core-28-greaterThanOrEqualTo-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // greaterThanOrEqualTo :: int
    const ret109 = f.greaterThanOrEqualTo(107n, 108n)
    const s110 = f.dataTypeConversion(ret109, 'str')
    f.printString(s110)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done greaterThanOrEqualTo")]), 0)
    return {}
  }
})

const comp_getMaximumValueFromList_29_float = g.defineComposite("自动复合-core-29-getMaximumValueFromList-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getMaximumValueFromList :: float
    const ret112 = f.getMaximumValueFromList(f.assemblyList([111.25, 112.25, 113.25], "float"))
    const s113 = f.dataTypeConversion(ret112, 'str')
    f.printString(s113)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getMaximumValueFromList")]), 0)
    return {}
  }
})

const comp_getMaximumValueFromList_30_int = g.defineComposite("自动复合-core-30-getMaximumValueFromList-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getMaximumValueFromList :: int
    const ret115 = f.getMaximumValueFromList(f.assemblyList([114n, 115n, 116n], "int"))
    const s116 = f.dataTypeConversion(ret115, 'str')
    f.printString(s116)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getMaximumValueFromList")]), 0)
    return {}
  }
})

const comp_getMinimumValueFromList_31_float = g.defineComposite("自动复合-core-31-getMinimumValueFromList-float", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getMinimumValueFromList :: float
    const ret118 = f.getMinimumValueFromList(f.assemblyList([117.25, 118.25, 119.25], "float"))
    const s119 = f.dataTypeConversion(ret118, 'str')
    f.printString(s119)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getMinimumValueFromList")]), 0)
    return {}
  }
})

const comp_getMinimumValueFromList_32_int = g.defineComposite("自动复合-core-32-getMinimumValueFromList-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getMinimumValueFromList :: int
    const ret121 = f.getMinimumValueFromList(f.assemblyList([120n, 121n, 122n], "int"))
    const s122 = f.dataTypeConversion(ret121, 'str')
    f.printString(s122)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getMinimumValueFromList")]), 0)
    return {}
  }
})

const comp_equal_33_bool = g.defineComposite("自动复合-core-33-equal-bool", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // equal :: bool
    const ret125 = f.equal(true, false)
    const s126 = f.dataTypeConversion(ret125, 'str')
    f.printString(s126)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done equal")]), 0)
    return {}
  }
})

const comp_equal_34_configId = g.defineComposite("自动复合-core-34-equal-configId", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // equal :: configId
    const ret129 = f.equal(new configId(127n), new configId(128n))
    const s130 = f.dataTypeConversion(ret129, 'str')
    f.printString(s130)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done equal")]), 0)
    return {}
  }
})

const comp_equal_35_entity = g.defineComposite("自动复合-core-35-equal-entity", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // equal :: entity
    const ret133 = f.equal(f.getSelfEntity(), f.getSelfEntity())
    const s134 = f.dataTypeConversion(ret133, 'str')
    f.printString(s134)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done equal")]), 0)
    return {}
  }
})

const comp_equal_36_faction = g.defineComposite("自动复合-core-36-equal-faction", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // equal :: faction
    const ret137 = f.equal(new faction(135n), new faction(136n))
    const s138 = f.dataTypeConversion(ret137, 'str')
    f.printString(s138)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done equal")]), 0)
    return {}
  }
})

const comp_dataTypeConversion_37_dict_bool_int_ = g.defineComposite("自动复合-core-37-dataTypeConversion-dict<bool, int>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // dataTypeConversion :: dict<bool, int>
    const ret140 = f.dataTypeConversion(true, "int")
    const s141 = f.dataTypeConversion(ret140, 'str')
    f.printString(s141)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done dataTypeConversion")]), 0)
    return {}
  }
})

const comp_dataTypeConversion_38_dict_bool_str_ = g.defineComposite("自动复合-core-38-dataTypeConversion-dict<bool, str>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // dataTypeConversion :: dict<bool, str>
    const ret143 = f.dataTypeConversion(false, "str")
    f.printString(ret143)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done dataTypeConversion")]), 0)
    return {}
  }
})

const comp_dataTypeConversion_39_dict_entity_str_ = g.defineComposite("自动复合-core-39-dataTypeConversion-dict<entity, str>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // dataTypeConversion :: dict<entity, str>
    const ret145 = f.dataTypeConversion(f.getSelfEntity(), "str")
    f.printString(ret145)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done dataTypeConversion")]), 0)
    return {}
  }
})

const comp_dataTypeConversion_40_dict_float_int_ = g.defineComposite("自动复合-core-40-dataTypeConversion-dict<float, int>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // dataTypeConversion :: dict<float, int>
    const ret147 = f.dataTypeConversion(146.25, "int")
    const s148 = f.dataTypeConversion(ret147, 'str')
    f.printString(s148)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done dataTypeConversion")]), 0)
    return {}
  }
})

const comp_assemblyList_41_bool = g.defineComposite("自动复合-core-41-assemblyList-bool", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // assemblyList :: bool
    const ret150 = f.assemblyList(f.assemblyList([true, false, true], "bool"), "bool")
    const len151 = f.getListLength(ret150)
    const s152 = f.dataTypeConversion(len151, 'str')
    f.printString(s152)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done assemblyList")]), 0)
    return {}
  }
})

const comp_assemblyList_42_configId = g.defineComposite("自动复合-core-42-assemblyList-configId", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // assemblyList :: configId
    const ret154 = f.assemblyList(f.assemblyList([153n, 154n, 155n], "config_id"), "config_id")
    const len155 = f.getListLength(ret154)
    const s156 = f.dataTypeConversion(len155, 'str')
    f.printString(s156)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done assemblyList")]), 0)
    return {}
  }
})

const comp_assemblyList_43_entity = g.defineComposite("自动复合-core-43-assemblyList-entity", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // assemblyList :: entity
    const ret159 = f.assemblyList(f.assemblyList([f.getSelfEntity(), f.getSelfEntity(), f.getSelfEntity()], "entity"), "entity")
    const len160 = f.getListLength(ret159)
    const s161 = f.dataTypeConversion(len160, 'str')
    f.printString(s161)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done assemblyList")]), 0)
    return {}
  }
})

const comp_assemblyList_44_faction = g.defineComposite("自动复合-core-44-assemblyList-faction", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // assemblyList :: faction
    const ret163 = f.assemblyList(f.assemblyList([162n, 163n, 164n], "faction"), "faction")
    const len164 = f.getListLength(ret163)
    const s165 = f.dataTypeConversion(len164, 'str')
    f.printString(s165)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done assemblyList")]), 0)
    return {}
  }
})

const comp_getListLength_45_bool = g.defineComposite("自动复合-core-45-getListLength-bool", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getListLength :: bool
    const ret167 = f.getListLength(f.assemblyList([false, true, false], "bool"))
    const s168 = f.dataTypeConversion(ret167, 'str')
    f.printString(s168)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListLength")]), 0)
    return {}
  }
})

const comp_getListLength_46_configId = g.defineComposite("自动复合-core-46-getListLength-configId", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getListLength :: configId
    const ret170 = f.getListLength(f.assemblyList([169n, 170n, 171n], "config_id"))
    const s171 = f.dataTypeConversion(ret170, 'str')
    f.printString(s171)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListLength")]), 0)
    return {}
  }
})

const comp_getListLength_47_entity = g.defineComposite("自动复合-core-47-getListLength-entity", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getListLength :: entity
    const ret174 = f.getListLength(f.assemblyList([f.getSelfEntity(), f.getSelfEntity(), f.getSelfEntity()], "entity"))
    const s175 = f.dataTypeConversion(ret174, 'str')
    f.printString(s175)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListLength")]), 0)
    return {}
  }
})

const comp_getListLength_48_faction = g.defineComposite("自动复合-core-48-getListLength-faction", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getListLength :: faction
    const ret177 = f.getListLength(f.assemblyList([176n, 177n, 178n], "faction"))
    const s178 = f.dataTypeConversion(ret177, 'str')
    f.printString(s178)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListLength")]), 0)
    return {}
  }
})

const comp_listIterationLoop_49_bool = g.defineComposite("自动复合-core-49-listIterationLoop-bool", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // listIterationLoop :: bool
    f.listIterationLoop(f.assemblyList([true, false, true], "bool"), () => { f.printString("literal_cb_listIterationLoop_1") })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done listIterationLoop")]), 0)
    return {}
  }
})

const comp_listIterationLoop_50_configId = g.defineComposite("自动复合-core-50-listIterationLoop-configId", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // listIterationLoop :: configId
    f.listIterationLoop(f.assemblyList([180n, 181n, 182n], "config_id"), () => { f.printString("literal_cb_listIterationLoop_1") })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done listIterationLoop")]), 0)
    return {}
  }
})

const comp_listIterationLoop_51_entity = g.defineComposite("自动复合-core-51-listIterationLoop-entity", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // listIterationLoop :: entity
    f.listIterationLoop(f.assemblyList([f.getSelfEntity(), f.getSelfEntity(), f.getSelfEntity()], "entity"), () => { f.printString("literal_cb_listIterationLoop_1") })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done listIterationLoop")]), 0)
    return {}
  }
})

const comp_listIterationLoop_52_faction = g.defineComposite("自动复合-core-52-listIterationLoop-faction", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // listIterationLoop :: faction
    f.listIterationLoop(f.assemblyList([183n, 184n, 185n], "faction"), () => { f.printString("literal_cb_listIterationLoop_1") })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done listIterationLoop")]), 0)
    return {}
  }
})

const comp_printString_53 = g.defineComposite("自动复合-core-53-printString", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    f.printString("184")
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done printString")]), 0)
    return {}
  }
})

const comp_finiteLoop_54 = g.defineComposite("自动复合-core-54-finiteLoop", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    f.finiteLoop(185n, 186n, () => { f.printString("literal_cb_finiteLoop_2") })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done finiteLoop")]), 0)
    return {}
  }
})

const comp_doubleBranch_55 = g.defineComposite("自动复合-core-55-doubleBranch", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    f.doubleBranch(true, () => { f.printString("literal_cb_doubleBranch_1") }, () => { f.printString("literal_cb_doubleBranch_2") })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done doubleBranch")]), 0)
    return {}
  }
})

const comp_multipleBranches_56_int = g.defineComposite("自动复合-core-56-multipleBranches-int", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // multipleBranches :: int
    f.multipleBranches(188n, ({ 1: () => { f.printString("literal_b1_multipleBranches_1") }, default: () => { f.printString("literal_bd_multipleBranches_1") } }))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done multipleBranches")]), 0)
    return {}
  }
})

const comp_multipleBranches_57_str = g.defineComposite("自动复合-core-57-multipleBranches-str", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // multipleBranches :: str
    f.multipleBranches("189", ({ 1: () => { f.printString("literal_b1_multipleBranches_1") }, default: () => { f.printString("literal_bd_multipleBranches_1") } }))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done multipleBranches")]), 0)
    return {}
  }
})

const graph = g.server({
  mode: 'beyond',
  type: 'entity',
  name: "V2-全类型自动复合-core-literal-step1",
  id: 1073741924
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
