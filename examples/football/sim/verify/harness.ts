// 验收 harness：用例注册/执行/判分/输出（第七节报告数据源）
// 每个用例必须给出实测数字；禁止只写"通过"。

export interface CaseResult {
  id: string
  gate: string
  title: string
  repro: string
  input: string
  expect: string
  measured: string
  status: 'PASS' | 'FAIL' | 'OBSERVED'
}

export class Harness {
  readonly results: CaseResult[] = []
  private outDir: string
  private csvCount = 0

  constructor(outDir: string) {
    this.outDir = outDir
  }

  add(r: CaseResult): void {
    this.results.push(r)
    const mark = r.status === 'PASS' ? '✓' : r.status === 'FAIL' ? '✗' : '○'
    console.log('  ' + mark + ' [' + r.id + '] ' + r.title + ' → ' + r.status + '  实测: ' + r.measured)
  }

  expectTrue(
    id: string,
    gate: string,
    title: string,
    input: string,
    expect: string,
    cond: boolean,
    measured: string,
    repro: string
  ): void {
    this.add({ id, gate, title, repro, input, expect, measured, status: cond ? 'PASS' : 'FAIL' })
  }

  expectClose(
    id: string,
    gate: string,
    title: string,
    input: string,
    expected: number,
    actual: number,
    tolRel: number,
    unit: string,
    repro: string
  ): void {
    const err = Math.abs(actual - expected)
    const rel = err / Math.max(Math.abs(expected), 1e-12)
    this.add({
      id,
      gate,
      title,
      repro,
      input,
      expect: expected.toFixed(6) + ' ' + unit + ' (±' + (tolRel * 100).toFixed(2) + '%)',
      measured: actual.toFixed(6) + ' ' + unit + ' (误差 ' + (rel * 100).toFixed(4) + '%)',
      status: rel <= tolRel ? 'PASS' : 'FAIL'
    })
  }

  expectRange(
    id: string,
    gate: string,
    title: string,
    input: string,
    lo: number,
    hi: number,
    actual: number,
    unit: string,
    repro: string
  ): void {
    this.add({
      id,
      gate,
      title,
      repro,
      input,
      expect: '[' + lo + ', ' + hi + '] ' + unit,
      measured: actual.toFixed(4) + ' ' + unit,
      status: actual >= lo && actual <= hi ? 'PASS' : 'FAIL'
    })
  }

  observed(id: string, gate: string, title: string, input: string, measured: string, repro: string): void {
    this.add({ id, gate, title, repro, input, expect: '观察项（记录现象）', measured, status: 'OBSERVED' })
  }

  counts(): { pass: number; fail: number; observed: number } {
    let pass = 0
    let fail = 0
    let observed = 0
    for (const r of this.results) {
      if (r.status === 'PASS') pass++
      else if (r.status === 'FAIL') fail++
      else observed++
    }
    return { pass, fail, observed }
  }

  totalJudge(): 'PASS' | 'FAIL' {
    return this.counts().fail === 0 ? 'PASS' : 'FAIL'
  }

  markdownTable(): string {
    const NL = String.fromCharCode(10)
    let out = '| 编号 | 复现命令/步骤 | 输入参数 | 期望值 | 实测值 | 判定 |' + NL
    out += '|---|---|---|---|---|---|' + NL
    for (const r of this.results) {
      out +=
        '| ' + r.id + ' | `' + r.repro + '` | ' + r.input + ' | ' + r.expect + ' | ' + r.measured +
        ' | ' + (r.status === 'PASS' ? '✅ Pass' : r.status === 'FAIL' ? '❌ Fail' : '👁 Observed') + ' |' + NL
    }
    return out
  }

  /** 遥测 CSV 落盘（每个数字结论可追溯） */
  writeCSV(name: string, content: string): string {
    const path = this.outDir + '/' + name
    writeTextFile(path, content)
    this.csvCount++
    return path
  }

  csvWritten(): number {
    return this.csvCount
  }
}

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export function writeTextFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
}

export const REPRO_BASE = 'npm run football:sim -- --gate'
