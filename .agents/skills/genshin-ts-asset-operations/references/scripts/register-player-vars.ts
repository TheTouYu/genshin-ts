#!/usr/bin/env npx tsx
// 玩家变量预注册（2026-08-30 手段3轮实证沉淀——预注册前置红线的执行脚本）
//
// 背景：DSL setCustomVariable/getCustomVariable（尤其客户端图读取）使用的自定义变量
// 必须先资产预注册（动态创建的变量客户端图不可见——3007/3008 受控差分定论，见
// asset-cli-reference.md §1「预注册前置红线」）。玩家模板 = prefab 1086324737「默认模版」，
// 需要顶层定义 + 实例容器副本两处都写（编辑器自动同步的等价物）。
//
// 前置：新地图需先有玩家模板组（assets:entities import 默认模版 + --definitions-gil 参考图）。
//
// 用法：npx tsx register-player-vars.ts <地图.gil> "变量名:类型=初始值;变量2:类型2" [--prefab <id>]
//   例：npx tsx register-player-vars.ts /path/1073741916.gil "d2c_counter:int=0;技能实例ID:int=0"
// 行为：prefab 顶层 upsert（applyCustomPrefabInitialCustomVariableDeclarations）→
//       全部玩家副本实体容器 upsert（assets:custom-variables --entity 循环，与编辑器
//       「修改任一自动同步全部副本」等价）→ Temp 同步 → 回读验证。
import { copyFileSync, writeFileSync, readFileSync } from 'fs'
import { execSync } from 'child_process'
import { createHash } from 'crypto'
import {
  applyCustomPrefabInitialCustomVariableDeclarations,
  readPlayerInitialCustomVariables
} from '../../../../../src/cli/gil_custom_variables.js'

const GIL = process.argv[2]
const varsArg = process.argv[3]
const prefabIdx = process.argv.indexOf('--prefab')
const PREFAB = prefabIdx > 0 ? Number(process.argv[prefabIdx + 1]) : 1086324737
if (!GIL || !varsArg) {
  console.error('用法: npx tsx register-player-vars.ts <地图.gil> "名:类型=值;..." [--prefab <id>]')
  process.exit(1)
}
const declarations = varsArg.split(';').map((s) => {
  const m = /^([^:=]+):([^=]+)(?:=(.*))?$/.exec(s.trim())
  if (!m) throw new Error(`[error] 变量声明格式: ${s}（应为 名:类型=初始值）`)
  const name = m[1], type = m[2] as any, raw = m[3]
  if (raw === undefined) return { name, type }
  // initialValue 按类型转运行时值（API 要求：int→bigint，float→number，bool→boolean，str→string）
  if (type === 'int') return { name, type, initialValue: BigInt(raw) }
  if (type === 'float') return { name, type, initialValue: Number(raw) }
  if (type === 'bool') return { name, type, initialValue: raw === 'true' }
  return { name, type, initialValue: raw }
})

console.log('before:', JSON.stringify(readPlayerInitialCustomVariables({ gilPath: GIL, playerPrefabId: PREFAB }).variables.map((v: any) => v.name)))

// ① prefab 顶层 upsert（API 返回 bytes，本脚本写回）
const r1 = applyCustomPrefabInitialCustomVariableDeclarations({ gilPath: GIL, prefabId: PREFAB, declarations })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const backupDir = GIL.slice(0, GIL.lastIndexOf('/')) + '/.gsts/backups'
execSync(`mkdir -p "${backupDir}"`)
copyFileSync(GIL, `${backupDir}/${GIL.split('/').pop()}.${stamp}.player-vars.bak`)
writeFileSync(GIL, r1.bytes)
console.log('top-level applied:', JSON.stringify(r1.changed))

// ② 全部玩家副本实体容器 upsert（对齐编辑器「任一修改同步全部副本」）
// 副本 = 引用同一 prefabId 的场景实体（1086324737..745 段；从地图实体列表动态发现，不硬编码）
// 仓库根 = 本脚本 5 层上溯（.agents/skills/<技能>/references/scripts/ → 根）
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const entitiesJson = execSync(`node bin/gsts.mjs assets:entities --gil "${GIL}" --format json`, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).toString()
const ids: number[] = JSON.parse(entitiesJson).entities
  .filter((e: any) => e.definitionId === PREFAB).map((e: any) => e.id)
console.log('player replicas:', ids.join(','))
for (const id of ids) {
  execSync(`node bin/gsts.mjs assets:custom-variables --entity ${id} --vars "${varsArg}" --gil "${GIL}" --write`, { cwd: REPO_ROOT, stdio: 'ignore' })
}
// ③ Temp 同步 + 回读
const temp = GIL.replace('/Beyond_Local_Save_Level/', '/Temp/')
try { copyFileSync(GIL, temp) } catch { /* 无 Temp 目录跳过 */ }
const after = readPlayerInitialCustomVariables({ gilPath: GIL, playerPrefabId: PREFAB })
console.log('after:', JSON.stringify(after.variables.map((v: any) => ({ name: v.name, type: v.type }))))
console.log('done. temp-synced:', temp)
