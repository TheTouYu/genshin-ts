/**
 * 构建前置守卫：保护手写 ambient 声明，避免被构建产物覆盖后静默产出。
 *
 * 事故背景（2026-09-16）：src/runtime/server_globals.d.ts 被 src/runtime/server_globals.ts 的
 * tsc 发射产物覆盖（sha256 12c67a03ce643966… 与 dist/src/runtime/server_globals.d.ts 逐字节相同），
 * 全套 DSL 全局（vec3/guid/int/float/dict/list/self/Mathf/setTimeout…）消失 → 5367 条 error TS、
 * tsc 非零退出 → build 脚本 `&&` 短路 → dist/ 永不更新（CLI 一直跑旧逻辑、源码改了而产物陈旧）。
 * 其中 5169 条是 TS2304「Cannot find name」假错，排查成本极高。
 *
 * 本守卫挂在 prebuild：fail closed，宁可构建显式报错，也不让损坏的声明参与编译。
 * 新增手写 ambient 声明文件时，把「文件 + 必须存在的哨兵字符串」加进 INVARIANTS。
 */
import { existsSync, readFileSync } from 'node:fs'

const INVARIANTS = [
  {
    file: 'src/runtime/server_globals.d.ts',
    needles: ['declare global', 'function vec3('],
    why: 'DSL 全局（vec3/guid/int/float/dict/list/self/Mathf/setTimeout…）的唯一声明处；被 server_globals.ts 的发射产物覆盖时这些都会消失'
  }
]

let failed = false
for (const { file, needles, why } of INVARIANTS) {
  if (!existsSync(file)) {
    console.error(`[ambient-guard] 缺少 ${file} —— ${why}`)
    failed = true
    continue
  }
  const text = readFileSync(file, 'utf8')
  const missing = needles.filter((needle) => !text.includes(needle))
  if (missing.length > 0) {
    console.error(`[ambient-guard] ${file} 缺少 ${missing.map((m) => `\`${m}\``).join('、')}`)
    console.error(`[ambient-guard] 疑似被构建产物/tsc 发射结果覆盖（${why}）`)
    console.error(`[ambient-guard] 修复：git checkout HEAD -- ${file}`)
    failed = true
  }
}

if (failed) {
  console.error('[ambient-guard] 构建中止：请先恢复手写声明，否则 tsc 会报出成百上千条假错。')
  process.exit(1)
}
console.log(`[ambient-guard] ${INVARIANTS.length} 个手写 ambient 声明完好`)
