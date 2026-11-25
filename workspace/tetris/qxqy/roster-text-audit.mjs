// Actual simulator font/layout audit. Run from any cwd; no game-file writes.
import fs from 'node:fs'
import {fileURLToPath} from 'node:url'
const {createStudio}=await import(new URL('../../../../miliastra-beyond-simulator/studio/index.js',import.meta.url))
const root=fileURLToPath(new URL('../',import.meta.url))
const save=JSON.parse(fs.readFileSync(new URL('../tetris.save.json',import.meta.url),'utf8'))
for(const name of ['view_kit','view_roster']) {
  const path='lua/tetris/'+name+'.lua'
  if(save.assets.scripts.find(s=>s.path===path)?.source!==fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'))
    throw Error('Stale embedded source: '+path)
}
const canvases=['pc-16-9','mobile-16-9','mobile-19.5-9','mobile-2400-1080']
const failures=[];let count=0
for(const canvasId of canvases) {
  const studio=createStudio(save,{workspacePath:root})
  try {
    studio.playStart({canvasId})
    for(let i=0;i<22;i++)studio.playStep(1/30,{observe:false})
    studio.playKey('KeyboardCraftspersonKey16Down',{observe:false})
    for(let role=1;role<=4;role++) {
      studio.playClick('charRow'+role+'Hit',{observe:false})
      for(let tab=1;tab<=5;tab++) {
        studio.playClick('charTab'+tab+'Hit',{observe:false})
        const nodes=studio.playGet({view:true}).scene.nodes.filter(n=>n.name?.startsWith('char')&&n.text)
        if(!nodes.some(n=>n.name==='charItemL1_1'))throw Error('Missing roster body')
        for(const n of nodes) {
          count++
          if(!n.textLayout?.fits)failures.push({canvasId,role,tab,name:n.name,text:n.text,layout:n.textLayout})
        }
      }
    }
  } finally {studio.playStop()}
}
const result={canvases,roles:4,tabs:5,count,failures}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2))
console.log(JSON.stringify(result,null,2))
if(!count||failures.length)process.exitCode=1
