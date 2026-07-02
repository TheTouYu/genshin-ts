import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const file = process.argv[2]
const data = decode_gia_file(file)

const graph = data.graph
console.log('graph keys:', Object.keys(graph))
console.log('graph.graph keys:', Object.keys(graph.graph))

const main = graph.graph?.inner?.graph
if (main) {
  console.log('main graph keys:', Object.keys(main))
  console.log('main graph compositePins:', JSON.stringify(main.compositePins).substring(0, 200))
  console.log('main graph graphValues:', JSON.stringify(main.graphValues).substring(0, 200))
  
  // Check n=1 specifically
  const n1 = main.nodes.find((n: any) => n.nodeIndex === 1)
  if (n1) {
    console.log('n1 keys:', Object.keys(n1))
    // maybe pins is under a different path
    for (const key of Object.keys(n1)) {
      const val = n1[key]
      if (val && typeof val === 'object') {
        console.log(`n1.${key}:`, JSON.stringify(val).substring(0, 500))
      } else {
        console.log(`n1.${key}:`, val)
      }
    }
  }
  
  // Check all proto fields for a typical node
  const n2 = main.nodes.find((n: any) => n.nodeIndex === 2)
  if (n2) {
    console.log('n2 keys:', Object.keys(n2))
    for (const key of Object.keys(n2)) {
      const val = n2[key]
      if (val && typeof val === 'object') {
        const str = JSON.stringify(val).substring(0, 300)
        console.log(`n2.${key}: ${str}`)
      }
    }
  }
}
