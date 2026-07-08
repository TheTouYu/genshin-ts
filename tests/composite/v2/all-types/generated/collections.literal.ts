import { g } from 'genshin-ts/runtime/core'
import { configId, faction, guid, prefabId, str as strValue } from 'genshin-ts/runtime/value'
import * as E from 'genshin-ts/definitions/enum'

// AUTO-GENERATED: composite node coverage collections (literal)
// Run: npx tsx scripts/generate-composite-node-gia-tests.ts
//
// Each composite wraps one ordinary f.* API call inside defineComposite().
// This complements tests/generated/* by checking that ordinary node functionality can be captured into composite impl graphs.

const comp_concatenateList_1_bool = g.defineComposite("自动复合-collections-1-concatenateList-bool", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // concatenateList :: bool
    f.concatenateList(f.assemblyList([true, false, true], "bool"), f.assemblyList([false, true, false], "bool"))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done concatenateList")]), 0)
    return {}
  }
})

const comp_concatenateList_2_configId = g.defineComposite("自动复合-collections-2-concatenateList-configId", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // concatenateList :: configId
    f.concatenateList(f.assemblyList([3n, 4n, 5n], "config_id"), f.assemblyList([4n, 5n, 6n], "config_id"))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done concatenateList")]), 0)
    return {}
  }
})

const comp_concatenateList_3_entity = g.defineComposite("自动复合-collections-3-concatenateList-entity", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // concatenateList :: entity
    f.concatenateList(f.assemblyList([f.getSelfEntity(), f.getSelfEntity(), f.getSelfEntity()], "entity"), f.assemblyList([f.getSelfEntity(), f.getSelfEntity(), f.getSelfEntity()], "entity"))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done concatenateList")]), 0)
    return {}
  }
})

const comp_concatenateList_4_faction = g.defineComposite("自动复合-collections-4-concatenateList-faction", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // concatenateList :: faction
    f.concatenateList(f.assemblyList([9n, 10n, 11n], "faction"), f.assemblyList([10n, 11n, 12n], "faction"))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done concatenateList")]), 0)
    return {}
  }
})

const comp_clearList_5_bool = g.defineComposite("自动复合-collections-5-clearList-bool", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // clearList :: bool
    f.clearList(f.assemblyList([true, false, true], "bool"))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done clearList")]), 0)
    return {}
  }
})

const comp_clearList_6_configId = g.defineComposite("自动复合-collections-6-clearList-configId", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // clearList :: configId
    f.clearList(f.assemblyList([12n, 13n, 14n], "config_id"))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done clearList")]), 0)
    return {}
  }
})

const comp_clearList_7_entity = g.defineComposite("自动复合-collections-7-clearList-entity", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // clearList :: entity
    f.clearList(f.assemblyList([f.getSelfEntity(), f.getSelfEntity(), f.getSelfEntity()], "entity"))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done clearList")]), 0)
    return {}
  }
})

const comp_clearList_8_faction = g.defineComposite("自动复合-collections-8-clearList-faction", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // clearList :: faction
    f.clearList(f.assemblyList([15n, 16n, 17n], "faction"))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done clearList")]), 0)
    return {}
  }
})

const comp_listIncludesThisValue_9_bool = g.defineComposite("自动复合-collections-9-listIncludesThisValue-bool", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // listIncludesThisValue :: bool
    const ret18 = f.listIncludesThisValue(f.assemblyList([false, true, false], "bool"), true)
    const s19 = f.dataTypeConversion(ret18, 'str')
    f.printString(s19)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done listIncludesThisValue")]), 0)
    return {}
  }
})

const comp_listIncludesThisValue_10_configId = g.defineComposite("自动复合-collections-10-listIncludesThisValue-configId", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // listIncludesThisValue :: configId
    const ret22 = f.listIncludesThisValue(f.assemblyList([20n, 21n, 22n], "config_id"), new configId(21n))
    const s23 = f.dataTypeConversion(ret22, 'str')
    f.printString(s23)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done listIncludesThisValue")]), 0)
    return {}
  }
})

const comp_listIncludesThisValue_11_entity = g.defineComposite("自动复合-collections-11-listIncludesThisValue-entity", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // listIncludesThisValue :: entity
    const ret27 = f.listIncludesThisValue(f.assemblyList([f.getSelfEntity(), f.getSelfEntity(), f.getSelfEntity()], "entity"), f.getSelfEntity())
    const s28 = f.dataTypeConversion(ret27, 'str')
    f.printString(s28)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done listIncludesThisValue")]), 0)
    return {}
  }
})

const comp_listIncludesThisValue_12_faction = g.defineComposite("自动复合-collections-12-listIncludesThisValue-faction", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // listIncludesThisValue :: faction
    const ret31 = f.listIncludesThisValue(f.assemblyList([29n, 30n, 31n], "faction"), new faction(30n))
    const s32 = f.dataTypeConversion(ret31, 'str')
    f.printString(s32)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done listIncludesThisValue")]), 0)
    return {}
  }
})

const comp_searchListAndReturnValueId_13_bool = g.defineComposite("自动复合-collections-13-searchListAndReturnValueId-bool", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // searchListAndReturnValueId :: bool
    const ret35 = f.searchListAndReturnValueId(f.assemblyList([true, false, true], "bool"), false)
    const len36 = f.getListLength(ret35)
    const s37 = f.dataTypeConversion(len36, 'str')
    f.printString(s37)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done searchListAndReturnValueId")]), 0)
    return {}
  }
})

const comp_searchListAndReturnValueId_14_configId = g.defineComposite("自动复合-collections-14-searchListAndReturnValueId-configId", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // searchListAndReturnValueId :: configId
    const ret40 = f.searchListAndReturnValueId(f.assemblyList([38n, 39n, 40n], "config_id"), new configId(39n))
    const len41 = f.getListLength(ret40)
    const s42 = f.dataTypeConversion(len41, 'str')
    f.printString(s42)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done searchListAndReturnValueId")]), 0)
    return {}
  }
})

const comp_searchListAndReturnValueId_15_entity = g.defineComposite("自动复合-collections-15-searchListAndReturnValueId-entity", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // searchListAndReturnValueId :: entity
    const ret46 = f.searchListAndReturnValueId(f.assemblyList([f.getSelfEntity(), f.getSelfEntity(), f.getSelfEntity()], "entity"), f.getSelfEntity())
    const len47 = f.getListLength(ret46)
    const s48 = f.dataTypeConversion(len47, 'str')
    f.printString(s48)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done searchListAndReturnValueId")]), 0)
    return {}
  }
})

const comp_searchListAndReturnValueId_16_faction = g.defineComposite("自动复合-collections-16-searchListAndReturnValueId-faction", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // searchListAndReturnValueId :: faction
    const ret51 = f.searchListAndReturnValueId(f.assemblyList([49n, 50n, 51n], "faction"), new faction(50n))
    const len52 = f.getListLength(ret51)
    const s53 = f.dataTypeConversion(len52, 'str')
    f.printString(s53)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done searchListAndReturnValueId")]), 0)
    return {}
  }
})

const comp_getCorrespondingValueFromList_17_bool = g.defineComposite("自动复合-collections-17-getCorrespondingValueFromList-bool", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getCorrespondingValueFromList :: bool
    const ret56 = f.getCorrespondingValueFromList(f.assemblyList([false, true, false], "bool"), 55n)
    const s57 = f.dataTypeConversion(ret56, 'str')
    f.printString(s57)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getCorrespondingValueFromList")]), 0)
    return {}
  }
})

const comp_getCorrespondingValueFromList_18_configId = g.defineComposite("自动复合-collections-18-getCorrespondingValueFromList-configId", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getCorrespondingValueFromList :: configId
    const ret60 = f.getCorrespondingValueFromList(f.assemblyList([58n, 59n, 60n], "config_id"), 59n)
    const eq61 = f.equal(ret60, ret60)
    const s62 = f.dataTypeConversion(eq61, 'str')
    f.printString(s62)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getCorrespondingValueFromList")]), 0)
    return {}
  }
})

const comp_getCorrespondingValueFromList_19_entity = g.defineComposite("自动复合-collections-19-getCorrespondingValueFromList-entity", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getCorrespondingValueFromList :: entity
    const ret66 = f.getCorrespondingValueFromList(f.assemblyList([f.getSelfEntity(), f.getSelfEntity(), f.getSelfEntity()], "entity"), 65n)
    const s67 = f.dataTypeConversion(ret66, 'str')
    f.printString(s67)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getCorrespondingValueFromList")]), 0)
    return {}
  }
})

const comp_getCorrespondingValueFromList_20_faction = g.defineComposite("自动复合-collections-20-getCorrespondingValueFromList-faction", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getCorrespondingValueFromList :: faction
    const ret70 = f.getCorrespondingValueFromList(f.assemblyList([68n, 69n, 70n], "faction"), 69n)
    const s71 = f.dataTypeConversion(ret70, 'str')
    f.printString(s71)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getCorrespondingValueFromList")]), 0)
    return {}
  }
})

const comp_insertValueIntoList_21_bool = g.defineComposite("自动复合-collections-21-insertValueIntoList-bool", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // insertValueIntoList :: bool
    f.insertValueIntoList(f.assemblyList([false, true, false], "bool"), 73n, false)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done insertValueIntoList")]), 0)
    return {}
  }
})

const comp_insertValueIntoList_22_configId = g.defineComposite("自动复合-collections-22-insertValueIntoList-configId", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // insertValueIntoList :: configId
    f.insertValueIntoList(f.assemblyList([75n, 76n, 77n], "config_id"), 76n, new configId(77n))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done insertValueIntoList")]), 0)
    return {}
  }
})

const comp_insertValueIntoList_23_entity = g.defineComposite("自动复合-collections-23-insertValueIntoList-entity", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // insertValueIntoList :: entity
    f.insertValueIntoList(f.assemblyList([f.getSelfEntity(), f.getSelfEntity(), f.getSelfEntity()], "entity"), 80n, f.getSelfEntity())
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done insertValueIntoList")]), 0)
    return {}
  }
})

const comp_insertValueIntoList_24_faction = g.defineComposite("自动复合-collections-24-insertValueIntoList-faction", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // insertValueIntoList :: faction
    f.insertValueIntoList(f.assemblyList([82n, 83n, 84n], "faction"), 83n, new faction(84n))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done insertValueIntoList")]), 0)
    return {}
  }
})

const comp_removeValueFromList_25_bool = g.defineComposite("自动复合-collections-25-removeValueFromList-bool", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // removeValueFromList :: bool
    f.removeValueFromList(f.assemblyList([true, false, true], "bool"), 86n)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done removeValueFromList")]), 0)
    return {}
  }
})

const comp_removeValueFromList_26_configId = g.defineComposite("自动复合-collections-26-removeValueFromList-configId", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // removeValueFromList :: configId
    f.removeValueFromList(f.assemblyList([87n, 88n, 89n], "config_id"), 88n)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done removeValueFromList")]), 0)
    return {}
  }
})

const comp_removeValueFromList_27_entity = g.defineComposite("自动复合-collections-27-removeValueFromList-entity", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // removeValueFromList :: entity
    f.removeValueFromList(f.assemblyList([f.getSelfEntity(), f.getSelfEntity(), f.getSelfEntity()], "entity"), 91n)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done removeValueFromList")]), 0)
    return {}
  }
})

const comp_removeValueFromList_28_faction = g.defineComposite("自动复合-collections-28-removeValueFromList-faction", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // removeValueFromList :: faction
    f.removeValueFromList(f.assemblyList([92n, 93n, 94n], "faction"), 93n)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done removeValueFromList")]), 0)
    return {}
  }
})

const comp_modifyValueInList_29_bool = g.defineComposite("自动复合-collections-29-modifyValueInList-bool", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // modifyValueInList :: bool
    f.modifyValueInList(f.assemblyList([false, true, false], "bool"), 95n, false)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done modifyValueInList")]), 0)
    return {}
  }
})

const comp_modifyValueInList_30_configId = g.defineComposite("自动复合-collections-30-modifyValueInList-configId", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // modifyValueInList :: configId
    f.modifyValueInList(f.assemblyList([97n, 98n, 99n], "config_id"), 98n, new configId(99n))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done modifyValueInList")]), 0)
    return {}
  }
})

const comp_modifyValueInList_31_entity = g.defineComposite("自动复合-collections-31-modifyValueInList-entity", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // modifyValueInList :: entity
    f.modifyValueInList(f.assemblyList([f.getSelfEntity(), f.getSelfEntity(), f.getSelfEntity()], "entity"), 102n, f.getSelfEntity())
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done modifyValueInList")]), 0)
    return {}
  }
})

const comp_modifyValueInList_32_faction = g.defineComposite("自动复合-collections-32-modifyValueInList-faction", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // modifyValueInList :: faction
    f.modifyValueInList(f.assemblyList([104n, 105n, 106n], "faction"), 105n, new faction(106n))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done modifyValueInList")]), 0)
    return {}
  }
})

const comp_assemblyDictionary_33_dict_configId_bool_ = g.defineComposite("自动复合-collections-33-assemblyDictionary-dict<configId, bool>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // assemblyDictionary :: dict<configId, bool>
    const ret111 = f.assemblyDictionary([{ k: new configId(107n), v: false }, { k: new configId(109n), v: false }])
    const len112 = f.queryDictionarySLength(ret111)
    const s113 = f.dataTypeConversion(len112, 'str')
    f.printString(s113)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done assemblyDictionary")]), 0)
    return {}
  }
})

const comp_assemblyDictionary_34_dict_configId_configId_ = g.defineComposite("自动复合-collections-34-assemblyDictionary-dict<configId, configId>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // assemblyDictionary :: dict<configId, configId>
    const ret118 = f.assemblyDictionary([{ k: new configId(114n), v: new configId(115n) }, { k: new configId(116n), v: new configId(117n) }])
    const len119 = f.queryDictionarySLength(ret118)
    const s120 = f.dataTypeConversion(len119, 'str')
    f.printString(s120)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done assemblyDictionary")]), 0)
    return {}
  }
})

const comp_assemblyDictionary_35_dict_configId_entity_ = g.defineComposite("自动复合-collections-35-assemblyDictionary-dict<configId, entity>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // assemblyDictionary :: dict<configId, entity>
    const ret125 = f.assemblyDictionary([{ k: new configId(121n), v: f.getSelfEntity() }, { k: new configId(123n), v: f.getSelfEntity() }])
    const len126 = f.queryDictionarySLength(ret125)
    const s127 = f.dataTypeConversion(len126, 'str')
    f.printString(s127)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done assemblyDictionary")]), 0)
    return {}
  }
})

const comp_assemblyDictionary_36_dict_configId_faction_ = g.defineComposite("自动复合-collections-36-assemblyDictionary-dict<configId, faction>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // assemblyDictionary :: dict<configId, faction>
    const ret132 = f.assemblyDictionary([{ k: new configId(128n), v: new faction(129n) }, { k: new configId(130n), v: new faction(131n) }])
    const len133 = f.queryDictionarySLength(ret132)
    const s134 = f.dataTypeConversion(len133, 'str')
    f.printString(s134)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done assemblyDictionary")]), 0)
    return {}
  }
})

const comp_setOrAddKeyValuePairsToDictionary_37_dict_configId_bool_ = g.defineComposite("自动复合-collections-37-setOrAddKeyValuePairsToDictionary-dict<configId, bool>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // setOrAddKeyValuePairsToDictionary :: dict<configId, bool>
    f.setOrAddKeyValuePairsToDictionary(f.assemblyDictionary([{ k: new configId(136n), v: true }, { k: new configId(138n), v: true }]), new configId(140n), true)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done setOrAddKeyValuePairsToDictionary")]), 0)
    return {}
  }
})

const comp_setOrAddKeyValuePairsToDictionary_38_dict_configId_configId_ = g.defineComposite("自动复合-collections-38-setOrAddKeyValuePairsToDictionary-dict<configId, configId>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // setOrAddKeyValuePairsToDictionary :: dict<configId, configId>
    f.setOrAddKeyValuePairsToDictionary(f.assemblyDictionary([{ k: new configId(143n), v: new configId(144n) }, { k: new configId(145n), v: new configId(146n) }]), new configId(147n), new configId(148n))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done setOrAddKeyValuePairsToDictionary")]), 0)
    return {}
  }
})

const comp_setOrAddKeyValuePairsToDictionary_39_dict_configId_entity_ = g.defineComposite("自动复合-collections-39-setOrAddKeyValuePairsToDictionary-dict<configId, entity>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // setOrAddKeyValuePairsToDictionary :: dict<configId, entity>
    f.setOrAddKeyValuePairsToDictionary(f.assemblyDictionary([{ k: new configId(150n), v: f.getSelfEntity() }, { k: new configId(152n), v: f.getSelfEntity() }]), new configId(154n), f.getSelfEntity())
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done setOrAddKeyValuePairsToDictionary")]), 0)
    return {}
  }
})

const comp_setOrAddKeyValuePairsToDictionary_40_dict_configId_faction_ = g.defineComposite("自动复合-collections-40-setOrAddKeyValuePairsToDictionary-dict<configId, faction>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // setOrAddKeyValuePairsToDictionary :: dict<configId, faction>
    f.setOrAddKeyValuePairsToDictionary(f.assemblyDictionary([{ k: new configId(157n), v: new faction(158n) }, { k: new configId(159n), v: new faction(160n) }]), new configId(161n), new faction(162n))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done setOrAddKeyValuePairsToDictionary")]), 0)
    return {}
  }
})

const comp_queryDictionaryValueByKey_41_dict_configId_bool_ = g.defineComposite("自动复合-collections-41-queryDictionaryValueByKey-dict<configId, bool>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // queryDictionaryValueByKey :: dict<configId, bool>
    const ret169 = f.queryDictionaryValueByKey(f.assemblyDictionary([{ k: new configId(164n), v: true }, { k: new configId(166n), v: true }]), new configId(168n))
    const s170 = f.dataTypeConversion(ret169, 'str')
    f.printString(s170)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryDictionaryValueByKey")]), 0)
    return {}
  }
})

const comp_queryDictionaryValueByKey_42_dict_configId_configId_ = g.defineComposite("自动复合-collections-42-queryDictionaryValueByKey-dict<configId, configId>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // queryDictionaryValueByKey :: dict<configId, configId>
    const ret177 = f.queryDictionaryValueByKey(f.assemblyDictionary([{ k: new configId(172n), v: new configId(173n) }, { k: new configId(174n), v: new configId(175n) }]), new configId(176n))
    const eq178 = f.equal(ret177, ret177)
    const s179 = f.dataTypeConversion(eq178, 'str')
    f.printString(s179)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryDictionaryValueByKey")]), 0)
    return {}
  }
})

const comp_queryDictionaryValueByKey_43_dict_configId_entity_ = g.defineComposite("自动复合-collections-43-queryDictionaryValueByKey-dict<configId, entity>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // queryDictionaryValueByKey :: dict<configId, entity>
    const ret186 = f.queryDictionaryValueByKey(f.assemblyDictionary([{ k: new configId(181n), v: f.getSelfEntity() }, { k: new configId(183n), v: f.getSelfEntity() }]), new configId(185n))
    const s187 = f.dataTypeConversion(ret186, 'str')
    f.printString(s187)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryDictionaryValueByKey")]), 0)
    return {}
  }
})

const comp_queryDictionaryValueByKey_44_dict_configId_faction_ = g.defineComposite("自动复合-collections-44-queryDictionaryValueByKey-dict<configId, faction>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // queryDictionaryValueByKey :: dict<configId, faction>
    const ret194 = f.queryDictionaryValueByKey(f.assemblyDictionary([{ k: new configId(189n), v: new faction(190n) }, { k: new configId(191n), v: new faction(192n) }]), new configId(193n))
    const s195 = f.dataTypeConversion(ret194, 'str')
    f.printString(s195)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryDictionaryValueByKey")]), 0)
    return {}
  }
})

const comp_removeKeyValuePairsFromDictionaryByKey_45_dict_configId_bool_ = g.defineComposite("自动复合-collections-45-removeKeyValuePairsFromDictionaryByKey-dict<configId, bool>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // removeKeyValuePairsFromDictionaryByKey :: dict<configId, bool>
    f.removeKeyValuePairsFromDictionaryByKey(f.assemblyDictionary([{ k: new configId(197n), v: false }, { k: new configId(199n), v: false }]), new configId(201n))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done removeKeyValuePairsFromDictionaryByKey")]), 0)
    return {}
  }
})

const comp_removeKeyValuePairsFromDictionaryByKey_46_dict_configId_configId_ = g.defineComposite("自动复合-collections-46-removeKeyValuePairsFromDictionaryByKey-dict<configId, configId>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // removeKeyValuePairsFromDictionaryByKey :: dict<configId, configId>
    f.removeKeyValuePairsFromDictionaryByKey(f.assemblyDictionary([{ k: new configId(203n), v: new configId(204n) }, { k: new configId(205n), v: new configId(206n) }]), new configId(207n))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done removeKeyValuePairsFromDictionaryByKey")]), 0)
    return {}
  }
})

const comp_removeKeyValuePairsFromDictionaryByKey_47_dict_configId_entity_ = g.defineComposite("自动复合-collections-47-removeKeyValuePairsFromDictionaryByKey-dict<configId, entity>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // removeKeyValuePairsFromDictionaryByKey :: dict<configId, entity>
    f.removeKeyValuePairsFromDictionaryByKey(f.assemblyDictionary([{ k: new configId(209n), v: f.getSelfEntity() }, { k: new configId(211n), v: f.getSelfEntity() }]), new configId(213n))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done removeKeyValuePairsFromDictionaryByKey")]), 0)
    return {}
  }
})

const comp_removeKeyValuePairsFromDictionaryByKey_48_dict_configId_faction_ = g.defineComposite("自动复合-collections-48-removeKeyValuePairsFromDictionaryByKey-dict<configId, faction>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // removeKeyValuePairsFromDictionaryByKey :: dict<configId, faction>
    f.removeKeyValuePairsFromDictionaryByKey(f.assemblyDictionary([{ k: new configId(215n), v: new faction(216n) }, { k: new configId(217n), v: new faction(218n) }]), new configId(219n))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done removeKeyValuePairsFromDictionaryByKey")]), 0)
    return {}
  }
})

const comp_queryIfDictionaryContainsSpecificKey_49_dict_configId_bool_ = g.defineComposite("自动复合-collections-49-queryIfDictionaryContainsSpecificKey-dict<configId, bool>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // queryIfDictionaryContainsSpecificKey :: dict<configId, bool>
    const ret226 = f.queryIfDictionaryContainsSpecificKey(f.assemblyDictionary([{ k: new configId(221n), v: false }, { k: new configId(223n), v: false }]), new configId(225n))
    const s227 = f.dataTypeConversion(ret226, 'str')
    f.printString(s227)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryIfDictionaryContainsSpecificKey")]), 0)
    return {}
  }
})

const comp_queryIfDictionaryContainsSpecificKey_50_dict_configId_configId_ = g.defineComposite("自动复合-collections-50-queryIfDictionaryContainsSpecificKey-dict<configId, configId>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // queryIfDictionaryContainsSpecificKey :: dict<configId, configId>
    const ret234 = f.queryIfDictionaryContainsSpecificKey(f.assemblyDictionary([{ k: new configId(229n), v: new configId(230n) }, { k: new configId(231n), v: new configId(232n) }]), new configId(233n))
    const s235 = f.dataTypeConversion(ret234, 'str')
    f.printString(s235)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryIfDictionaryContainsSpecificKey")]), 0)
    return {}
  }
})

const comp_queryIfDictionaryContainsSpecificKey_51_dict_configId_entity_ = g.defineComposite("自动复合-collections-51-queryIfDictionaryContainsSpecificKey-dict<configId, entity>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // queryIfDictionaryContainsSpecificKey :: dict<configId, entity>
    const ret242 = f.queryIfDictionaryContainsSpecificKey(f.assemblyDictionary([{ k: new configId(237n), v: f.getSelfEntity() }, { k: new configId(239n), v: f.getSelfEntity() }]), new configId(241n))
    const s243 = f.dataTypeConversion(ret242, 'str')
    f.printString(s243)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryIfDictionaryContainsSpecificKey")]), 0)
    return {}
  }
})

const comp_queryIfDictionaryContainsSpecificKey_52_dict_configId_faction_ = g.defineComposite("自动复合-collections-52-queryIfDictionaryContainsSpecificKey-dict<configId, faction>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // queryIfDictionaryContainsSpecificKey :: dict<configId, faction>
    const ret250 = f.queryIfDictionaryContainsSpecificKey(f.assemblyDictionary([{ k: new configId(245n), v: new faction(246n) }, { k: new configId(247n), v: new faction(248n) }]), new configId(249n))
    const s251 = f.dataTypeConversion(ret250, 'str')
    f.printString(s251)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryIfDictionaryContainsSpecificKey")]), 0)
    return {}
  }
})

const comp_getListOfKeysFromDictionary_53_dict_configId_bool_ = g.defineComposite("自动复合-collections-53-getListOfKeysFromDictionary-dict<configId, bool>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getListOfKeysFromDictionary :: dict<configId, bool>
    const ret257 = f.getListOfKeysFromDictionary(f.assemblyDictionary([{ k: new configId(253n), v: false }, { k: new configId(255n), v: false }]))
    const len258 = f.getListLength(ret257)
    const s259 = f.dataTypeConversion(len258, 'str')
    f.printString(s259)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListOfKeysFromDictionary")]), 0)
    return {}
  }
})

const comp_getListOfKeysFromDictionary_54_dict_configId_configId_ = g.defineComposite("自动复合-collections-54-getListOfKeysFromDictionary-dict<configId, configId>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getListOfKeysFromDictionary :: dict<configId, configId>
    const ret265 = f.getListOfKeysFromDictionary(f.assemblyDictionary([{ k: new configId(261n), v: new configId(262n) }, { k: new configId(263n), v: new configId(264n) }]))
    const len266 = f.getListLength(ret265)
    const s267 = f.dataTypeConversion(len266, 'str')
    f.printString(s267)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListOfKeysFromDictionary")]), 0)
    return {}
  }
})

const comp_getListOfKeysFromDictionary_55_dict_configId_entity_ = g.defineComposite("自动复合-collections-55-getListOfKeysFromDictionary-dict<configId, entity>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getListOfKeysFromDictionary :: dict<configId, entity>
    const ret273 = f.getListOfKeysFromDictionary(f.assemblyDictionary([{ k: new configId(269n), v: f.getSelfEntity() }, { k: new configId(271n), v: f.getSelfEntity() }]))
    const len274 = f.getListLength(ret273)
    const s275 = f.dataTypeConversion(len274, 'str')
    f.printString(s275)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListOfKeysFromDictionary")]), 0)
    return {}
  }
})

const comp_getListOfKeysFromDictionary_56_dict_configId_faction_ = g.defineComposite("自动复合-collections-56-getListOfKeysFromDictionary-dict<configId, faction>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getListOfKeysFromDictionary :: dict<configId, faction>
    const ret281 = f.getListOfKeysFromDictionary(f.assemblyDictionary([{ k: new configId(277n), v: new faction(278n) }, { k: new configId(279n), v: new faction(280n) }]))
    const len282 = f.getListLength(ret281)
    const s283 = f.dataTypeConversion(len282, 'str')
    f.printString(s283)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListOfKeysFromDictionary")]), 0)
    return {}
  }
})

const comp_queryDictionarySLength_57 = g.defineComposite("自动复合-collections-57-queryDictionarySLength", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const ret289 = f.queryDictionarySLength(f.assemblyDictionary([{ k: 285, v: 286 }, { k: 287, v: 288 }]))
    const s290 = f.dataTypeConversion(ret289, 'str')
    f.printString(s290)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryDictionarySLength")]), 0)
    return {}
  }
})

const comp_clearDictionary_58_dict_configId_bool_ = g.defineComposite("自动复合-collections-58-clearDictionary-dict<configId, bool>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // clearDictionary :: dict<configId, bool>
    f.clearDictionary(f.assemblyDictionary([{ k: new configId(292n), v: true }, { k: new configId(294n), v: true }]))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done clearDictionary")]), 0)
    return {}
  }
})

const comp_clearDictionary_59_dict_configId_configId_ = g.defineComposite("自动复合-collections-59-clearDictionary-dict<configId, configId>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // clearDictionary :: dict<configId, configId>
    f.clearDictionary(f.assemblyDictionary([{ k: new configId(297n), v: new configId(298n) }, { k: new configId(299n), v: new configId(300n) }]))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done clearDictionary")]), 0)
    return {}
  }
})

const comp_clearDictionary_60_dict_configId_entity_ = g.defineComposite("自动复合-collections-60-clearDictionary-dict<configId, entity>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // clearDictionary :: dict<configId, entity>
    f.clearDictionary(f.assemblyDictionary([{ k: new configId(302n), v: f.getSelfEntity() }, { k: new configId(304n), v: f.getSelfEntity() }]))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done clearDictionary")]), 0)
    return {}
  }
})

const comp_clearDictionary_61_dict_configId_faction_ = g.defineComposite("自动复合-collections-61-clearDictionary-dict<configId, faction>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // clearDictionary :: dict<configId, faction>
    f.clearDictionary(f.assemblyDictionary([{ k: new configId(307n), v: new faction(308n) }, { k: new configId(309n), v: new faction(310n) }]))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done clearDictionary")]), 0)
    return {}
  }
})

const comp_createDictionary_62_dict_configId_bool_ = g.defineComposite("自动复合-collections-62-createDictionary-dict<configId, bool>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // createDictionary :: dict<configId, bool>
    const ret313 = f.createDictionary(f.assemblyList([311n, 312n, 313n], "config_id"), f.assemblyList([false, true, false], "bool"))
    const len314 = f.queryDictionarySLength(ret313)
    const s315 = f.dataTypeConversion(len314, 'str')
    f.printString(s315)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done createDictionary")]), 0)
    return {}
  }
})

const comp_createDictionary_63_dict_configId_configId_ = g.defineComposite("自动复合-collections-63-createDictionary-dict<configId, configId>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // createDictionary :: dict<configId, configId>
    const ret318 = f.createDictionary(f.assemblyList([316n, 317n, 318n], "config_id"), f.assemblyList([317n, 318n, 319n], "config_id"))
    const len319 = f.queryDictionarySLength(ret318)
    const s320 = f.dataTypeConversion(len319, 'str')
    f.printString(s320)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done createDictionary")]), 0)
    return {}
  }
})

const comp_createDictionary_64_dict_configId_entity_ = g.defineComposite("自动复合-collections-64-createDictionary-dict<configId, entity>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // createDictionary :: dict<configId, entity>
    const ret324 = f.createDictionary(f.assemblyList([321n, 322n, 323n], "config_id"), f.assemblyList([f.getSelfEntity(), f.getSelfEntity(), f.getSelfEntity()], "entity"))
    const len325 = f.queryDictionarySLength(ret324)
    const s326 = f.dataTypeConversion(len325, 'str')
    f.printString(s326)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done createDictionary")]), 0)
    return {}
  }
})

const comp_createDictionary_65_dict_configId_faction_ = g.defineComposite("自动复合-collections-65-createDictionary-dict<configId, faction>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // createDictionary :: dict<configId, faction>
    const ret329 = f.createDictionary(f.assemblyList([327n, 328n, 329n], "config_id"), f.assemblyList([328n, 329n, 330n], "faction"))
    const len330 = f.queryDictionarySLength(ret329)
    const s331 = f.dataTypeConversion(len330, 'str')
    f.printString(s331)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done createDictionary")]), 0)
    return {}
  }
})

const comp_queryIfDictionaryContainsSpecificValue_66_dict_configId_bool_ = g.defineComposite("自动复合-collections-66-queryIfDictionaryContainsSpecificValue-dict<configId, bool>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // queryIfDictionaryContainsSpecificValue :: dict<configId, bool>
    const ret338 = f.queryIfDictionaryContainsSpecificValue(f.assemblyDictionary([{ k: new configId(333n), v: false }, { k: new configId(335n), v: false }]), true)
    const s339 = f.dataTypeConversion(ret338, 'str')
    f.printString(s339)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryIfDictionaryContainsSpecificValue")]), 0)
    return {}
  }
})

const comp_queryIfDictionaryContainsSpecificValue_67_dict_configId_configId_ = g.defineComposite("自动复合-collections-67-queryIfDictionaryContainsSpecificValue-dict<configId, configId>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // queryIfDictionaryContainsSpecificValue :: dict<configId, configId>
    const ret346 = f.queryIfDictionaryContainsSpecificValue(f.assemblyDictionary([{ k: new configId(341n), v: new configId(342n) }, { k: new configId(343n), v: new configId(344n) }]), new configId(345n))
    const s347 = f.dataTypeConversion(ret346, 'str')
    f.printString(s347)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryIfDictionaryContainsSpecificValue")]), 0)
    return {}
  }
})

const comp_queryIfDictionaryContainsSpecificValue_68_dict_configId_entity_ = g.defineComposite("自动复合-collections-68-queryIfDictionaryContainsSpecificValue-dict<configId, entity>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // queryIfDictionaryContainsSpecificValue :: dict<configId, entity>
    const ret354 = f.queryIfDictionaryContainsSpecificValue(f.assemblyDictionary([{ k: new configId(349n), v: f.getSelfEntity() }, { k: new configId(351n), v: f.getSelfEntity() }]), f.getSelfEntity())
    const s355 = f.dataTypeConversion(ret354, 'str')
    f.printString(s355)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryIfDictionaryContainsSpecificValue")]), 0)
    return {}
  }
})

const comp_queryIfDictionaryContainsSpecificValue_69_dict_configId_faction_ = g.defineComposite("自动复合-collections-69-queryIfDictionaryContainsSpecificValue-dict<configId, faction>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // queryIfDictionaryContainsSpecificValue :: dict<configId, faction>
    const ret362 = f.queryIfDictionaryContainsSpecificValue(f.assemblyDictionary([{ k: new configId(357n), v: new faction(358n) }, { k: new configId(359n), v: new faction(360n) }]), new faction(361n))
    const s363 = f.dataTypeConversion(ret362, 'str')
    f.printString(s363)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryIfDictionaryContainsSpecificValue")]), 0)
    return {}
  }
})

const comp_getListOfValuesFromDictionary_70_dict_configId_bool_ = g.defineComposite("自动复合-collections-70-getListOfValuesFromDictionary-dict<configId, bool>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getListOfValuesFromDictionary :: dict<configId, bool>
    const ret369 = f.getListOfValuesFromDictionary(f.assemblyDictionary([{ k: new configId(365n), v: false }, { k: new configId(367n), v: false }]))
    const len370 = f.getListLength(ret369)
    const s371 = f.dataTypeConversion(len370, 'str')
    f.printString(s371)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListOfValuesFromDictionary")]), 0)
    return {}
  }
})

const comp_getListOfValuesFromDictionary_71_dict_configId_configId_ = g.defineComposite("自动复合-collections-71-getListOfValuesFromDictionary-dict<configId, configId>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getListOfValuesFromDictionary :: dict<configId, configId>
    const ret377 = f.getListOfValuesFromDictionary(f.assemblyDictionary([{ k: new configId(373n), v: new configId(374n) }, { k: new configId(375n), v: new configId(376n) }]))
    const len378 = f.getListLength(ret377)
    const s379 = f.dataTypeConversion(len378, 'str')
    f.printString(s379)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListOfValuesFromDictionary")]), 0)
    return {}
  }
})

const comp_getListOfValuesFromDictionary_72_dict_configId_entity_ = g.defineComposite("自动复合-collections-72-getListOfValuesFromDictionary-dict<configId, entity>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getListOfValuesFromDictionary :: dict<configId, entity>
    const ret385 = f.getListOfValuesFromDictionary(f.assemblyDictionary([{ k: new configId(381n), v: f.getSelfEntity() }, { k: new configId(383n), v: f.getSelfEntity() }]))
    const len386 = f.getListLength(ret385)
    const s387 = f.dataTypeConversion(len386, 'str')
    f.printString(s387)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListOfValuesFromDictionary")]), 0)
    return {}
  }
})

const comp_getListOfValuesFromDictionary_73_dict_configId_faction_ = g.defineComposite("自动复合-collections-73-getListOfValuesFromDictionary-dict<configId, faction>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getListOfValuesFromDictionary :: dict<configId, faction>
    const ret393 = f.getListOfValuesFromDictionary(f.assemblyDictionary([{ k: new configId(389n), v: new faction(390n) }, { k: new configId(391n), v: new faction(392n) }]))
    const len394 = f.getListLength(ret393)
    const s395 = f.dataTypeConversion(len394, 'str')
    f.printString(s395)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListOfValuesFromDictionary")]), 0)
    return {}
  }
})

const comp_sortDictionaryByKey_74_dict_int_bool_ = g.defineComposite("自动复合-collections-74-sortDictionaryByKey-dict<int, bool>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // sortDictionaryByKey :: dict<int, bool>
    const ret401 = f.sortDictionaryByKey(f.assemblyDictionary([{ k: 397n, v: false }, { k: 399n, v: false }]), E.SortBy.Ascending)
    const len402 = f.getListLength(ret401.keyList)
    const s403 = f.dataTypeConversion(len402, 'str')
    f.printString(s403)
    const len404 = f.getListLength(ret401.valueList)
    const s405 = f.dataTypeConversion(len404, 'str')
    f.printString(s405)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done sortDictionaryByKey")]), 0)
    return {}
  }
})

const comp_sortDictionaryByKey_75_dict_int_configId_ = g.defineComposite("自动复合-collections-75-sortDictionaryByKey-dict<int, configId>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // sortDictionaryByKey :: dict<int, configId>
    const ret411 = f.sortDictionaryByKey(f.assemblyDictionary([{ k: 407n, v: new configId(408n) }, { k: 409n, v: new configId(410n) }]), E.SortBy.Ascending)
    const len412 = f.getListLength(ret411.keyList)
    const s413 = f.dataTypeConversion(len412, 'str')
    f.printString(s413)
    const len414 = f.getListLength(ret411.valueList)
    const s415 = f.dataTypeConversion(len414, 'str')
    f.printString(s415)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done sortDictionaryByKey")]), 0)
    return {}
  }
})

const comp_sortDictionaryByKey_76_dict_int_entity_ = g.defineComposite("自动复合-collections-76-sortDictionaryByKey-dict<int, entity>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // sortDictionaryByKey :: dict<int, entity>
    const ret421 = f.sortDictionaryByKey(f.assemblyDictionary([{ k: 417n, v: f.getSelfEntity() }, { k: 419n, v: f.getSelfEntity() }]), E.SortBy.Ascending)
    const len422 = f.getListLength(ret421.keyList)
    const s423 = f.dataTypeConversion(len422, 'str')
    f.printString(s423)
    const len424 = f.getListLength(ret421.valueList)
    const s425 = f.dataTypeConversion(len424, 'str')
    f.printString(s425)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done sortDictionaryByKey")]), 0)
    return {}
  }
})

const comp_sortDictionaryByKey_77_dict_int_faction_ = g.defineComposite("自动复合-collections-77-sortDictionaryByKey-dict<int, faction>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // sortDictionaryByKey :: dict<int, faction>
    const ret431 = f.sortDictionaryByKey(f.assemblyDictionary([{ k: 427n, v: new faction(428n) }, { k: 429n, v: new faction(430n) }]), E.SortBy.Ascending)
    const len432 = f.getListLength(ret431.keyList)
    const s433 = f.dataTypeConversion(len432, 'str')
    f.printString(s433)
    const len434 = f.getListLength(ret431.valueList)
    const s435 = f.dataTypeConversion(len434, 'str')
    f.printString(s435)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done sortDictionaryByKey")]), 0)
    return {}
  }
})

const comp_sortDictionaryByValue_78_dict_configId_float_ = g.defineComposite("自动复合-collections-78-sortDictionaryByValue-dict<configId, float>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // sortDictionaryByValue :: dict<configId, float>
    const ret441 = f.sortDictionaryByValue(f.assemblyDictionary([{ k: new configId(437n), v: 438.25 }, { k: new configId(439n), v: 440.25 }]), E.SortBy.Ascending)
    const len442 = f.getListLength(ret441.keyList)
    const s443 = f.dataTypeConversion(len442, 'str')
    f.printString(s443)
    const len444 = f.getListLength(ret441.valueList)
    const s445 = f.dataTypeConversion(len444, 'str')
    f.printString(s445)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done sortDictionaryByValue")]), 0)
    return {}
  }
})

const comp_sortDictionaryByValue_79_dict_configId_int_ = g.defineComposite("自动复合-collections-79-sortDictionaryByValue-dict<configId, int>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // sortDictionaryByValue :: dict<configId, int>
    const ret451 = f.sortDictionaryByValue(f.assemblyDictionary([{ k: new configId(447n), v: 448n }, { k: new configId(449n), v: 450n }]), E.SortBy.Ascending)
    const len452 = f.getListLength(ret451.keyList)
    const s453 = f.dataTypeConversion(len452, 'str')
    f.printString(s453)
    const len454 = f.getListLength(ret451.valueList)
    const s455 = f.dataTypeConversion(len454, 'str')
    f.printString(s455)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done sortDictionaryByValue")]), 0)
    return {}
  }
})

const comp_sortDictionaryByValue_80_dict_entity_float_ = g.defineComposite("自动复合-collections-80-sortDictionaryByValue-dict<entity, float>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // sortDictionaryByValue :: dict<entity, float>
    const ret461 = f.sortDictionaryByValue(f.assemblyDictionary([{ k: f.getSelfEntity(), v: 458.25 }, { k: f.getSelfEntity(), v: 460.25 }]), E.SortBy.Ascending)
    const len462 = f.getListLength(ret461.keyList)
    const s463 = f.dataTypeConversion(len462, 'str')
    f.printString(s463)
    const len464 = f.getListLength(ret461.valueList)
    const s465 = f.dataTypeConversion(len464, 'str')
    f.printString(s465)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done sortDictionaryByValue")]), 0)
    return {}
  }
})

const comp_sortDictionaryByValue_81_dict_entity_int_ = g.defineComposite("自动复合-collections-81-sortDictionaryByValue-dict<entity, int>", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // sortDictionaryByValue :: dict<entity, int>
    const ret471 = f.sortDictionaryByValue(f.assemblyDictionary([{ k: f.getSelfEntity(), v: 468n }, { k: f.getSelfEntity(), v: 470n }]), E.SortBy.Ascending)
    const len472 = f.getListLength(ret471.keyList)
    const s473 = f.dataTypeConversion(len472, 'str')
    f.printString(s473)
    const len474 = f.getListLength(ret471.valueList)
    const s475 = f.dataTypeConversion(len474, 'str')
    f.printString(s475)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done sortDictionaryByValue")]), 0)
    return {}
  }
})

const comp_getLocalVariable_82_bool = g.defineComposite("自动复合-collections-82-getLocalVariable-bool", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getLocalVariable :: bool
    const ret477 = f.getLocalVariable(false)
    f.setLocalVariable(ret477.localVariable, ret477.value)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getLocalVariable")]), 0)
    return {}
  }
})

const comp_getLocalVariable_83_configId = g.defineComposite("自动复合-collections-83-getLocalVariable-configId", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getLocalVariable :: configId
    const ret479 = f.getLocalVariable(new configId(478n))
    f.setLocalVariable(ret479.localVariable, ret479.value)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getLocalVariable")]), 0)
    return {}
  }
})

const comp_getLocalVariable_84_entity = g.defineComposite("自动复合-collections-84-getLocalVariable-entity", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getLocalVariable :: entity
    const ret481 = f.getLocalVariable(f.getSelfEntity())
    f.setLocalVariable(ret481.localVariable, ret481.value)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getLocalVariable")]), 0)
    return {}
  }
})

const comp_getLocalVariable_85_faction = g.defineComposite("自动复合-collections-85-getLocalVariable-faction", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // getLocalVariable :: faction
    const ret483 = f.getLocalVariable(new faction(482n))
    f.setLocalVariable(ret483.localVariable, ret483.value)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getLocalVariable")]), 0)
    return {}
  }
})

const comp_setLocalVariable_86_bool = g.defineComposite("自动复合-collections-86-setLocalVariable-bool", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // setLocalVariable :: bool
    f.setLocalVariable(f.getLocalVariable(1n).localVariable, false)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done setLocalVariable")]), 0)
    return {}
  }
})

const comp_setLocalVariable_87_configId = g.defineComposite("自动复合-collections-87-setLocalVariable-configId", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // setLocalVariable :: configId
    f.setLocalVariable(f.getLocalVariable(1n).localVariable, new configId(485n))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done setLocalVariable")]), 0)
    return {}
  }
})

const comp_setLocalVariable_88_entity = g.defineComposite("自动复合-collections-88-setLocalVariable-entity", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // setLocalVariable :: entity
    f.setLocalVariable(f.getLocalVariable(1n).localVariable, f.getSelfEntity())
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done setLocalVariable")]), 0)
    return {}
  }
})

const comp_setLocalVariable_89_faction = g.defineComposite("自动复合-collections-89-setLocalVariable-faction", {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    // setLocalVariable :: faction
    f.setLocalVariable(f.getLocalVariable(1n).localVariable, new faction(487n))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done setLocalVariable")]), 0)
    return {}
  }
})

const graph = g.server({
  mode: 'beyond',
  type: 'entity',
  name: "V2-全类型自动复合-collections-literal-step1",
  id: 1073741926
})

graph.on('whenEntityIsCreated', (_e, f) => {
  f.callComposite(comp_concatenateList_1_bool, {})
  f.callComposite(comp_concatenateList_2_configId, {})
  f.callComposite(comp_concatenateList_3_entity, {})
  f.callComposite(comp_concatenateList_4_faction, {})
  f.callComposite(comp_clearList_5_bool, {})
  f.callComposite(comp_clearList_6_configId, {})
  f.callComposite(comp_clearList_7_entity, {})
  f.callComposite(comp_clearList_8_faction, {})
  f.callComposite(comp_listIncludesThisValue_9_bool, {})
  f.callComposite(comp_listIncludesThisValue_10_configId, {})
  f.callComposite(comp_listIncludesThisValue_11_entity, {})
  f.callComposite(comp_listIncludesThisValue_12_faction, {})
  f.callComposite(comp_searchListAndReturnValueId_13_bool, {})
  f.callComposite(comp_searchListAndReturnValueId_14_configId, {})
  f.callComposite(comp_searchListAndReturnValueId_15_entity, {})
  f.callComposite(comp_searchListAndReturnValueId_16_faction, {})
  f.callComposite(comp_getCorrespondingValueFromList_17_bool, {})
  f.callComposite(comp_getCorrespondingValueFromList_18_configId, {})
  f.callComposite(comp_getCorrespondingValueFromList_19_entity, {})
  f.callComposite(comp_getCorrespondingValueFromList_20_faction, {})
  f.callComposite(comp_insertValueIntoList_21_bool, {})
  f.callComposite(comp_insertValueIntoList_22_configId, {})
  f.callComposite(comp_insertValueIntoList_23_entity, {})
  f.callComposite(comp_insertValueIntoList_24_faction, {})
  f.callComposite(comp_removeValueFromList_25_bool, {})
  f.callComposite(comp_removeValueFromList_26_configId, {})
  f.callComposite(comp_removeValueFromList_27_entity, {})
  f.callComposite(comp_removeValueFromList_28_faction, {})
  f.callComposite(comp_modifyValueInList_29_bool, {})
  f.callComposite(comp_modifyValueInList_30_configId, {})
  f.callComposite(comp_modifyValueInList_31_entity, {})
  f.callComposite(comp_modifyValueInList_32_faction, {})
  f.callComposite(comp_assemblyDictionary_33_dict_configId_bool_, {})
  f.callComposite(comp_assemblyDictionary_34_dict_configId_configId_, {})
  f.callComposite(comp_assemblyDictionary_35_dict_configId_entity_, {})
  f.callComposite(comp_assemblyDictionary_36_dict_configId_faction_, {})
  f.callComposite(comp_setOrAddKeyValuePairsToDictionary_37_dict_configId_bool_, {})
  f.callComposite(comp_setOrAddKeyValuePairsToDictionary_38_dict_configId_configId_, {})
  f.callComposite(comp_setOrAddKeyValuePairsToDictionary_39_dict_configId_entity_, {})
  f.callComposite(comp_setOrAddKeyValuePairsToDictionary_40_dict_configId_faction_, {})
  f.callComposite(comp_queryDictionaryValueByKey_41_dict_configId_bool_, {})
  f.callComposite(comp_queryDictionaryValueByKey_42_dict_configId_configId_, {})
  f.callComposite(comp_queryDictionaryValueByKey_43_dict_configId_entity_, {})
  f.callComposite(comp_queryDictionaryValueByKey_44_dict_configId_faction_, {})
  f.callComposite(comp_removeKeyValuePairsFromDictionaryByKey_45_dict_configId_bool_, {})
  f.callComposite(comp_removeKeyValuePairsFromDictionaryByKey_46_dict_configId_configId_, {})
  f.callComposite(comp_removeKeyValuePairsFromDictionaryByKey_47_dict_configId_entity_, {})
  f.callComposite(comp_removeKeyValuePairsFromDictionaryByKey_48_dict_configId_faction_, {})
  f.callComposite(comp_queryIfDictionaryContainsSpecificKey_49_dict_configId_bool_, {})
  f.callComposite(comp_queryIfDictionaryContainsSpecificKey_50_dict_configId_configId_, {})
  f.callComposite(comp_queryIfDictionaryContainsSpecificKey_51_dict_configId_entity_, {})
  f.callComposite(comp_queryIfDictionaryContainsSpecificKey_52_dict_configId_faction_, {})
  f.callComposite(comp_getListOfKeysFromDictionary_53_dict_configId_bool_, {})
  f.callComposite(comp_getListOfKeysFromDictionary_54_dict_configId_configId_, {})
  f.callComposite(comp_getListOfKeysFromDictionary_55_dict_configId_entity_, {})
  f.callComposite(comp_getListOfKeysFromDictionary_56_dict_configId_faction_, {})
  f.callComposite(comp_queryDictionarySLength_57, {})
  f.callComposite(comp_clearDictionary_58_dict_configId_bool_, {})
  f.callComposite(comp_clearDictionary_59_dict_configId_configId_, {})
  f.callComposite(comp_clearDictionary_60_dict_configId_entity_, {})
  f.callComposite(comp_clearDictionary_61_dict_configId_faction_, {})
  f.callComposite(comp_createDictionary_62_dict_configId_bool_, {})
  f.callComposite(comp_createDictionary_63_dict_configId_configId_, {})
  f.callComposite(comp_createDictionary_64_dict_configId_entity_, {})
  f.callComposite(comp_createDictionary_65_dict_configId_faction_, {})
  f.callComposite(comp_queryIfDictionaryContainsSpecificValue_66_dict_configId_bool_, {})
  f.callComposite(comp_queryIfDictionaryContainsSpecificValue_67_dict_configId_configId_, {})
  f.callComposite(comp_queryIfDictionaryContainsSpecificValue_68_dict_configId_entity_, {})
  f.callComposite(comp_queryIfDictionaryContainsSpecificValue_69_dict_configId_faction_, {})
  f.callComposite(comp_getListOfValuesFromDictionary_70_dict_configId_bool_, {})
  f.callComposite(comp_getListOfValuesFromDictionary_71_dict_configId_configId_, {})
  f.callComposite(comp_getListOfValuesFromDictionary_72_dict_configId_entity_, {})
  f.callComposite(comp_getListOfValuesFromDictionary_73_dict_configId_faction_, {})
  f.callComposite(comp_sortDictionaryByKey_74_dict_int_bool_, {})
  f.callComposite(comp_sortDictionaryByKey_75_dict_int_configId_, {})
  f.callComposite(comp_sortDictionaryByKey_76_dict_int_entity_, {})
  f.callComposite(comp_sortDictionaryByKey_77_dict_int_faction_, {})
  f.callComposite(comp_sortDictionaryByValue_78_dict_configId_float_, {})
  f.callComposite(comp_sortDictionaryByValue_79_dict_configId_int_, {})
  f.callComposite(comp_sortDictionaryByValue_80_dict_entity_float_, {})
  f.callComposite(comp_sortDictionaryByValue_81_dict_entity_int_, {})
  f.callComposite(comp_getLocalVariable_82_bool, {})
  f.callComposite(comp_getLocalVariable_83_configId, {})
  f.callComposite(comp_getLocalVariable_84_entity, {})
  f.callComposite(comp_getLocalVariable_85_faction, {})
  f.callComposite(comp_setLocalVariable_86_bool, {})
  f.callComposite(comp_setLocalVariable_87_configId, {})
  f.callComposite(comp_setLocalVariable_88_entity, {})
  f.callComposite(comp_setLocalVariable_89_faction, {})
})
