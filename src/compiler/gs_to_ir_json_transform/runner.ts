import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  buildClientGraphRegistriesIRDocuments,
  buildServerGraphRegistriesIRDocuments
} from '../../runtime/core.js'
import { setRuntimeOptions } from '../../runtime/runtime_config.js'

function defaultGraphNameFromEntryFile(entryFile: string): string {
  const base = path.basename(entryFile)
  // 否则会只去掉.ts
  if (base.toLowerCase().endsWith('.gs.ts')) {
    return base.slice(0, -'.gs.ts'.length)
  }
  return path.basename(entryFile, path.extname(entryFile))
}

async function main() {
  const [entryFile, outFile, compactFlag] = process.argv.slice(2)
  if (!entryFile || !outFile) {
    console.error('[error] entryFile and outFile are required')
    process.exit(1)
  }

  setRuntimeOptions({
    optimize: {
      precompileExpression: process.env.GSTS_PRECOMPILE_EXPR === '1',
      removeUnusedNodes: process.env.GSTS_REMOVE_UNUSED_NODES === '1'
    }
  })

  const entryUrl = pathToFileURL(entryFile).href
  await import(entryUrl)

  const space = compactFlag === '1' ? 0 : 2
  const documents = [
    ...buildServerGraphRegistriesIRDocuments({
      defaultName: defaultGraphNameFromEntryFile(entryFile)
    }),
    ...buildClientGraphRegistriesIRDocuments()
  ]
  const json = JSON.stringify(documents, null, space) + '\n'

  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, json, 'utf8')
  console.log(`[ok] ${outFile}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
