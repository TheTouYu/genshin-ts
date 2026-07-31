// @ts-nocheck

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const { compileTsToGs } = await import('../dist/src/compiler/ts_to_gs_pipeline.js' as string)
const { buildServerGraphRegistriesIRDocuments } = await import(
  '../dist/src/runtime/core.js' as string
)

const motions = Array.from({ length: 20 }, (_, index) => `motion-${index + 1}`)
const branches = motions
  .map(
    (motion, index) => `${index === 0 ? 'if' : 'else if'} (evt.motionDeviceName === '${motion}') {
      f.callComposite(markMotionStopped, { pivot })
      f.set('lastMotion', evt.motionDeviceName)
      f.addTargetOrientedRotationBasedMotionDevice(
        pivot,
        'next-${motion}',
        1,
        f.create3dVector(0, 90, 0)
      )
      f.printString('handled-${motion}')
    }`
  )
  .join(' ')
const source = `
import { g } from 'genshin-ts/runtime/core'

const markMotionStopped = g.defineComposite('mark motion stopped', {
  inputs: { pivot: { type: 'entity' } },
  build(_args, f) {
    f.printString('composite called')
    return {}
  }
})

g.server({
  name: 'long motion stop handler',
  id: 1073742423,
  variables: { pivot: entity(0), lastMotion: str('') }
}).on('whenBasicMotionDeviceStops', (evt, f) => {
  const pivot = f.get('pivot')
  ${branches}
})
`

const dir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-long-motion-stop-handler-'))
const entryFile = path.join(dir, 'fixture.ts')
const outDir = path.join(dir, 'out')
fs.writeFileSync(entryFile, source)

try {
  const result = await compileTsToGs({
    cfgDir: process.cwd(),
    cfg: {
      compileRoot: '.',
      entries: [path.relative(process.cwd(), entryFile)],
      outDir: path.relative(process.cwd(), outDir),
      options: { optimize: { precompileExpression: false, removeUnusedNodes: false } }
    }
  })

  let docs
  try {
    await import(pathToFileURL(result.entryOutFiles[0]).href)
    docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'long motion stop handler' })
  } catch (error) {
    assert.doesNotMatch(String(error), /arg\.getMetadata is not a function/)
    throw error
  }

  const doc = docs.find((candidate) => candidate.graph?.name?.includes('long motion stop handler'))
  assert.ok(doc)
  const handled = new Set(
    doc.nodes
      ?.filter((node) => node.type === 'print_string')
      .map((node) => node.args?.[0]?.value)
      .filter((value): value is string => typeof value === 'string' && value.startsWith('handled-'))
  )
  assert.deepEqual(handled, new Set(motions.map((motion) => `handled-${motion}`)))
  assert.equal(doc.nodes?.filter((node) => node.type === 'double_branch').length, motions.length)
  assert.equal(
    doc.nodes?.filter((node) => node.type === '__composite_call__').length,
    motions.length
  )
} finally {
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log('PASS long motion-device stop handler preserves all 20 composite branches')
