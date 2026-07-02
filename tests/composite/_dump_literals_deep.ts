import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { NODE_PIN_RECORDS } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'
import { NODE_ID } from '../../dist/src/compiler/gia_vendor.js'

const file = process.argv[2]
const data = decode_gia_file(file)

const nameMap = new Map<number, string>()
for (const rec of NODE_PIN_RECORDS) {
  if (rec.name && !nameMap.has(rec.id)) nameMap.set(rec.id, rec.name)
}
for (const [key, id] of Object.entries(NODE_ID)) {
  if (typeof id !== 'number') continue
  if (!nameMap.has(id)) nameMap.set(id, key.replace(/__Generic$/, '').replace(/_/g, ' '))
}

const compositeNames = new Map<number, string>()
const compositeDefs = new Map<number, any>()
for (const a of data.accessories ?? []) {
  const id = a.id?.id
  const def = a.compositeDef?.inner?.def
  if (def && id != null) {
    compositeNames.set(id, def.name)
    compositeDefs.set(id, def)
  }
}

const mainGraph = data.graph?.graph?.inner?.graph
const nodes = mainGraph?.nodes ?? []
const nodeMap = new Map<number, any>()
for (const n of nodes) nodeMap.set(n.nodeIndex, n)

function resolveName(n: any): string {
  if (!n) return '?'
  const nid = n.genericId?.nodeId
  const kind = n.genericId?.kind
  if (nid == null) return `kind=${n.genericId?.kind}`
  if (kind === 22001) {
    const cname = compositeNames.get(nid)
    if (cname) return `复合:${cname}`
    return `compositeId=${nid}`
  }
  return nameMap.get(nid) ?? `nid=${nid}`
}

function valString(v: any, depth = 0): string {
  if (!v) return '?'
  if (depth > 3) return '...'
  
  const indent = '  '.repeat(depth)
  
  // Check bEnum
  if (v.bEnum?.val != null) return `enum=${v.bEnum.val}`
  // Check bString
  if (v.bString?.val != null) return `"${v.bString.val}"`
  // Check bInt
  if (v.bInt?.val != null) return `${v.bInt.val}`
  // Check bFlt
  if (v.bFlt?.val != null) return `${v.bFlt.val}`
  // Check bBool
  if (v.bBool?.val != null) return `${v.bBool.val}`
  // Check bConcreteValue
  if (v.bConcreteValue) {
    const cv = v.bConcreteValue
    // If it references a graph variable
    if (cv.indexOfConcrete != null) {
      // Look up graphValues
      const gv = mainGraph?.graphValues ?? []
      if (gv[cv.indexOfConcrete - 1]) {
        const name = gv[cv.indexOfConcrete - 1].name
        return `var:${name} (index=${cv.indexOfConcrete})`
      }
      return `concreteIndex=${cv.indexOfConcrete}`
    }
    if (cv.value) {
      // Array
      if (cv.value.bArray?.entries) {
        const entries = cv.value.bArray.entries
        const results = entries.map((e: any) => {
          if (e.bString?.val != null) return `"${e.bString.val}"`
          if (e.bInt?.val != null) return `${e.bInt.val}`
          if (e.bEnum?.val != null) return `enum=${e.bEnum.val}`
          return '?'
        })
        return `[${results.join(', ')}]`
      }
      // Single value
      return valString(cv.value, depth + 1)
    }
  }
  // Check bArray directly
  if (v.bArray?.entries) {
    return `[${v.bArray.entries.length} items]`
  }
  
  // Try to stringify
  const s = JSON.stringify(v).substring(0, 80)
  return `{${s}}`
}

// Check specific nodes
const targets = [7, 11, 12, 19, 23, 29, 41, 45, 46, 47, 48]
for (const idx of targets) {
  const n = nodeMap.get(idx)
  if (!n) continue
  const name = resolveName(n)
  
  // Get input types
  const nid = n.genericId?.nodeId
  let inputTypes: string[] = []
  for (const rec of NODE_PIN_RECORDS) {
    if (rec.id === nid) { inputTypes = rec.inputs ?? []; break }
  }

  console.log(`n=${idx}  ${name}  nid=${nid}`)
  if (inputTypes.length > 0) console.log(`  inputs: [${inputTypes.join(', ')}]`)
  
  for (const pin of n.pins ?? []) {
    if (pin.i1?.kind !== 3) continue
    const pIdx = pin.i1?.index ?? -1
    const typeStr = inputTypes[pIdx] ?? '?'
    const conns = pin.connects ?? []
    
    if (conns.length > 0) {
      const src = nodeMap.get(conns[0].id)
      if (src) console.log(`  InParam[${pIdx}] (${typeStr}) <- n=${conns[0].id}  ${resolveName(src)}`)
      else console.log(`  InParam[${pIdx}] (${typeStr}) <- n=${conns[0].id}`)
    } else if (pin.value) {
      const vs = valString(pin.value)
      // For deeper analysis, also show raw for complex values
      if (vs.length > 60) {
        console.log(`  InParam[${pIdx}] (${typeStr}) = ${vs}`)
        // No need to dump raw if it's already a variable name
      } else {
        // Check if the value has bConcreteValue with value containing more info
        const cv = pin.value.bConcreteValue?.value
        if (cv?.bString?.val != null) {
          console.log(`  InParam[${pIdx}] (${typeStr}) = "${cv.bString.val}"`)
        } else if (cv?.bEnum?.val != null) {
          console.log(`  InParam[${pIdx}] (${typeStr}) = enum ${cv.bEnum.val}`)
        } else if (cv?.bInt?.val != null) {
          console.log(`  InParam[${pIdx}] (${typeStr}) = ${cv.bInt.val}`)
        } else if (cv?.bFlt?.val != null) {
          console.log(`  InParam[${pIdx}] (${typeStr}) = ${cv.bFlt.val}`)
        } else if (cv?.bBool?.val != null) {
          console.log(`  InParam[${pIdx}] (${typeStr}) = ${cv.bBool.val}`)
        } else {
          console.log(`  InParam[${pIdx}] (${typeStr}) = ${vs}`)
        }
      }
    }
  }
  console.log()
}

// Also check composite def input names for the composite instances
console.log('=== 复合节点 InParam 定义名 ===')
const compTargets = [2, 4, 5, 8, 11, 12, 29, 30, 40, 43, 52]
for (const idx of compTargets) {
  const n = nodeMap.get(idx)
  if (!n) continue
  if (n.genericId?.kind !== 22001) continue
  const cid = n.genericId.nodeId
  const def = compositeDefs.get(cid)
  if (def) {
    console.log(`n=${idx}  复合:${compositeNames.get(cid)} (id=${cid})`)
    console.log(`  inputs:`)
    for (let i = 0; i < (def.inputs ?? []).length; i++) {
      const inp = def.inputs[i]
      console.log(`    InParam[${i}] "${inp.name ?? ''}"`)
    }
    console.log(`  outputs:`)
    for (let i = 0; i < (def.outputs ?? []).length; i++) {
      const out = def.outputs[i]
      console.log(`    OutParam[${i}] "${out.name ?? ''}"`)
    }
    console.log()
  }
}
