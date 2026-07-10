/**
 * Local variable smoke: 获取/设置局部变量（gid 200082/200081，cid 恒 1036/2000）
 * 的值引脚编码。变量类型只体现在值引脚 type + ConcreteBase.ioc 上（类型序表见
 * client_graph.ts LOCAL_VAR_IOC_BY_IR）。覆盖字面量/连线/字典/列表值与
 * 出参定型，IR -> GIA -> decode 后逐引脚断言与语料一致。
 */
import assert from 'node:assert'
import fs from 'node:fs'

import { irToGia } from '../../src/compiler/ir_to_gia_transform/index.js'
import { buildClientGraphRegistriesIRDocuments, g } from '../../src/runtime/core.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH =
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'
const OUT_FILE = 'tests/client_generated/smoke_local_variables.gia'

g.characterSkill({ id: 1082130443, name: 'LocalVars' }).on('start', (_evt, f) => {
  const self = f.getSelfEntity()
  // set#0: int 字面量（角色操控 设置局部变量_填值 同形：t3 ioc0 innerSet）
  f.setLocalVariable('count', 1n)
  // set#1: int 连线（设置局部变量_连线 同形：t3 ioc0 unset + connects）
  f.setLocalVariable('sum', f.addition(1n, 2n))
  // set#2: str 连线（get str 出参 t9 ioc1，角色技能 获取局部变量_连线 同形）
  f.setLocalVariable('name2', f.getLocalVariable('name').asType('str'))
  // set#3: faction 连线（变量字典覆盖采样 get 阵营 t16 ioc18 同表）
  f.setLocalVariable('fac2', f.getLocalVariable('fac').asType('faction'))
  // set#4: int_list（造物 获取实体的单位标签列表_连线 t4 ioc7 同形）
  f.setLocalVariable('tags', f.getCustomVariable(self, 'tags').asType('int_list'))
  // set#5: entity_list（造物 获取指定实体的仇恨列表_连线 t2 ioc9 同形）
  f.setLocalVariable('targets', f.getCustomVariable(self, 'ts').asType('entity_list'))
  // set#6: prefab_id_list（变量字典覆盖采样 元件id列表 t21 ioc17 同形）
  f.setLocalVariable('prefabs', f.getCustomVariable(self, 'ps').asType('prefab_id_list'))
  // set#7: dict（变量字典覆盖采样/拼装字典_连线 t24 ioc20 同形）
  f.setLocalVariable('d', f.getCustomVariable(self, 'd').asDict('guid', 'vec3'))
  // set#8: float 字面量（ioc=4 为类型序表推断值，锁定编码行为）
  f.setLocalVariable('ratio', 1.5)
  // get 出参定型：int(ioc0)/entity(ioc2)/vec3(ioc5) 均为语料实测
  const count = f.getLocalVariable('count').asType('int')
  const guidOfEnt = f.queryGuidByEntity(f.getLocalVariable('e').asType('entity'))
  const pos = f.getLocalVariable('pos').asType('vec3')
  f.doubleBranch(
    f.equal(count, 1n),
    () => f.forceExitAimingState(),
    () =>
      f.doubleBranch(
        f.equal(pos, [0, 0, 0]),
        () => f.forceExitAimingState(),
        () =>
          f.doubleBranch(
            f.queryIfDictionaryContainsSpecificKey(
              f.getLocalVariable('d').asDict('guid', 'vec3'),
              guidOfEnt
            ),
            () => f.forceExitAimingState(),
            () => f.forceExitAimingState()
          )
      )
  )
})

const doc = buildClientGraphRegistriesIRDocuments().find((d) =>
  d.graph.name?.includes('LocalVars')
)!
const bytes = irToGia(doc, { protoPath: PROTO_PATH })
fs.writeFileSync(OUT_FILE, bytes)
const decoded = decode_gia_file(OUT_FILE, undefined, true)
const nodes = decoded.graph.graph?.inner.graph?.nodes ?? []

type PinExpect = {
  kind: number
  index: number
  type: number
  /** ConcreteBase 包装引脚的 indexOfConcrete（与 plainStr 二选一） */
  ioc?: number
  innerSet?: boolean
  wired?: boolean
  /** 变量名引脚：普通 str 字面量（无 ioc 包裹） */
  plainStr?: string
}

function checkNode(label: string, gid: number, cid: number, pins: PinExpect[], nth = 0) {
  const node = nodes.filter((n: any) => Number(n.genericId?.nodeId) === gid)[nth]
  assert.ok(node, `${label}: node gid=${gid}#${nth} missing`)
  assert.strictEqual(Number(node.concreteId?.nodeId), cid, `${label}: concreteId`)
  for (const exp of pins) {
    const pin = (node.pins ?? []).find(
      (p: any) => Number(p.i1?.kind) === exp.kind && Number(p.i1?.index) === exp.index
    )
    assert.ok(pin, `${label}: pin k${exp.kind}#${exp.index} missing`)
    assert.strictEqual(Number(pin.type ?? 0), exp.type, `${label}: pin k${exp.kind}#${exp.index} type`)
    if (exp.plainStr !== undefined) {
      assert.strictEqual(
        String(pin.value?.bString?.val ?? ''),
        exp.plainStr,
        `${label}: pin k${exp.kind}#${exp.index} name literal`
      )
      assert.strictEqual(
        Boolean(pin.value?.alreadySetVal),
        true,
        `${label}: pin k${exp.kind}#${exp.index} name set`
      )
      continue
    }
    if (exp.ioc !== undefined) {
      assert.strictEqual(
        Number(pin.value?.bConcreteValue?.indexOfConcrete),
        exp.ioc,
        `${label}: pin k${exp.kind}#${exp.index} ioc`
      )
    }
    if (exp.innerSet !== undefined) {
      assert.strictEqual(
        Boolean(pin.value?.bConcreteValue?.value?.alreadySetVal),
        exp.innerSet,
        `${label}: pin k${exp.kind}#${exp.index} innerSet`
      )
    }
    if (exp.wired !== undefined) {
      assert.strictEqual(
        (pin.connects ?? []).length > 0,
        exp.wired,
        `${label}: pin k${exp.kind}#${exp.index} wired`
      )
    }
  }
  console.log(`[ok] ${label}: cid=${cid}, ${pins.length} pins verified`)
}

const SET = 200081
const GET = 200082

// 设置局部变量（按 IR 声明顺序）
checkNode('set int literal', SET, 2000, [
  { kind: 3, index: 0, type: 9, plainStr: 'count' },
  { kind: 3, index: 1, type: 3, ioc: 0, innerSet: true, wired: false },
  { kind: 5, index: 0, type: 3 }
])
checkNode('set int wired', SET, 2000, [{ kind: 3, index: 1, type: 3, ioc: 0, innerSet: false, wired: true }], 1)
checkNode('set str wired', SET, 2000, [{ kind: 3, index: 1, type: 9, ioc: 1, innerSet: false, wired: true }], 2)
checkNode('set faction wired', SET, 2000, [{ kind: 3, index: 1, type: 16, ioc: 18, innerSet: false, wired: true }], 3)
checkNode('set int_list wired', SET, 2000, [{ kind: 3, index: 1, type: 4, ioc: 7, innerSet: false, wired: true }], 4)
checkNode('set entity_list wired', SET, 2000, [{ kind: 3, index: 1, type: 2, ioc: 9, innerSet: false, wired: true }], 5)
checkNode('set prefab_id_list wired', SET, 2000, [{ kind: 3, index: 1, type: 21, ioc: 17, innerSet: false, wired: true }], 6)
checkNode('set dict wired', SET, 2000, [{ kind: 3, index: 1, type: 24, ioc: 20, innerSet: false, wired: true }], 7)
checkNode('set float literal (inferred ioc)', SET, 2000, [{ kind: 3, index: 1, type: 7, ioc: 4, innerSet: true, wired: false }], 8)

// 获取局部变量（按 IR 声明顺序：name/fac 先于 count/e/pos/d 注册）
checkNode('get str out', GET, 1036, [
  { kind: 3, index: 0, type: 9, plainStr: 'name' },
  { kind: 4, index: 0, type: 9, ioc: 1 }
])
checkNode('get faction out', GET, 1036, [{ kind: 4, index: 0, type: 16, ioc: 18 }], 1)
checkNode('get int out', GET, 1036, [{ kind: 4, index: 0, type: 3, ioc: 0 }], 2)
checkNode('get entity out', GET, 1036, [{ kind: 4, index: 0, type: 1, ioc: 2 }], 3)
checkNode('get vec3 out', GET, 1036, [{ kind: 4, index: 0, type: 11, ioc: 5 }], 4)
checkNode('get dict out (inferred ioc)', GET, 1036, [{ kind: 4, index: 0, type: 24, ioc: 20 }], 5)

fs.rmSync(OUT_FILE, { force: true })
console.log('[ok] local variable encoding verified (9 set + 6 get)')
