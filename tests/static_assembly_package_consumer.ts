import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporary = mkdtempSync(path.join(tmpdir(), 'gsts-package-consumer-'))
execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' })
const packOutput = execFileSync(
  'npm',
  ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary],
  { cwd: root, encoding: 'utf8' }
)
type PackMetadata = { filename: string; files: { path: string }[] }
function parsePack(output: string): PackMetadata {
  const parsed = JSON.parse(output) as [PackMetadata] | Record<string, PackMetadata>
  const metadata = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0]
  assert.ok(metadata, 'npm pack did not return package metadata')
  return metadata
}
const pack = parsePack(packOutput)
const tarball = path.join(temporary, pack.filename)
const packedFiles = new Set(pack.files.map((file) => file.path))
for (const required of [
  'bin/gsts.mjs',
  'dist/src/index.js',
  'dist/src/index.d.ts',
  'dist/src/cli/assets_static_assemblies.js',
  'types/gsts/index.d.ts',
  'schemas/static-assembly.schema.json',
  'schemas/static-assembly-inspection.schema.json',
  'schemas/static-assembly-plan.schema.json'
]) {
  assert.ok(packedFiles.has(required), `packed genshin-ts is missing ${required}`)
}

const createPack = parsePack(
  execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary], {
    cwd: path.join(root, 'create-genshin-ts'),
    encoding: 'utf8'
  })
)
for (const required of [
  'bin/create-genshin-ts.mjs',
  'templates/start/package.json',
  'templates/start/gsts.config.ts'
]) {
  assert.ok(
    createPack.files.some((file) => file.path === required),
    `packed create-genshin-ts is missing ${required}`
  )
}
const scaffoldConsumer = path.join(temporary, 'scaffold-consumer')
mkdirSync(scaffoldConsumer)
writeFileSync(
  path.join(scaffoldConsumer, 'package.json'),
  `${JSON.stringify({ private: true, dependencies: {} }, null, 2)}\n`
)
execFileSync('npm', ['install', '--ignore-scripts', path.join(temporary, createPack.filename)], {
  cwd: scaffoldConsumer,
  stdio: 'inherit'
})
execFileSync(path.join(scaffoldConsumer, 'node_modules/.bin/create-genshin-ts'), ['starter'], {
  cwd: temporary,
  stdio: 'inherit'
})
const starter = path.join(temporary, 'starter')
const packagePath = path.join(starter, 'package.json')
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as {
  dependencies: Record<string, string>
}
packageJson.dependencies['genshin-ts'] = `file:${tarball}`
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
execFileSync('npm', ['install', '--ignore-scripts'], { cwd: starter, stdio: 'inherit' })

writeFileSync(
  path.join(starter, 'package-consumer.ts'),
  `import type {
  GstsConfig,
  GstsStaticAssembly,
  GstsStaticAssemblyComponent,
  GstsStaticAssemblyItem,
  GstsStaticAssemblyStructure,
  GstsStaticColor
} from 'genshin-ts'

const color: GstsStaticColor = {
  enabled: true,
  rgb: 0xff0000,
  opacity: 100,
  overlay: 'overwrite'
}
const component: GstsStaticAssemblyComponent = { type: 'followMotion', preset: 'fullFollow' }
const item: GstsStaticAssemblyItem = { resourceId: 10009001, position: [0, 0, 0], color }
const structure: GstsStaticAssemblyStructure = {
  schemaVersion: 1,
  color,
  components: [component],
  items: [item]
}
const assembly: GstsStaticAssembly = {
  name: 'package consumer',
  prefabId: 1,
  templatePrefabId: 2,
  templateInstanceId: 3,
  templateName: 'template',
  position: [0, 0, 0],
  structureFile: './assemblies/example.json',
  definitionAuxiliaryIds: [4],
  instanceAuxiliaryIds: [5]
}
export default { compileRoot: '.', entries: [], outDir: './dist', assets: {
  staticAssemblies: [assembly]
} } satisfies GstsConfig
void structure
`
)
writeFileSync(
  path.join(starter, 'tsconfig.package-consumer.json'),
  `${JSON.stringify(
    {
      extends: './tsconfig.json',
      compilerOptions: { noEmit: true },
      include: ['./package-consumer.ts']
    },
    null,
    2
  )}\n`
)
execFileSync(
  path.join(starter, 'node_modules/.bin/tsc'),
  ['-p', 'tsconfig.package-consumer.json'],
  { cwd: starter, stdio: 'inherit' }
)
writeFileSync(
  path.join(starter, 'subpath-consumer.mjs'),
  `import { readGilPayloadFields } from 'genshin-ts/cli/gil_extract_utils.js'
import { readVarint } from 'genshin-ts/injector/binary.js'
import { loadGiaProto } from 'genshin-ts/injector/proto.js'
const urls = await Promise.all([
  import.meta.resolve('genshin-ts/cli/gil_extract_utils.js'),
  import.meta.resolve('genshin-ts/injector/binary.js'),
  import.meta.resolve('genshin-ts/injector/types.js'),
  import.meta.resolve('genshin-ts/injector/proto.js')
])
if (urls.some((url) => url.includes('.js.js') || !url.includes('/node_modules/genshin-ts/'))) {
  throw new Error('invalid installed subpath resolution: ' + urls.join(','))
}
if (typeof readGilPayloadFields !== 'function' || typeof readVarint !== 'function' || typeof loadGiaProto !== 'function') {
  throw new Error('installed public subpath exports are unavailable')
}
`
)
const subpath = execFileSync(process.execPath, ['subpath-consumer.mjs'], {
  cwd: starter,
  encoding: 'utf8'
})
assert.doesNotMatch(subpath, /\.js\.js/)
const minimalGil = path.join(starter, 'minimal.gil')
const header = Buffer.alloc(20)
header.writeUInt32BE(0x0326, 8)
const tail = Buffer.alloc(4)
tail.writeUInt32BE(0x0679)
writeFileSync(minimalGil, Buffer.concat([header, tail]))
const toolOutput = execFileSync(
  path.join(starter, 'node_modules/.bin/tsx'),
  ['tools/list-gil-node-graphs.ts', minimalGil],
  { cwd: starter, encoding: 'utf8' }
)
assert.deepEqual(JSON.parse(toolOutput).graphs, [])
assert.doesNotMatch(toolOutput, /\.js\.js/)
const help = execFileSync('npm', ['run', 'assets:static-assemblies', '--', '--help'], {
  cwd: starter,
  encoding: 'utf8'
})
assert.match(help, /assets:static-assemblies/)
console.log('static assembly package consumer test passed')
