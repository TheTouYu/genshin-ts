import { g } from 'genshin-ts/runtime/core'
import { configId, faction, guid, prefabId, str as strValue } from 'genshin-ts/runtime/value'
import * as E from 'genshin-ts/definitions/enum'

// AUTO-GENERATED: composite node coverage collections (wire)
// Run: npx tsx scripts/generate-composite-node-gia-tests.ts
//
// Each composite wraps one ordinary f.* API call inside defineComposite().
// This complements tests/generated/* by checking that ordinary node functionality can be captured into composite impl graphs.

const comp_concatenateList_1_bool = g.defineComposite("自动复合-collections-1-concatenateList-bool", {
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
    // concatenateList :: bool
    f.concatenateList(f.assemblyList([vBool, vBool, vBool], "bool"), f.assemblyList([vBool, vBool, vBool], "bool"))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done concatenateList")]), 0)
    return {}
  }
})

const comp_concatenateList_2_configId = g.defineComposite("自动复合-collections-2-concatenateList-configId", {
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
    // concatenateList :: configId
    f.concatenateList(f.assemblyList([vConfig, vConfig, vConfig], "config_id"), f.assemblyList([vConfig, vConfig, vConfig], "config_id"))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done concatenateList")]), 0)
    return {}
  }
})

const comp_concatenateList_3_entity = g.defineComposite("自动复合-collections-3-concatenateList-entity", {
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
    // concatenateList :: entity
    f.concatenateList(f.assemblyList([e, e, e], "entity"), f.assemblyList([e, e, e], "entity"))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done concatenateList")]), 0)
    return {}
  }
})

const comp_concatenateList_4_faction = g.defineComposite("自动复合-collections-4-concatenateList-faction", {
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
    // concatenateList :: faction
    f.concatenateList(f.assemblyList([vFaction, vFaction, vFaction], "faction"), f.assemblyList([vFaction, vFaction, vFaction], "faction"))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done concatenateList")]), 0)
    return {}
  }
})

const comp_clearList_5_bool = g.defineComposite("自动复合-collections-5-clearList-bool", {
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
    // clearList :: bool
    f.clearList(f.assemblyList([vBool, vBool, vBool], "bool"))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done clearList")]), 0)
    return {}
  }
})

const comp_clearList_6_configId = g.defineComposite("自动复合-collections-6-clearList-configId", {
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
    // clearList :: configId
    f.clearList(f.assemblyList([vConfig, vConfig, vConfig], "config_id"))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done clearList")]), 0)
    return {}
  }
})

const comp_clearList_7_entity = g.defineComposite("自动复合-collections-7-clearList-entity", {
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
    // clearList :: entity
    f.clearList(f.assemblyList([e, e, e], "entity"))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done clearList")]), 0)
    return {}
  }
})

const comp_clearList_8_faction = g.defineComposite("自动复合-collections-8-clearList-faction", {
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
    // clearList :: faction
    f.clearList(f.assemblyList([vFaction, vFaction, vFaction], "faction"))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done clearList")]), 0)
    return {}
  }
})

const comp_listIncludesThisValue_9_bool = g.defineComposite("自动复合-collections-9-listIncludesThisValue-bool", {
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
    // listIncludesThisValue :: bool
    const ret1 = f.listIncludesThisValue(f.assemblyList([vBool, vBool, vBool], "bool"), vBool)
    const s2 = f.dataTypeConversion(ret1, 'str')
    f.printString(s2)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done listIncludesThisValue")]), 0)
    return {}
  }
})

const comp_listIncludesThisValue_10_configId = g.defineComposite("自动复合-collections-10-listIncludesThisValue-configId", {
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
    // listIncludesThisValue :: configId
    const ret3 = f.listIncludesThisValue(f.assemblyList([vConfig, vConfig, vConfig], "config_id"), vConfig)
    const s4 = f.dataTypeConversion(ret3, 'str')
    f.printString(s4)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done listIncludesThisValue")]), 0)
    return {}
  }
})

const comp_listIncludesThisValue_11_entity = g.defineComposite("自动复合-collections-11-listIncludesThisValue-entity", {
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
    // listIncludesThisValue :: entity
    const ret5 = f.listIncludesThisValue(f.assemblyList([e, e, e], "entity"), e)
    const s6 = f.dataTypeConversion(ret5, 'str')
    f.printString(s6)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done listIncludesThisValue")]), 0)
    return {}
  }
})

const comp_listIncludesThisValue_12_faction = g.defineComposite("自动复合-collections-12-listIncludesThisValue-faction", {
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
    // listIncludesThisValue :: faction
    const ret7 = f.listIncludesThisValue(f.assemblyList([vFaction, vFaction, vFaction], "faction"), vFaction)
    const s8 = f.dataTypeConversion(ret7, 'str')
    f.printString(s8)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done listIncludesThisValue")]), 0)
    return {}
  }
})

const comp_searchListAndReturnValueId_13_bool = g.defineComposite("自动复合-collections-13-searchListAndReturnValueId-bool", {
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
    // searchListAndReturnValueId :: bool
    const ret9 = f.searchListAndReturnValueId(f.assemblyList([vBool, vBool, vBool], "bool"), vBool)
    const len10 = f.getListLength(ret9)
    const s11 = f.dataTypeConversion(len10, 'str')
    f.printString(s11)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done searchListAndReturnValueId")]), 0)
    return {}
  }
})

const comp_searchListAndReturnValueId_14_configId = g.defineComposite("自动复合-collections-14-searchListAndReturnValueId-configId", {
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
    // searchListAndReturnValueId :: configId
    const ret12 = f.searchListAndReturnValueId(f.assemblyList([vConfig, vConfig, vConfig], "config_id"), vConfig)
    const len13 = f.getListLength(ret12)
    const s14 = f.dataTypeConversion(len13, 'str')
    f.printString(s14)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done searchListAndReturnValueId")]), 0)
    return {}
  }
})

const comp_searchListAndReturnValueId_15_entity = g.defineComposite("自动复合-collections-15-searchListAndReturnValueId-entity", {
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
    // searchListAndReturnValueId :: entity
    const ret15 = f.searchListAndReturnValueId(f.assemblyList([e, e, e], "entity"), e)
    const len16 = f.getListLength(ret15)
    const s17 = f.dataTypeConversion(len16, 'str')
    f.printString(s17)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done searchListAndReturnValueId")]), 0)
    return {}
  }
})

const comp_searchListAndReturnValueId_16_faction = g.defineComposite("自动复合-collections-16-searchListAndReturnValueId-faction", {
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
    // searchListAndReturnValueId :: faction
    const ret18 = f.searchListAndReturnValueId(f.assemblyList([vFaction, vFaction, vFaction], "faction"), vFaction)
    const len19 = f.getListLength(ret18)
    const s20 = f.dataTypeConversion(len19, 'str')
    f.printString(s20)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done searchListAndReturnValueId")]), 0)
    return {}
  }
})

const comp_getCorrespondingValueFromList_17_bool = g.defineComposite("自动复合-collections-17-getCorrespondingValueFromList-bool", {
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
    // getCorrespondingValueFromList :: bool
    const ret21 = f.getCorrespondingValueFromList(f.assemblyList([vBool, vBool, vBool], "bool"), vInt)
    const s22 = f.dataTypeConversion(ret21, 'str')
    f.printString(s22)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getCorrespondingValueFromList")]), 0)
    return {}
  }
})

const comp_getCorrespondingValueFromList_18_configId = g.defineComposite("自动复合-collections-18-getCorrespondingValueFromList-configId", {
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
    // getCorrespondingValueFromList :: configId
    const ret23 = f.getCorrespondingValueFromList(f.assemblyList([vConfig, vConfig, vConfig], "config_id"), vInt)
    const eq24 = f.equal(ret23, ret23)
    const s25 = f.dataTypeConversion(eq24, 'str')
    f.printString(s25)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getCorrespondingValueFromList")]), 0)
    return {}
  }
})

const comp_getCorrespondingValueFromList_19_entity = g.defineComposite("自动复合-collections-19-getCorrespondingValueFromList-entity", {
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
    // getCorrespondingValueFromList :: entity
    const ret26 = f.getCorrespondingValueFromList(f.assemblyList([e, e, e], "entity"), vInt)
    const s27 = f.dataTypeConversion(ret26, 'str')
    f.printString(s27)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getCorrespondingValueFromList")]), 0)
    return {}
  }
})

const comp_getCorrespondingValueFromList_20_faction = g.defineComposite("自动复合-collections-20-getCorrespondingValueFromList-faction", {
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
    // getCorrespondingValueFromList :: faction
    const ret28 = f.getCorrespondingValueFromList(f.assemblyList([vFaction, vFaction, vFaction], "faction"), vInt)
    const s29 = f.dataTypeConversion(ret28, 'str')
    f.printString(s29)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getCorrespondingValueFromList")]), 0)
    return {}
  }
})

const comp_insertValueIntoList_21_bool = g.defineComposite("自动复合-collections-21-insertValueIntoList-bool", {
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
    // insertValueIntoList :: bool
    f.insertValueIntoList(f.assemblyList([vBool, vBool, vBool], "bool"), vInt, vBool)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done insertValueIntoList")]), 0)
    return {}
  }
})

const comp_insertValueIntoList_22_configId = g.defineComposite("自动复合-collections-22-insertValueIntoList-configId", {
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
    // insertValueIntoList :: configId
    f.insertValueIntoList(f.assemblyList([vConfig, vConfig, vConfig], "config_id"), vInt, vConfig)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done insertValueIntoList")]), 0)
    return {}
  }
})

const comp_insertValueIntoList_23_entity = g.defineComposite("自动复合-collections-23-insertValueIntoList-entity", {
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
    // insertValueIntoList :: entity
    f.insertValueIntoList(f.assemblyList([e, e, e], "entity"), vInt, e)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done insertValueIntoList")]), 0)
    return {}
  }
})

const comp_insertValueIntoList_24_faction = g.defineComposite("自动复合-collections-24-insertValueIntoList-faction", {
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
    // insertValueIntoList :: faction
    f.insertValueIntoList(f.assemblyList([vFaction, vFaction, vFaction], "faction"), vInt, vFaction)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done insertValueIntoList")]), 0)
    return {}
  }
})

const comp_removeValueFromList_25_bool = g.defineComposite("自动复合-collections-25-removeValueFromList-bool", {
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
    // removeValueFromList :: bool
    f.removeValueFromList(f.assemblyList([vBool, vBool, vBool], "bool"), vInt)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done removeValueFromList")]), 0)
    return {}
  }
})

const comp_removeValueFromList_26_configId = g.defineComposite("自动复合-collections-26-removeValueFromList-configId", {
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
    // removeValueFromList :: configId
    f.removeValueFromList(f.assemblyList([vConfig, vConfig, vConfig], "config_id"), vInt)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done removeValueFromList")]), 0)
    return {}
  }
})

const comp_removeValueFromList_27_entity = g.defineComposite("自动复合-collections-27-removeValueFromList-entity", {
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
    // removeValueFromList :: entity
    f.removeValueFromList(f.assemblyList([e, e, e], "entity"), vInt)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done removeValueFromList")]), 0)
    return {}
  }
})

const comp_removeValueFromList_28_faction = g.defineComposite("自动复合-collections-28-removeValueFromList-faction", {
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
    // removeValueFromList :: faction
    f.removeValueFromList(f.assemblyList([vFaction, vFaction, vFaction], "faction"), vInt)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done removeValueFromList")]), 0)
    return {}
  }
})

const comp_modifyValueInList_29_bool = g.defineComposite("自动复合-collections-29-modifyValueInList-bool", {
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
    // modifyValueInList :: bool
    f.modifyValueInList(f.assemblyList([vBool, vBool, vBool], "bool"), vInt, vBool)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done modifyValueInList")]), 0)
    return {}
  }
})

const comp_modifyValueInList_30_configId = g.defineComposite("自动复合-collections-30-modifyValueInList-configId", {
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
    // modifyValueInList :: configId
    f.modifyValueInList(f.assemblyList([vConfig, vConfig, vConfig], "config_id"), vInt, vConfig)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done modifyValueInList")]), 0)
    return {}
  }
})

const comp_modifyValueInList_31_entity = g.defineComposite("自动复合-collections-31-modifyValueInList-entity", {
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
    // modifyValueInList :: entity
    f.modifyValueInList(f.assemblyList([e, e, e], "entity"), vInt, e)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done modifyValueInList")]), 0)
    return {}
  }
})

const comp_modifyValueInList_32_faction = g.defineComposite("自动复合-collections-32-modifyValueInList-faction", {
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
    // modifyValueInList :: faction
    f.modifyValueInList(f.assemblyList([vFaction, vFaction, vFaction], "faction"), vInt, vFaction)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done modifyValueInList")]), 0)
    return {}
  }
})

const comp_assemblyDictionary_33_dict_configId_bool_ = g.defineComposite("自动复合-collections-33-assemblyDictionary-dict<configId, bool>", {
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
    // assemblyDictionary :: dict<configId, bool>
    const ret30 = f.assemblyDictionary([{ k: vConfig, v: vBool }, { k: vConfig, v: vBool }])
    const len31 = f.queryDictionarySLength(ret30)
    const s32 = f.dataTypeConversion(len31, 'str')
    f.printString(s32)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done assemblyDictionary")]), 0)
    return {}
  }
})

const comp_assemblyDictionary_34_dict_configId_configId_ = g.defineComposite("自动复合-collections-34-assemblyDictionary-dict<configId, configId>", {
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
    // assemblyDictionary :: dict<configId, configId>
    const ret33 = f.assemblyDictionary([{ k: vConfig, v: vConfig }, { k: vConfig, v: vConfig }])
    const len34 = f.queryDictionarySLength(ret33)
    const s35 = f.dataTypeConversion(len34, 'str')
    f.printString(s35)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done assemblyDictionary")]), 0)
    return {}
  }
})

const comp_assemblyDictionary_35_dict_configId_entity_ = g.defineComposite("自动复合-collections-35-assemblyDictionary-dict<configId, entity>", {
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
    // assemblyDictionary :: dict<configId, entity>
    const ret36 = f.assemblyDictionary([{ k: vConfig, v: e }, { k: vConfig, v: e }])
    const len37 = f.queryDictionarySLength(ret36)
    const s38 = f.dataTypeConversion(len37, 'str')
    f.printString(s38)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done assemblyDictionary")]), 0)
    return {}
  }
})

const comp_assemblyDictionary_36_dict_configId_faction_ = g.defineComposite("自动复合-collections-36-assemblyDictionary-dict<configId, faction>", {
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
    // assemblyDictionary :: dict<configId, faction>
    const ret39 = f.assemblyDictionary([{ k: vConfig, v: vFaction }, { k: vConfig, v: vFaction }])
    const len40 = f.queryDictionarySLength(ret39)
    const s41 = f.dataTypeConversion(len40, 'str')
    f.printString(s41)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done assemblyDictionary")]), 0)
    return {}
  }
})

const comp_setOrAddKeyValuePairsToDictionary_37_dict_configId_bool_ = g.defineComposite("自动复合-collections-37-setOrAddKeyValuePairsToDictionary-dict<configId, bool>", {
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
    // setOrAddKeyValuePairsToDictionary :: dict<configId, bool>
    f.setOrAddKeyValuePairsToDictionary(f.assemblyDictionary([{ k: vConfig, v: vBool }, { k: vConfig, v: vBool }]), vConfig, vBool)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done setOrAddKeyValuePairsToDictionary")]), 0)
    return {}
  }
})

const comp_setOrAddKeyValuePairsToDictionary_38_dict_configId_configId_ = g.defineComposite("自动复合-collections-38-setOrAddKeyValuePairsToDictionary-dict<configId, configId>", {
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
    // setOrAddKeyValuePairsToDictionary :: dict<configId, configId>
    f.setOrAddKeyValuePairsToDictionary(f.assemblyDictionary([{ k: vConfig, v: vConfig }, { k: vConfig, v: vConfig }]), vConfig, vConfig)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done setOrAddKeyValuePairsToDictionary")]), 0)
    return {}
  }
})

const comp_setOrAddKeyValuePairsToDictionary_39_dict_configId_entity_ = g.defineComposite("自动复合-collections-39-setOrAddKeyValuePairsToDictionary-dict<configId, entity>", {
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
    // setOrAddKeyValuePairsToDictionary :: dict<configId, entity>
    f.setOrAddKeyValuePairsToDictionary(f.assemblyDictionary([{ k: vConfig, v: e }, { k: vConfig, v: e }]), vConfig, e)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done setOrAddKeyValuePairsToDictionary")]), 0)
    return {}
  }
})

const comp_setOrAddKeyValuePairsToDictionary_40_dict_configId_faction_ = g.defineComposite("自动复合-collections-40-setOrAddKeyValuePairsToDictionary-dict<configId, faction>", {
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
    // setOrAddKeyValuePairsToDictionary :: dict<configId, faction>
    f.setOrAddKeyValuePairsToDictionary(f.assemblyDictionary([{ k: vConfig, v: vFaction }, { k: vConfig, v: vFaction }]), vConfig, vFaction)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done setOrAddKeyValuePairsToDictionary")]), 0)
    return {}
  }
})

const comp_queryDictionaryValueByKey_41_dict_configId_bool_ = g.defineComposite("自动复合-collections-41-queryDictionaryValueByKey-dict<configId, bool>", {
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
    // queryDictionaryValueByKey :: dict<configId, bool>
    const ret42 = f.queryDictionaryValueByKey(f.assemblyDictionary([{ k: vConfig, v: vBool }, { k: vConfig, v: vBool }]), vConfig)
    const s43 = f.dataTypeConversion(ret42, 'str')
    f.printString(s43)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryDictionaryValueByKey")]), 0)
    return {}
  }
})

const comp_queryDictionaryValueByKey_42_dict_configId_configId_ = g.defineComposite("自动复合-collections-42-queryDictionaryValueByKey-dict<configId, configId>", {
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
    // queryDictionaryValueByKey :: dict<configId, configId>
    const ret44 = f.queryDictionaryValueByKey(f.assemblyDictionary([{ k: vConfig, v: vConfig }, { k: vConfig, v: vConfig }]), vConfig)
    const eq45 = f.equal(ret44, ret44)
    const s46 = f.dataTypeConversion(eq45, 'str')
    f.printString(s46)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryDictionaryValueByKey")]), 0)
    return {}
  }
})

const comp_queryDictionaryValueByKey_43_dict_configId_entity_ = g.defineComposite("自动复合-collections-43-queryDictionaryValueByKey-dict<configId, entity>", {
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
    // queryDictionaryValueByKey :: dict<configId, entity>
    const ret47 = f.queryDictionaryValueByKey(f.assemblyDictionary([{ k: vConfig, v: e }, { k: vConfig, v: e }]), vConfig)
    const s48 = f.dataTypeConversion(ret47, 'str')
    f.printString(s48)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryDictionaryValueByKey")]), 0)
    return {}
  }
})

const comp_queryDictionaryValueByKey_44_dict_configId_faction_ = g.defineComposite("自动复合-collections-44-queryDictionaryValueByKey-dict<configId, faction>", {
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
    // queryDictionaryValueByKey :: dict<configId, faction>
    const ret49 = f.queryDictionaryValueByKey(f.assemblyDictionary([{ k: vConfig, v: vFaction }, { k: vConfig, v: vFaction }]), vConfig)
    const s50 = f.dataTypeConversion(ret49, 'str')
    f.printString(s50)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryDictionaryValueByKey")]), 0)
    return {}
  }
})

const comp_removeKeyValuePairsFromDictionaryByKey_45_dict_configId_bool_ = g.defineComposite("自动复合-collections-45-removeKeyValuePairsFromDictionaryByKey-dict<configId, bool>", {
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
    // removeKeyValuePairsFromDictionaryByKey :: dict<configId, bool>
    f.removeKeyValuePairsFromDictionaryByKey(f.assemblyDictionary([{ k: vConfig, v: vBool }, { k: vConfig, v: vBool }]), vConfig)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done removeKeyValuePairsFromDictionaryByKey")]), 0)
    return {}
  }
})

const comp_removeKeyValuePairsFromDictionaryByKey_46_dict_configId_configId_ = g.defineComposite("自动复合-collections-46-removeKeyValuePairsFromDictionaryByKey-dict<configId, configId>", {
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
    // removeKeyValuePairsFromDictionaryByKey :: dict<configId, configId>
    f.removeKeyValuePairsFromDictionaryByKey(f.assemblyDictionary([{ k: vConfig, v: vConfig }, { k: vConfig, v: vConfig }]), vConfig)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done removeKeyValuePairsFromDictionaryByKey")]), 0)
    return {}
  }
})

const comp_removeKeyValuePairsFromDictionaryByKey_47_dict_configId_entity_ = g.defineComposite("自动复合-collections-47-removeKeyValuePairsFromDictionaryByKey-dict<configId, entity>", {
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
    // removeKeyValuePairsFromDictionaryByKey :: dict<configId, entity>
    f.removeKeyValuePairsFromDictionaryByKey(f.assemblyDictionary([{ k: vConfig, v: e }, { k: vConfig, v: e }]), vConfig)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done removeKeyValuePairsFromDictionaryByKey")]), 0)
    return {}
  }
})

const comp_removeKeyValuePairsFromDictionaryByKey_48_dict_configId_faction_ = g.defineComposite("自动复合-collections-48-removeKeyValuePairsFromDictionaryByKey-dict<configId, faction>", {
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
    // removeKeyValuePairsFromDictionaryByKey :: dict<configId, faction>
    f.removeKeyValuePairsFromDictionaryByKey(f.assemblyDictionary([{ k: vConfig, v: vFaction }, { k: vConfig, v: vFaction }]), vConfig)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done removeKeyValuePairsFromDictionaryByKey")]), 0)
    return {}
  }
})

const comp_queryIfDictionaryContainsSpecificKey_49_dict_configId_bool_ = g.defineComposite("自动复合-collections-49-queryIfDictionaryContainsSpecificKey-dict<configId, bool>", {
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
    // queryIfDictionaryContainsSpecificKey :: dict<configId, bool>
    const ret51 = f.queryIfDictionaryContainsSpecificKey(f.assemblyDictionary([{ k: vConfig, v: vBool }, { k: vConfig, v: vBool }]), vConfig)
    const s52 = f.dataTypeConversion(ret51, 'str')
    f.printString(s52)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryIfDictionaryContainsSpecificKey")]), 0)
    return {}
  }
})

const comp_queryIfDictionaryContainsSpecificKey_50_dict_configId_configId_ = g.defineComposite("自动复合-collections-50-queryIfDictionaryContainsSpecificKey-dict<configId, configId>", {
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
    // queryIfDictionaryContainsSpecificKey :: dict<configId, configId>
    const ret53 = f.queryIfDictionaryContainsSpecificKey(f.assemblyDictionary([{ k: vConfig, v: vConfig }, { k: vConfig, v: vConfig }]), vConfig)
    const s54 = f.dataTypeConversion(ret53, 'str')
    f.printString(s54)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryIfDictionaryContainsSpecificKey")]), 0)
    return {}
  }
})

const comp_queryIfDictionaryContainsSpecificKey_51_dict_configId_entity_ = g.defineComposite("自动复合-collections-51-queryIfDictionaryContainsSpecificKey-dict<configId, entity>", {
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
    // queryIfDictionaryContainsSpecificKey :: dict<configId, entity>
    const ret55 = f.queryIfDictionaryContainsSpecificKey(f.assemblyDictionary([{ k: vConfig, v: e }, { k: vConfig, v: e }]), vConfig)
    const s56 = f.dataTypeConversion(ret55, 'str')
    f.printString(s56)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryIfDictionaryContainsSpecificKey")]), 0)
    return {}
  }
})

const comp_queryIfDictionaryContainsSpecificKey_52_dict_configId_faction_ = g.defineComposite("自动复合-collections-52-queryIfDictionaryContainsSpecificKey-dict<configId, faction>", {
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
    // queryIfDictionaryContainsSpecificKey :: dict<configId, faction>
    const ret57 = f.queryIfDictionaryContainsSpecificKey(f.assemblyDictionary([{ k: vConfig, v: vFaction }, { k: vConfig, v: vFaction }]), vConfig)
    const s58 = f.dataTypeConversion(ret57, 'str')
    f.printString(s58)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryIfDictionaryContainsSpecificKey")]), 0)
    return {}
  }
})

const comp_getListOfKeysFromDictionary_53_dict_configId_bool_ = g.defineComposite("自动复合-collections-53-getListOfKeysFromDictionary-dict<configId, bool>", {
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
    // getListOfKeysFromDictionary :: dict<configId, bool>
    const ret59 = f.getListOfKeysFromDictionary(f.assemblyDictionary([{ k: vConfig, v: vBool }, { k: vConfig, v: vBool }]))
    const len60 = f.getListLength(ret59)
    const s61 = f.dataTypeConversion(len60, 'str')
    f.printString(s61)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListOfKeysFromDictionary")]), 0)
    return {}
  }
})

const comp_getListOfKeysFromDictionary_54_dict_configId_configId_ = g.defineComposite("自动复合-collections-54-getListOfKeysFromDictionary-dict<configId, configId>", {
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
    // getListOfKeysFromDictionary :: dict<configId, configId>
    const ret62 = f.getListOfKeysFromDictionary(f.assemblyDictionary([{ k: vConfig, v: vConfig }, { k: vConfig, v: vConfig }]))
    const len63 = f.getListLength(ret62)
    const s64 = f.dataTypeConversion(len63, 'str')
    f.printString(s64)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListOfKeysFromDictionary")]), 0)
    return {}
  }
})

const comp_getListOfKeysFromDictionary_55_dict_configId_entity_ = g.defineComposite("自动复合-collections-55-getListOfKeysFromDictionary-dict<configId, entity>", {
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
    // getListOfKeysFromDictionary :: dict<configId, entity>
    const ret65 = f.getListOfKeysFromDictionary(f.assemblyDictionary([{ k: vConfig, v: e }, { k: vConfig, v: e }]))
    const len66 = f.getListLength(ret65)
    const s67 = f.dataTypeConversion(len66, 'str')
    f.printString(s67)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListOfKeysFromDictionary")]), 0)
    return {}
  }
})

const comp_getListOfKeysFromDictionary_56_dict_configId_faction_ = g.defineComposite("自动复合-collections-56-getListOfKeysFromDictionary-dict<configId, faction>", {
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
    // getListOfKeysFromDictionary :: dict<configId, faction>
    const ret68 = f.getListOfKeysFromDictionary(f.assemblyDictionary([{ k: vConfig, v: vFaction }, { k: vConfig, v: vFaction }]))
    const len69 = f.getListLength(ret68)
    const s70 = f.dataTypeConversion(len69, 'str')
    f.printString(s70)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListOfKeysFromDictionary")]), 0)
    return {}
  }
})

const comp_queryDictionarySLength_57 = g.defineComposite("自动复合-collections-57-queryDictionarySLength", {
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
    const ret73 = f.queryDictionarySLength(f.assemblyDictionary([{ k: 71, v: 72 }, { k: 71, v: 72 }]))
    const s74 = f.dataTypeConversion(ret73, 'str')
    f.printString(s74)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryDictionarySLength")]), 0)
    return {}
  }
})

const comp_clearDictionary_58_dict_configId_bool_ = g.defineComposite("自动复合-collections-58-clearDictionary-dict<configId, bool>", {
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
    // clearDictionary :: dict<configId, bool>
    f.clearDictionary(f.assemblyDictionary([{ k: vConfig, v: vBool }, { k: vConfig, v: vBool }]))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done clearDictionary")]), 0)
    return {}
  }
})

const comp_clearDictionary_59_dict_configId_configId_ = g.defineComposite("自动复合-collections-59-clearDictionary-dict<configId, configId>", {
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
    // clearDictionary :: dict<configId, configId>
    f.clearDictionary(f.assemblyDictionary([{ k: vConfig, v: vConfig }, { k: vConfig, v: vConfig }]))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done clearDictionary")]), 0)
    return {}
  }
})

const comp_clearDictionary_60_dict_configId_entity_ = g.defineComposite("自动复合-collections-60-clearDictionary-dict<configId, entity>", {
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
    // clearDictionary :: dict<configId, entity>
    f.clearDictionary(f.assemblyDictionary([{ k: vConfig, v: e }, { k: vConfig, v: e }]))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done clearDictionary")]), 0)
    return {}
  }
})

const comp_clearDictionary_61_dict_configId_faction_ = g.defineComposite("自动复合-collections-61-clearDictionary-dict<configId, faction>", {
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
    // clearDictionary :: dict<configId, faction>
    f.clearDictionary(f.assemblyDictionary([{ k: vConfig, v: vFaction }, { k: vConfig, v: vFaction }]))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done clearDictionary")]), 0)
    return {}
  }
})

const comp_createDictionary_62_dict_configId_bool_ = g.defineComposite("自动复合-collections-62-createDictionary-dict<configId, bool>", {
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
    // createDictionary :: dict<configId, bool>
    const ret75 = f.createDictionary(f.assemblyList([vConfig, vConfig, vConfig], "config_id"), f.assemblyList([vBool, vBool, vBool], "bool"))
    const len76 = f.queryDictionarySLength(ret75)
    const s77 = f.dataTypeConversion(len76, 'str')
    f.printString(s77)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done createDictionary")]), 0)
    return {}
  }
})

const comp_createDictionary_63_dict_configId_configId_ = g.defineComposite("自动复合-collections-63-createDictionary-dict<configId, configId>", {
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
    // createDictionary :: dict<configId, configId>
    const ret78 = f.createDictionary(f.assemblyList([vConfig, vConfig, vConfig], "config_id"), f.assemblyList([vConfig, vConfig, vConfig], "config_id"))
    const len79 = f.queryDictionarySLength(ret78)
    const s80 = f.dataTypeConversion(len79, 'str')
    f.printString(s80)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done createDictionary")]), 0)
    return {}
  }
})

const comp_createDictionary_64_dict_configId_entity_ = g.defineComposite("自动复合-collections-64-createDictionary-dict<configId, entity>", {
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
    // createDictionary :: dict<configId, entity>
    const ret81 = f.createDictionary(f.assemblyList([vConfig, vConfig, vConfig], "config_id"), f.assemblyList([e, e, e], "entity"))
    const len82 = f.queryDictionarySLength(ret81)
    const s83 = f.dataTypeConversion(len82, 'str')
    f.printString(s83)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done createDictionary")]), 0)
    return {}
  }
})

const comp_createDictionary_65_dict_configId_faction_ = g.defineComposite("自动复合-collections-65-createDictionary-dict<configId, faction>", {
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
    // createDictionary :: dict<configId, faction>
    const ret84 = f.createDictionary(f.assemblyList([vConfig, vConfig, vConfig], "config_id"), f.assemblyList([vFaction, vFaction, vFaction], "faction"))
    const len85 = f.queryDictionarySLength(ret84)
    const s86 = f.dataTypeConversion(len85, 'str')
    f.printString(s86)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done createDictionary")]), 0)
    return {}
  }
})

const comp_queryIfDictionaryContainsSpecificValue_66_dict_configId_bool_ = g.defineComposite("自动复合-collections-66-queryIfDictionaryContainsSpecificValue-dict<configId, bool>", {
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
    // queryIfDictionaryContainsSpecificValue :: dict<configId, bool>
    const ret87 = f.queryIfDictionaryContainsSpecificValue(f.assemblyDictionary([{ k: vConfig, v: vBool }, { k: vConfig, v: vBool }]), vBool)
    const s88 = f.dataTypeConversion(ret87, 'str')
    f.printString(s88)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryIfDictionaryContainsSpecificValue")]), 0)
    return {}
  }
})

const comp_queryIfDictionaryContainsSpecificValue_67_dict_configId_configId_ = g.defineComposite("自动复合-collections-67-queryIfDictionaryContainsSpecificValue-dict<configId, configId>", {
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
    // queryIfDictionaryContainsSpecificValue :: dict<configId, configId>
    const ret89 = f.queryIfDictionaryContainsSpecificValue(f.assemblyDictionary([{ k: vConfig, v: vConfig }, { k: vConfig, v: vConfig }]), vConfig)
    const s90 = f.dataTypeConversion(ret89, 'str')
    f.printString(s90)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryIfDictionaryContainsSpecificValue")]), 0)
    return {}
  }
})

const comp_queryIfDictionaryContainsSpecificValue_68_dict_configId_entity_ = g.defineComposite("自动复合-collections-68-queryIfDictionaryContainsSpecificValue-dict<configId, entity>", {
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
    // queryIfDictionaryContainsSpecificValue :: dict<configId, entity>
    const ret91 = f.queryIfDictionaryContainsSpecificValue(f.assemblyDictionary([{ k: vConfig, v: e }, { k: vConfig, v: e }]), e)
    const s92 = f.dataTypeConversion(ret91, 'str')
    f.printString(s92)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryIfDictionaryContainsSpecificValue")]), 0)
    return {}
  }
})

const comp_queryIfDictionaryContainsSpecificValue_69_dict_configId_faction_ = g.defineComposite("自动复合-collections-69-queryIfDictionaryContainsSpecificValue-dict<configId, faction>", {
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
    // queryIfDictionaryContainsSpecificValue :: dict<configId, faction>
    const ret93 = f.queryIfDictionaryContainsSpecificValue(f.assemblyDictionary([{ k: vConfig, v: vFaction }, { k: vConfig, v: vFaction }]), vFaction)
    const s94 = f.dataTypeConversion(ret93, 'str')
    f.printString(s94)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done queryIfDictionaryContainsSpecificValue")]), 0)
    return {}
  }
})

const comp_getListOfValuesFromDictionary_70_dict_configId_bool_ = g.defineComposite("自动复合-collections-70-getListOfValuesFromDictionary-dict<configId, bool>", {
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
    // getListOfValuesFromDictionary :: dict<configId, bool>
    const ret95 = f.getListOfValuesFromDictionary(f.assemblyDictionary([{ k: vConfig, v: vBool }, { k: vConfig, v: vBool }]))
    const len96 = f.getListLength(ret95)
    const s97 = f.dataTypeConversion(len96, 'str')
    f.printString(s97)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListOfValuesFromDictionary")]), 0)
    return {}
  }
})

const comp_getListOfValuesFromDictionary_71_dict_configId_configId_ = g.defineComposite("自动复合-collections-71-getListOfValuesFromDictionary-dict<configId, configId>", {
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
    // getListOfValuesFromDictionary :: dict<configId, configId>
    const ret98 = f.getListOfValuesFromDictionary(f.assemblyDictionary([{ k: vConfig, v: vConfig }, { k: vConfig, v: vConfig }]))
    const len99 = f.getListLength(ret98)
    const s100 = f.dataTypeConversion(len99, 'str')
    f.printString(s100)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListOfValuesFromDictionary")]), 0)
    return {}
  }
})

const comp_getListOfValuesFromDictionary_72_dict_configId_entity_ = g.defineComposite("自动复合-collections-72-getListOfValuesFromDictionary-dict<configId, entity>", {
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
    // getListOfValuesFromDictionary :: dict<configId, entity>
    const ret101 = f.getListOfValuesFromDictionary(f.assemblyDictionary([{ k: vConfig, v: e }, { k: vConfig, v: e }]))
    const len102 = f.getListLength(ret101)
    const s103 = f.dataTypeConversion(len102, 'str')
    f.printString(s103)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListOfValuesFromDictionary")]), 0)
    return {}
  }
})

const comp_getListOfValuesFromDictionary_73_dict_configId_faction_ = g.defineComposite("自动复合-collections-73-getListOfValuesFromDictionary-dict<configId, faction>", {
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
    // getListOfValuesFromDictionary :: dict<configId, faction>
    const ret104 = f.getListOfValuesFromDictionary(f.assemblyDictionary([{ k: vConfig, v: vFaction }, { k: vConfig, v: vFaction }]))
    const len105 = f.getListLength(ret104)
    const s106 = f.dataTypeConversion(len105, 'str')
    f.printString(s106)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getListOfValuesFromDictionary")]), 0)
    return {}
  }
})

const comp_sortDictionaryByKey_74_dict_int_bool_ = g.defineComposite("自动复合-collections-74-sortDictionaryByKey-dict<int, bool>", {
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
    // sortDictionaryByKey :: dict<int, bool>
    const ret107 = f.sortDictionaryByKey(f.assemblyDictionary([{ k: vInt, v: vBool }, { k: vInt, v: vBool }]), E.SortBy.Ascending)
    const len108 = f.getListLength(ret107.keyList)
    const s109 = f.dataTypeConversion(len108, 'str')
    f.printString(s109)
    const len110 = f.getListLength(ret107.valueList)
    const s111 = f.dataTypeConversion(len110, 'str')
    f.printString(s111)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done sortDictionaryByKey")]), 0)
    return {}
  }
})

const comp_sortDictionaryByKey_75_dict_int_configId_ = g.defineComposite("自动复合-collections-75-sortDictionaryByKey-dict<int, configId>", {
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
    // sortDictionaryByKey :: dict<int, configId>
    const ret112 = f.sortDictionaryByKey(f.assemblyDictionary([{ k: vInt, v: vConfig }, { k: vInt, v: vConfig }]), E.SortBy.Ascending)
    const len113 = f.getListLength(ret112.keyList)
    const s114 = f.dataTypeConversion(len113, 'str')
    f.printString(s114)
    const len115 = f.getListLength(ret112.valueList)
    const s116 = f.dataTypeConversion(len115, 'str')
    f.printString(s116)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done sortDictionaryByKey")]), 0)
    return {}
  }
})

const comp_sortDictionaryByKey_76_dict_int_entity_ = g.defineComposite("自动复合-collections-76-sortDictionaryByKey-dict<int, entity>", {
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
    // sortDictionaryByKey :: dict<int, entity>
    const ret117 = f.sortDictionaryByKey(f.assemblyDictionary([{ k: vInt, v: e }, { k: vInt, v: e }]), E.SortBy.Ascending)
    const len118 = f.getListLength(ret117.keyList)
    const s119 = f.dataTypeConversion(len118, 'str')
    f.printString(s119)
    const len120 = f.getListLength(ret117.valueList)
    const s121 = f.dataTypeConversion(len120, 'str')
    f.printString(s121)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done sortDictionaryByKey")]), 0)
    return {}
  }
})

const comp_sortDictionaryByKey_77_dict_int_faction_ = g.defineComposite("自动复合-collections-77-sortDictionaryByKey-dict<int, faction>", {
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
    // sortDictionaryByKey :: dict<int, faction>
    const ret122 = f.sortDictionaryByKey(f.assemblyDictionary([{ k: vInt, v: vFaction }, { k: vInt, v: vFaction }]), E.SortBy.Ascending)
    const len123 = f.getListLength(ret122.keyList)
    const s124 = f.dataTypeConversion(len123, 'str')
    f.printString(s124)
    const len125 = f.getListLength(ret122.valueList)
    const s126 = f.dataTypeConversion(len125, 'str')
    f.printString(s126)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done sortDictionaryByKey")]), 0)
    return {}
  }
})

const comp_sortDictionaryByValue_78_dict_configId_float_ = g.defineComposite("自动复合-collections-78-sortDictionaryByValue-dict<configId, float>", {
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
    // sortDictionaryByValue :: dict<configId, float>
    const ret127 = f.sortDictionaryByValue(f.assemblyDictionary([{ k: vConfig, v: vFloat }, { k: vConfig, v: vFloat }]), E.SortBy.Ascending)
    const len128 = f.getListLength(ret127.keyList)
    const s129 = f.dataTypeConversion(len128, 'str')
    f.printString(s129)
    const len130 = f.getListLength(ret127.valueList)
    const s131 = f.dataTypeConversion(len130, 'str')
    f.printString(s131)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done sortDictionaryByValue")]), 0)
    return {}
  }
})

const comp_sortDictionaryByValue_79_dict_configId_int_ = g.defineComposite("自动复合-collections-79-sortDictionaryByValue-dict<configId, int>", {
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
    // sortDictionaryByValue :: dict<configId, int>
    const ret132 = f.sortDictionaryByValue(f.assemblyDictionary([{ k: vConfig, v: vInt }, { k: vConfig, v: vInt }]), E.SortBy.Ascending)
    const len133 = f.getListLength(ret132.keyList)
    const s134 = f.dataTypeConversion(len133, 'str')
    f.printString(s134)
    const len135 = f.getListLength(ret132.valueList)
    const s136 = f.dataTypeConversion(len135, 'str')
    f.printString(s136)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done sortDictionaryByValue")]), 0)
    return {}
  }
})

const comp_sortDictionaryByValue_80_dict_entity_float_ = g.defineComposite("自动复合-collections-80-sortDictionaryByValue-dict<entity, float>", {
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
    // sortDictionaryByValue :: dict<entity, float>
    const ret137 = f.sortDictionaryByValue(f.assemblyDictionary([{ k: e, v: vFloat }, { k: e, v: vFloat }]), E.SortBy.Ascending)
    const len138 = f.getListLength(ret137.keyList)
    const s139 = f.dataTypeConversion(len138, 'str')
    f.printString(s139)
    const len140 = f.getListLength(ret137.valueList)
    const s141 = f.dataTypeConversion(len140, 'str')
    f.printString(s141)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done sortDictionaryByValue")]), 0)
    return {}
  }
})

const comp_sortDictionaryByValue_81_dict_entity_int_ = g.defineComposite("自动复合-collections-81-sortDictionaryByValue-dict<entity, int>", {
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
    // sortDictionaryByValue :: dict<entity, int>
    const ret142 = f.sortDictionaryByValue(f.assemblyDictionary([{ k: e, v: vInt }, { k: e, v: vInt }]), E.SortBy.Ascending)
    const len143 = f.getListLength(ret142.keyList)
    const s144 = f.dataTypeConversion(len143, 'str')
    f.printString(s144)
    const len145 = f.getListLength(ret142.valueList)
    const s146 = f.dataTypeConversion(len145, 'str')
    f.printString(s146)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done sortDictionaryByValue")]), 0)
    return {}
  }
})

const comp_getLocalVariable_82_bool = g.defineComposite("自动复合-collections-82-getLocalVariable-bool", {
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
    // getLocalVariable :: bool
    const ret147 = f.getLocalVariable(vBool)
    f.setLocalVariable(ret147.localVariable, ret147.value)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getLocalVariable")]), 0)
    return {}
  }
})

const comp_getLocalVariable_83_configId = g.defineComposite("自动复合-collections-83-getLocalVariable-configId", {
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
    // getLocalVariable :: configId
    const ret148 = f.getLocalVariable(vConfig)
    f.setLocalVariable(ret148.localVariable, ret148.value)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getLocalVariable")]), 0)
    return {}
  }
})

const comp_getLocalVariable_84_entity = g.defineComposite("自动复合-collections-84-getLocalVariable-entity", {
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
    // getLocalVariable :: entity
    const ret149 = f.getLocalVariable(e)
    f.setLocalVariable(ret149.localVariable, ret149.value)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getLocalVariable")]), 0)
    return {}
  }
})

const comp_getLocalVariable_85_faction = g.defineComposite("自动复合-collections-85-getLocalVariable-faction", {
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
    // getLocalVariable :: faction
    const ret150 = f.getLocalVariable(vFaction)
    f.setLocalVariable(ret150.localVariable, ret150.value)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done getLocalVariable")]), 0)
    return {}
  }
})

const comp_setLocalVariable_86_bool = g.defineComposite("自动复合-collections-86-setLocalVariable-bool", {
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
    // setLocalVariable :: bool
    f.setLocalVariable(f.getLocalVariable(1n).localVariable, vBool)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done setLocalVariable")]), 0)
    return {}
  }
})

const comp_setLocalVariable_87_configId = g.defineComposite("自动复合-collections-87-setLocalVariable-configId", {
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
    // setLocalVariable :: configId
    f.setLocalVariable(f.getLocalVariable(1n).localVariable, vConfig)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done setLocalVariable")]), 0)
    return {}
  }
})

const comp_setLocalVariable_88_entity = g.defineComposite("自动复合-collections-88-setLocalVariable-entity", {
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
    // setLocalVariable :: entity
    f.setLocalVariable(f.getLocalVariable(1n).localVariable, e)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done setLocalVariable")]), 0)
    return {}
  }
})

const comp_setLocalVariable_89_faction = g.defineComposite("自动复合-collections-89-setLocalVariable-faction", {
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
    // setLocalVariable :: faction
    f.setLocalVariable(f.getLocalVariable(1n).localVariable, vFaction)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue("done setLocalVariable")]), 0)
    return {}
  }
})

const graph = g.server({
  mode: 'beyond',
  type: 'entity',
  name: "V2-全类型自动复合-collections-wire-step1",
  id: 1073741927
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
