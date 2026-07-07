// @ts-nocheck
/**
 * Strict topology recreation for reference file `布局c.gia`.
 *
 * Uses handwritten IR IDs because runtime raw DSL assigns IDs at value creation time,
 * while the editor reference numbers exec nodes before their data dependencies.
 *
 * Reference:
 *   /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/布局c.gia
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUT_DIR = './tests/composite/output'
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

const conn = (node_id, index, type) => ({ type: 'conn', value: { node_id, index, type } })
const strArg = (value) => ({ type: 'str', value })
const floatArg = (value) => ({ type: 'float', value })

const ir = {
  ir_version: 1,
  ir_type: 'node_graph',
  graph: {
    id: 1073741897,
    name: 'R6-C参考复刻',
    type: 'server',
    mode: 'beyond',
    sub_type: 'entity'
  },
  variables: [
    { name: 'locationOffset', type: 'vec3', value: [1, 2, 3] },
    { name: 'rotationOffset', type: 'vec3', value: [2, 3, 4] },
    { name: 'overwriteAbilityUnitConfig', type: 'bool', value: false }
  ],
  nodes: [
    {
      id: 1,
      type: 'when_entity_is_created',
      next: [
        { node_id: 2, source_index: 0, target_index: 0 },
        { node_id: 3, source_index: 0, target_index: 0 }
      ]
    },
    {
      id: 2,
      type: 'print_string',
      args: [strArg('基础场景')],
      next: [
        { node_id: 5, source_index: 0, target_index: 0 },
        { node_id: 11, source_index: 0, target_index: 0 }
      ]
    },
    {
      id: 3,
      type: 'print_string',
      args: [strArg('基础场景')],
      next: [{ node_id: 12, source_index: 0, target_index: 0 }]
    },
    {
      id: 5,
      type: 'initiate_attack',
      args: [
        conn(1, 0, 'entity'),
        floatArg(999),
        floatArg(1.2),
        conn(6, 0, 'vec3'),
        conn(7, 0, 'vec3'),
        conn(8, 0, 'str'),
        conn(10, 0, 'bool'),
        conn(1, 0, 'entity')
      ]
    },
    { id: 6, type: 'get_node_graph_variable', args: [strArg('locationOffset')] },
    { id: 7, type: 'get_node_graph_variable', args: [strArg('rotationOffset')] },
    { id: 8, type: 'data_type_conversion_str', args: [conn(1, 1, 'guid')] },
    { id: 10, type: 'get_node_graph_variable', args: [strArg('overwriteAbilityUnitConfig')] },
    {
      id: 11,
      type: 'print_string',
      args: [strArg('上面一个节点图有比较多的参数，所以距离下移')]
    },
    {
      id: 12,
      type: 'print_string',
      args: [strArg('上面一条线的节点图已经占位了，所以距离继续下移')],
      next: [{ node_id: 13, source_index: 0, target_index: 0 }]
    },
    {
      id: 13,
      type: 'print_string',
      args: [strArg('这条线已经下移了，虽然上面有空间，也保持这条线，继续平移')]
    }
  ]
}

const bytes = irToGia(ir, {
  graphId: 1073741897,
  name: 'layout-r6-c-reference-repro',
  protoPath: PROTO_PATH
})
const outPath = `${OUT_DIR}/layout-r6-c-reference-repro.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(outPath)
