import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 监听参数消费 focused regression（工作包步骤 9）。
 *
 * 覆盖 2026-08-02 真实相邻快照闭合的 9 参数消费编码规则（见
 * docs/game-engine-knowledge/signals.md「已验证的监听参数消费」）：
 *
 * - 仅给信号名即可解析 monitorId 与信号名 pinIndex（监听节点 genericId=concreteId=monitorId）；
 * - 9 参数输出 OutParam[3..11] 连续、VarType 映射、18 族 concreteId 变体；
 * - connect=源 OutParam index；connect2=源 index，例外 str→3 / entity→4（经验规则）；
 * - 正式 GIA 包装（fileType=3、Root/inner graph id、filePath、gameVersion）合法；
 * - 临时 GIL 注入后目标 NodeGraph 与候选严格 protobuf 一致；
 * - 未知图/缺失 donor 时 fail closed（非零退出）。
 *
 * 直接运行 `replay-listener-signal.ts`（技能脚本，规则唯一实现点），夹具为真实地图
 * 1073741849 裁剪副本（仅保留图 1073741842 与全部注册定义/索引，其余字节原样）。
 *
 * Run:
 *   npx tsx tests/signal_consumption_replay_regression.ts
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const fixturePath = path.join(here, 'fixtures/signals/monitor-consume-donor.gil')
const replayScript = path.join(
  repoRoot,
  '.agents/skills/editor-incremental-gia-investigator/scripts/replay-listener-signal.ts'
)
const GRAPH_ID = 1073741842

// 闭和消费规则表（与 replay 脚本 CONSUME_18_SPECS / 180 族规格一致）
const MODES: Record<string, { genericId: number; concreteId?: number; type: number }> = {
  'consume-int': { genericId: 180, type: 3 },
  'consume-float': { genericId: 180, type: 5 },
  'consume-str': { genericId: 18, concreteId: 2656, type: 6 },
  'consume-bool': { genericId: 18, concreteId: 18, type: 4 },
  'consume-guid': { genericId: 18, concreteId: 2658, type: 2 },
  'consume-entity': { genericId: 18, concreteId: 2657, type: 1 },
  'consume-prefab': { genericId: 18, concreteId: 2669, type: 21 },
  'consume-config': { genericId: 18, concreteId: 2668, type: 20 }
}

const fixtureBytes = new Uint8Array(fs.readFileSync(fixturePath))
const fixtureSha = createHash('sha256').update(fixtureBytes).digest('hex')
// 夹具为不可变证据：替换时必须同步更新该哈希，且只允许从新的真实地图快照重新裁剪。
assert.equal(
  fixtureSha,
  'ae28ffcdd20fb6f4e2872e95a6616d1945c10c83d99e73650f40c07a0a4423f0',
  'fixture hash changed; re-derive from the locked map snapshot, do not hand-edit'
)

function runReplay(mode: string, graphId: number, tmp: string): any {
  const giaOut = path.join(tmp, `${mode}.gia`)
  const gilOut = path.join(tmp, `${mode}.gil`)
  const result = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs'),
      replayScript,
      mode,
      fixturePath,
      fixturePath,
      String(graphId),
      giaOut,
      gilOut
    ],
    { cwd: repoRoot, encoding: 'utf8', timeout: 120_000 }
  )
  if (result.status !== 0) {
    throw new Error(
      `replay ${mode} exited ${result.status}: ${(result.stderr || result.stdout).slice(0, 800)}`
    )
  }
  const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf('{')))
  assert.equal(parsed.status, 'PASS', `${mode}: replay status`)
  assert.equal(Number(parsed.graphId), graphId, `${mode}: graphId`)
  return parsed
}

const tmp = mkdtempSync(path.join(os.tmpdir(), 'consume-regression-'))
const results: string[] = []
try {
  for (const [mode, spec] of Object.entries(MODES)) {
    const out = runReplay(mode, GRAPH_ID, tmp)
    assert.equal(out.mode, mode, `${mode}: mode echo`)
    assert.equal(
      Number(out.listener.monitorId),
      1610612754,
      `${mode}: monitorId must resolve from signal name only`
    )
    assert.equal(out.listener.signalName, '信号测试全参数', `${mode}: signal name`)
    assert.equal(Number(out.listener.signalVersion), 1, `${mode}: signalVersion preserved`)
    assert.equal(Number(out.listener.signalPinIndex), 99, `${mode}: signal-name compositePinIndex`)
    assert.equal(Number(out.addedNode.genericId), spec.genericId, `${mode}: consumer genericId`)
    if (spec.concreteId !== undefined) {
      assert.equal(Number(out.addedNode.concreteId), spec.concreteId, `${mode}: consumer concreteId`)
    }
    assert.equal(Number(out.addedNode.nodeIndex), 20, `${mode}: appended nodeIndex`)
    assert.equal(Number(out.connection.id), 10, `${mode}: connects.id -> listener nodeIndex`)
    assert.equal(Number(out.connection.connect.kind), 4, `${mode}: connect kind OutParam`)
    assert.equal(out.formalGia.fileType, 3, `${mode}: GIA fileType`)
    assert.equal(Number(out.formalGia.rootId), GRAPH_ID, `${mode}: Root graph identity`)
    assert.equal(Number(out.formalGia.innerGraphId), GRAPH_ID, `${mode}: inner graph identity`)
    assert.ok(out.formalGia.filePath, `${mode}: GIA filePath present`)
    assert.ok(out.formalGia.gameVersion, `${mode}: GIA gameVersion present`)
    // 输出文件必须真实落盘
    assert.ok(fs.existsSync(path.join(tmp, `${mode}.gia`)), `${mode}: gia written`)
    assert.ok(fs.existsSync(path.join(tmp, `${mode}.gil`)), `${mode}: gil written`)
    results.push(
      `${mode}: OutParam[${out.connection.connect.index}] c2=${out.connection.connect2.index} ` +
        `g=${out.addedNode.genericId} c=${out.addedNode.concreteId}`
    )
  }

  // fail closed：图不存在时不得产出候选
  const fail = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs'),
      replayScript,
      'consume-str',
      fixturePath,
      fixturePath,
      '999999',
      path.join(tmp, 'fail.gia'),
      path.join(tmp, 'fail.gil')
    ],
    { cwd: repoRoot, encoding: 'utf8', timeout: 60_000 }
  )
  assert.notEqual(fail.status, 0, 'unknown graph must fail closed (non-zero exit)')
  results.push('fail-closed: unknown graph rejected')

  console.log(
    ['signal monitor consume regression OK', ...results, `fixture=${fixtureSha.slice(0, 12)}`].join(
      '\n'
    )
  )
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}
