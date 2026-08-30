// 核验 CLI 入口（门 D4：headless/CI 运行 + 自动判分 + 退出码）
// 用法：npm run football:sim [-- --gate A,B,C,D|all] [--out <dir>]
import { Harness, writeTextFile } from './harness.js'
import { runGateA } from './gates-a.js'
import { runGateB } from './gates-b.js'
import { runGateC } from './gates-c.js'
import { runGateD } from './gates-d.js'
import { generateReport } from './report.js'

const args = process.argv.slice(2)
function argOf(name: string, def: string): string {
  const i = args.indexOf('--' + name)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const gateArg = argOf('gate', 'all')
const outDir = argOf('out', 'examples/football/sim/reports')
const gates = gateArg === 'all' ? ['A', 'B', 'C', 'D'] : gateArg.split(',').map((s) => s.trim().toUpperCase())

const h = new Harness(outDir)
console.log('物理足球 · 第一阶段物理核验（headless）')
console.log('  输出目录: ' + outDir + '， 门: ' + gates.join(','))

try {
  if (gates.includes('A')) runGateA(h)
  if (gates.includes('B')) runGateB(h)
  if (gates.includes('C')) runGateC(h)
  if (gates.includes('D')) runGateD(h)

  // D4：headless/CI 元用例——仅当四门全跑时纳入（单门运行时其它门缺席属预期，不判 FAIL）
  if (gates.includes('A') && gates.includes('B') && gates.includes('C') && gates.includes('D')) {
    const expected = ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'D1', 'D2', 'D3']
    const ids = new Set(
      h.results.map((r) => r.id.replace(/-[a-z0-9-]+$/i, '').replace(/^([A-E]\d+)[a-z]+$/i, '$1'))
    )
    const ranAll = gates.includes('A') && gates.includes('B') && gates.includes('C') && gates.includes('D')
    h.expectTrue(
      'D4',
      'D',
      '门 A、B 全部用例（含 C/D）可在 headless/CI 下运行并自动判分（CLI + 退出码）',
      '本 CLI 运行自身',
      '覆盖 ' + expected.join('/') + '，退出码 0=PASS/1=FAIL',
      ranAll && expected.every((e) => ids.has(e)),
      '本进程已 headless 执行 ' + h.results.length + ' 项用例（无渲染/无游戏依赖），覆盖 ' +
        Array.from(ids).sort().join('+') + '；退出码即判分结果',
      'npm run football:sim'
    )
  }
} catch (err) {
  h.expectTrue('EXCEPTION', 'X', '执行过程抛出异常（视为 FAIL）', '—', '无异常',
    false, String(err), 'npm run football:sim')
}

// 报告
const report = generateReport(h, outDir, {
  nodeVersion: process.version,
  platform: process.platform + ' ' + process.arch,
  command: 'npm run football:sim' + (gateArg === 'all' ? '' : ' -- --gate ' + gateArg)
})
writeTextFile(outDir + '/verification-report.md', report)

const counts = h.counts()
console.log('')
console.log('========================================')
console.log('  总判定: ' + (h.totalJudge() === 'PASS' ? 'PASS ✅' : 'FAIL ❌') +
  '   （PASS ' + counts.pass + ' / FAIL ' + counts.fail + ' / 观察 ' + counts.observed + '）')
console.log('  报告: ' + outDir + '/verification-report.md')
console.log('========================================')
process.exit(h.totalJudge() === 'PASS' ? 0 : 1)
