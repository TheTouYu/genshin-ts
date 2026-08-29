// @ts-nocheck
/**
 * 图变量列表 wire 对齐编辑器样本回归（2026-08-29 最小差分）。
 *
 * 背景：用户编辑器在图 1073741825 声明 int_list 图变量「int50」= 50×0（map 1073741915 变量，
 * 快照 ~/genshin-ts-evidence/variable-system/raw/var-v1-graph1-int-list-len50.gil）。
 * 之前多次踩坑：声明长度 50/100 的 int_list 运行时索引越界（引擎「全 0 int_list 短物化」R2，
 * retrospective-2026-08-22-rubik-record-limit-fixes.md）。
 * 差分发现我方生产编码与编辑器三处不一致：元素多写 alreadySetVal=1、itemType.type_server.kind=0、
 * bInt.val=0（显式 0）；GraphVariable 多写 exposed=false/structId=0。修复后 GraphVariable 记录与
 * 编辑器样本逐字节一致。
 *
 * 测试：用真实管线（writeGiaFromIrJsonFile）把最小 IR 编成 .gia，重编码 GraphVariable 消息，
 * 断言与编辑器样本 hex 逐字节相等（编辑器/游戏内核验由用户执行，见 panorama 检查点）。
 *
 * Run: npx tsx tests/graph_variable_int_list_editor_wire_test.ts
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { writeGiaFromIrJsonFile } from '../src/compiler/ir_to_gia_pipeline.js'
import { loadGiaProto } from '../src/injector/proto.js'

// 编辑器样本 GraphVariable 记录 hex（map 1073741915 图 1「int50」，50×0，
// 快照 sha256 b7ca3d9fea0e1726dbd936fe1ceaf21d04d98ef0d94a03bb05a19d57080aef80）
const EDITOR_GRAPH_VARIABLE_HEX =
  '1205696e743530180822b20608924e100122070801a206020808ea06a0060a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b206000a0e080222070801a206020803b206000a0e080222070801a206020803b206000a0e' +
  '080222070801a206020803b2060038064006'

const ir = {
  ir_version: 1,
  ir_type: 'node_graph',
  graph: {
    type: 'server',
    mode: 'beyond',
    sub_type: 'entity',
    id: 1073741825,
    name: '_GSTS_int_list_editor_wire'
  },
  variables: [
    {
      name: 'int50',
      type: 'int_list',
      value: Array.from({ length: 50 }, () => 0)
    }
  ],
  nodes: [
    // irToGia 要求至少一个节点；用图变量 getter 占位（无消费者，纯数据节点不参与执行流）
    { id: 1, type: 'get_node_graph_variable', args: [{ type: 'str', value: 'int50' }] }
  ],
  edges: {}
}

const tmp = mkdtempSync(join(tmpdir(), 'gsts-graph-var-list-wire-'))
try {
  const irPath = join(tmp, 'case.json')
  writeFileSync(irPath, JSON.stringify(ir))
  const giaPath = join(tmp, 'case.gia')
  writeGiaFromIrJsonFile(irPath, giaPath, {}, () => {})

  const { rootMessage } = loadGiaProto()
  const bytes = new Uint8Array(readFileSync(giaPath))
  const root = rootMessage.decode(bytes.slice(20, -4))
  const graphValues = root.graph?.graph?.inner?.graph?.graphValues
  assert.ok(graphValues && graphValues.length === 1, 'graphValues must contain the int50 variable')

  const graphVarType = rootMessage.root.lookupType('GraphVariable')
  const reEncoded = Buffer.from(graphVarType.encode(graphValues[0]).finish()).toString('hex')
  assert.equal(
    reEncoded,
    EDITOR_GRAPH_VARIABLE_HEX,
    'GraphVariable record must be byte-identical to the editor sample'
  )

  // 结构断言（防 hex 漂移后无从定位）
  const values = graphValues[0].values
  assert.equal(values.class, 10002, 'list var class must be ArrayBase(10002)')
  assert.equal(values.bArray.entries.length, 50, '50 elements')
  for (const e of values.bArray.entries) {
    assert.equal(e.class, 2, 'element class IntBase(2)')
    // wire 级缺省已由上方 hex 全等断言锁定；解码侧默认值必须为 false（非显式 true）
    assert.equal(e.alreadySetVal, false, 'element alreadySetVal must decode as default(false)')
    assert.deepEqual(JSON.parse(JSON.stringify(e.bInt)), {}, 'zero int payload must be empty')
  }

  console.log(
    JSON.stringify({ giaPath, graphVariableHexLength: reEncoded.length, ok: true }, null, 2)
  )
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
