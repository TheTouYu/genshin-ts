// 复合定义修改支持：forceFull 未调用复合也必须输出完整 impl（2026-08-21）
// 运行：npx tsx tests/composite/force-full-test.ts
import { g, buildServerGraphRegistriesIRDocuments, defineComposite } from '../../src/runtime/core.js'
import { compositeRegistry } from '../../src/runtime/composite_registry.js'

function resetRegistry(): void {
  for (const def of compositeRegistry.getAll()) {
    ;(compositeRegistry as any).definitions.delete?.(def.name)
  }
}

resetRegistry()

const force = defineComposite('force_full_未调用', {
  id: 1610700000,
  forceFull: true,
  build: (_i: any, f: any) => {
    f.printString('hello')
  }
})
const normal = defineComposite('normal_未调用', {
  id: 1610700001,
  build: (_i: any, f: any) => {
    f.printString('world')
  }
})

g.server({ name: 'force_test' }).on('whenEntityIsCreated', () => {})

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'force_test' })
const doc = docs.find((d: any) => (d.compositeDefs?.length ?? 0) > 0) as any
if (!doc) throw new Error('no compositeDefs')

const defs = doc.compositeDefs as any[]
const fd = defs.find((d: any) => d.id === force.id)
const nd = defs.find((d: any) => d.id === normal.id)

console.log('defs', defs.map((d: any) => ({ id: d.id, name: d.name, nodes: d.implNodes?.length ?? 0 })))
if (!fd || (fd.implNodes?.length ?? 0) === 0) throw new Error('forceFull def should be full')
if (!nd || (nd.implNodes?.length ?? 0) !== 0) throw new Error('normal uncalled def should be stub')
console.log('PASS: forceFull uncalled composite is emitted as full, normal uncalled stays stub')
