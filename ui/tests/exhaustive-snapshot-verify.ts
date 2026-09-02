/**
 * ui/tests/exhaustive-snapshot-verify.ts — 全量快照核验（票 04 加严版）
 *
 * 运行：npx tsx ui/tests/exhaustive-snapshot-verify.ts
 * 范围：.gsts/diff-exp/ui学习/ 下全部 80 个 .gil 快照。
 * 检查两层：
 *   1) 通用完整性：每个快照可构建语义视图；每条 root9 记录在 flat 中恰好出现一次；
 *      数值 id 无重复；无 unknown 误归类（fail-closed 只允许字符串 id 虚拟根/页签页面项）。
 *   2) 逐快照语义对照：重启 1–66 每轮人工差分结论（issues/01-02 轮次记录）对应的
 *      kind/role/path/props 必须出现；旧轮 1–10 至少覆盖浮窗/按钮概念存在性。
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { parseRoot9 } from '../src/record.js'
import { buildSemanticView } from '../src/tree.js'
import type { UiSemanticNode, UiSemanticView } from '../src/types.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const FIXTURES = path.join(ROOT, '.gsts', 'diff-exp', 'ui学习')

if (!fs.existsSync(FIXTURES)) {
  console.log('SKIP: .gsts/diff-exp/ui学习/ 不存在（本地快照核验需真实差分留存）')
  process.exit(0)
}

const files = fs
  .readdirSync(FIXTURES)
  .filter((f) => f.endsWith('.gil'))
  .sort()

function load(file: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(FIXTURES, file)))
}

function view(file: string): UiSemanticView {
  return buildSemanticView(load(file))
}

function node(v: UiSemanticView, id: number): UiSemanticNode | undefined {
  return v.flat.find((n) => n.id === id)
}

function expectNode(
  v: UiSemanticView,
  id: number,
  opts: {
    kind?: string
    role?: string
    pathIncludes?: string | string[]
    props?: Record<string, unknown>
  }
): UiSemanticNode {
  const n = node(v, id)
  assert.ok(n, `node ${id} missing`)
  if (opts.kind !== undefined)
    assert.equal(n.kind, opts.kind, `kind ${n.kind} != ${opts.kind} (id=${id})`)
  if (opts.role !== undefined)
    assert.equal(n.role, opts.role, `role ${n.role} != ${opts.role} (id=${id})`)
  if (opts.pathIncludes !== undefined) {
    const patterns = Array.isArray(opts.pathIncludes) ? opts.pathIncludes : [opts.pathIncludes]
    for (const pattern of patterns)
      assert.ok(n.path.includes(pattern), `path ${n.path} missing ${pattern}`)
  }
  if (opts.props !== undefined) {
    for (const [key, value] of Object.entries(opts.props)) {
      const actual = (n.props as Record<string, unknown>)[key]
      if (typeof value === 'number' && Math.abs((actual as number) - value) < 0.01) continue
      assert.deepEqual(actual, value, `props.${key} != ${String(value)} (id=${id})`)
    }
  }
  return n
}

function expectAbsent(v: UiSemanticView, id: number): void {
  assert.ok(!node(v, id), `node ${id} should be absent`)
}

function approx(
  v: UiSemanticView,
  id: number,
  field: 'position' | 'size',
  value: [number, number]
): void {
  const n = node(v, id)
  assert.ok(n?.geometry, `geometry missing id=${id}`)
  const actual = n.geometry![field]
  assert.ok(actual, `geometry.${field} missing id=${id}`)
  assert.ok(Math.abs(actual[0] - value[0]) < 0.05, `${field}[0] ${actual[0]} != ${value[0]}`)
  assert.ok(Math.abs(actual[1] - value[1]) < 0.05, `${field}[1] ${actual[1]} != ${value[1]}`)
}

function hasRecord(v: UiSemanticView, id: number): boolean {
  return v.flat.some((n) => n.id === id)
}

let passed = 0
function ok(label: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`ok ${passed} - ${label}`)
}

// ============ 1) 通用完整性（80 个全量） ============
for (const file of files) {
  ok(`通用: ${file}`, () => {
    const v = view(file)
    const p = parseRoot9(load(file))
    const recordIds = new Set(p.records.map((r) => r.id))
    const numeric = v.flat.filter((n) => typeof n.id === 'number')
    const seen = new Set<number>()
    for (const n of numeric) {
      assert.ok(!seen.has(n.id as number), `duplicate flat id ${n.id}`)
      seen.add(n.id as number)
    }
    for (const r of p.records)
      assert.ok(seen.has(r.id), `record ${r.id} (${r.kind}) missing from flat`)
    for (const n of numeric)
      assert.notEqual(n.kind, 'unknown', `numeric record ${n.id} classified unknown`)
  })
}

// ============ 2) 逐快照语义对照（重启轮 1–66 + 旧轮概念） ============

/** file 前缀 → 文件名匹配（文件名可含版本后缀差异） */
const checks: Array<{ file: string; label: string; fn: (v: UiSemanticView) => void }> = [
  {
    file: '1073741909.before-重启1-60a8692d.gil',
    label: 'before-重启1: 默认布局/库容器存在',
    fn: (v) => {
      expectNode(v, 1073741825, { kind: 'layout', pathIncludes: ['默认布局'] })
      expectNode(v, 1073741840, { kind: 'library' })
    }
  },
  {
    file: '1073741909.after-重启1-自定义布局-987a4388.gil',
    label: '重启1: 新增自定义布局1989+14官方克隆',
    fn: (v) => {
      expectNode(v, 1073741989, { kind: 'layout', pathIncludes: ['自定义布局'] })
      expectNode(v, 1073741990, { kind: 'official' })
      expectNode(v, 1073742003, { kind: 'official' })
    }
  },
  {
    file: '1073741909.after-重启2-自定义布局2-872ec254.gil',
    label: '重启2: 第二个自定义布局2004',
    fn: (v) => expectNode(v, 1073742004, { kind: 'layout' })
  },
  {
    file: '1073741909.after-重启4-默认布局自定义按钮-e645aefb.gil',
    label: '重启4: 官方自定义按钮2032=自定义按钮/official/布局',
    fn: (v) =>
      expectNode(v, 1073742032, {
        kind: 'custom-button',
        role: 'official',
        pathIncludes: ['默认布局']
      })
  },
  {
    file: '1073741909.after-重启5-按钮保存为模板-7e62741d.gil',
    label: '重启5: 2032升实例 / 2033模板',
    fn: (v) => {
      expectNode(v, 1073742032, { kind: 'custom-button', role: 'instance' })
      expectNode(v, 1073742033, {
        kind: 'custom-button',
        role: 'template',
        pathIncludes: ['控件模板']
      })
    }
  },
  {
    file: '1073741909.after-重启6-模板保存入库-cb6c78ae.gil',
    label: '重启6: 库实例2034',
    fn: (v) =>
      expectNode(v, 1073742034, {
        kind: 'custom-button',
        role: 'instance',
        pathIncludes: ['控件组库']
      })
  },
  {
    file: '1073741909.after-重启9-文本颜色-4ee67975.gil',
    label: '重启9: 素材文本框2036 文本大力射门!/红色',
    fn: (v) => {
      expectNode(v, 1073742036, {
        kind: 'material-member',
        props: { text: '大力射门!', color: '#F45D5D' }
      })
    }
  },
  {
    file: '1073741909.after-重启11-整体移动位置-88c2fc9f.gil',
    label: '重启11: 库实例2034 移动到 (92.63,448.71)',
    fn: (v) => approx(v, 1073742034, 'position', [92.63, 448.71])
  },
  {
    file: '1073741909.after-重启13-玩家细排位置-2f8f0205.gil',
    label: '重启13: 玩家拖动2032 到 (93.70,868.71)',
    fn: (v) => approx(v, 1073742032, 'position', [93.7, 868.71])
  },
  {
    file: '1073741909.after-重启14-删除布局按钮-4d848f3f.gil',
    label: '重启14: 删除2032（模板/库实例仍在）',
    fn: (v) => {
      expectAbsent(v, 1073742032)
      expectNode(v, 1073742033, { role: 'template' })
      expectNode(v, 1073742034, { role: 'instance' })
    }
  },
  {
    file: '1073741909.after-重启15-悬浮射击文本-951e07ad.gil',
    label: '重启15: 悬浮组的文本框素材2069 文本射击',
    fn: (v) => expectNode(v, 1073742069, { kind: 'material-member' })
  },
  {
    file: '1073741909.after-重启16-按下图片素材-e2afd1ad.gil',
    label: '重启16: 按下组2070+图片member2071',
    fn: (v) => {
      expectNode(v, 1073742070, { kind: 'material-group' })
      expectNode(v, 1073742071, { kind: 'material-member' })
    }
  },
  {
    file: '1073741909.after-重启19-图文输入框-a81cbfbf.gil',
    label: '重启19: 图文输入框2079=布局实例',
    fn: (v) => expectNode(v, 1073742079, { kind: 'input-box', pathIncludes: ['自定义布局'] })
  },
  {
    file: '1073741909.after-重启20-输入框文字颜色-e805d0cc.gil',
    label: '重启20: 2079 文字这是文字/颜色#386A3F',
    fn: (v) => expectNode(v, 1073742079, { props: { text: '这是文字', color: '#386A3F' } })
  },
  {
    file: '1073741909.after-重启21-插入图片-cde900f2.gil',
    label: '重启21: 2079 富文本 {5:img_1} 出现',
    fn: (v) => {
      const n = expectNode(v, 1073742079, { props: { text: '{5:img_1}这是文字' } })
      assert.ok(typeof n.props['richImages'] === 'number', 'richImages marker missing')
    }
  },
  {
    file: '1073741909.after-重启23-输入框存模板-2ac5a0b8.gil',
    label: '重启23: 2080模板/2081库实例/2079实例',
    fn: (v) => {
      expectNode(v, 1073742080, { kind: 'input-box', role: 'template' })
      expectNode(v, 1073742081, { kind: 'input-box', role: 'instance', pathIncludes: ['控件组库'] })
      expectNode(v, 1073742079, { role: 'instance' })
    }
  },
  {
    file: '1073741909.after-重启24-悬浮交互页-139e22a6.gil',
    label: '重启24: 悬浮页2083/固有容器2084/关闭按钮2085',
    fn: (v) => {
      expectNode(v, 1073742083, {
        kind: 'floating-page',
        role: 'official',
        pathIncludes: ['控件组库']
      })
      expectNode(v, 1073742084, { kind: 'container', pathIncludes: ['固有容器'] })
      expectNode(v, 1073742085, { kind: 'close-button' })
    }
  },
  {
    file: '1073741909.after-重启25-悬浮页同步模板-a5cd7b9e.gil',
    label: '重启25: 模板树2086-2088/实例侧升格',
    fn: (v) => {
      expectNode(v, 1073742086, {
        kind: 'floating-page',
        role: 'template',
        pathIncludes: ['控件模板']
      })
      expectNode(v, 1073742087, { kind: 'container' })
      expectNode(v, 1073742088, { kind: 'close-button' })
      expectNode(v, 1073742083, { role: 'instance' })
    }
  },
  {
    file: '1073741909.after-重启26-悬浮页加按钮-f0ddb622.gil',
    label: '重启26: 悬浮页按钮2089=固有容器下',
    fn: (v) =>
      expectNode(v, 1073742089, { kind: 'custom-button', pathIncludes: ['悬浮交互页', '固有容器'] })
  },
  {
    file: '1073741909.after-重启27-悬浮页同步按钮-991fd207.gil',
    label: '重启27: 模板侧按钮2090（路径=控件模板）',
    fn: (v) => expectNode(v, 1073742090, { kind: 'custom-button', pathIncludes: ['控件模板'] })
  },
  {
    file: '1073741909.after-重启28-悬浮按钮状态素材-127e82c2.gil',
    label: '重启28: 悬浮页按钮状态组2091/2093 + 成员',
    fn: (v) => {
      expectNode(v, 1073742091, { kind: 'material-group' })
      expectNode(v, 1073742093, { kind: 'material-group' })
      expectNode(v, 1073742092, { kind: 'material-member' })
      expectNode(v, 1073742094, { kind: 'material-member' })
    }
  },
  {
    file: '1073741909.after-重启29-悬浮页加页签-de3ffb3f.gil',
    label: '重启29: 页签2097 kind=320001',
    fn: (v) => expectNode(v, 1073742097, { kind: 'tab', props: { kindNumber: 320001 } })
  },
  {
    file: '1073741909.after-重启30-第二页签文本-e930c9fe.gil',
    label: '重启30: 页签2097 双页面',
    fn: (v) => {
      const n = expectNode(v, 1073742097, { kind: 'tab', props: { kindNumber: 320001 } })
      assert.ok((n.props['pages'] as unknown[]).length >= 2, 'pages should be >=2')
    }
  },
  {
    file: '1073741909.after-重启31-整体位置大小-a9fb4406.gil',
    label: '重启31: 页签2097 位置(541.43,611.96)/尺寸(959.29,106.79)',
    fn: (v) => {
      approx(v, 1073742097, 'position', [541.43, 611.96])
      approx(v, 1073742097, 'size', [959.29, 106.79])
    }
  },
  {
    file: '1073741909.after-重启32b-同步生效-6a9cd2e9.gil',
    label: '重启32b: 模板侧页签2098+素材组2103-2106',
    fn: (v) => {
      expectNode(v, 1073742098, { kind: 'tab', pathIncludes: ['控件模板'] })
      expectNode(v, 1073742103, { kind: 'material-group' })
      expectNode(v, 1073742106, { kind: 'material-member' })
    }
  },
  {
    file: '1073741909.after-重启33-页面容器-4590a9d2.gil',
    label: '重启33: 页面容器2107',
    fn: (v) => expectNode(v, 1073742107, { kind: 'container', pathIncludes: ['页面容器'] })
  },
  {
    file: '1073741909.after-重启34-页签复制到容器-e951a371.gil',
    label: '重启34: 页签副本2108=页面容器',
    fn: (v) => expectNode(v, 1073742108, { kind: 'tab', pathIncludes: ['页面容器'] })
  },
  {
    file: '1073741909.after-重启35-同步容器页签-6d09888c.gil',
    label: '重启35: 模板侧容器2109+页签2110',
    fn: (v) => {
      expectNode(v, 1073742109, { kind: 'container', pathIncludes: ['控件模板'] })
      expectNode(v, 1073742110, { kind: 'tab', pathIncludes: ['控件模板'] })
    }
  },
  {
    file: '1073741909.after-重启47-同步页签配置-8c2b8e4e.gil',
    label: '重启47: 模板侧页签2098 内容同步（路径=控件模板）',
    fn: (v) => expectNode(v, 1073742098, { kind: 'tab', pathIncludes: ['控件模板'] })
  },
  {
    file: '1073741909.after-重启51-消息队列-536528cb.gil',
    label: '重启51: 官方消息队列2132=默认布局',
    fn: (v) =>
      expectNode(v, 1073742132, {
        kind: 'message-queue',
        role: 'official',
        pathIncludes: ['默认布局']
      })
  },
  {
    file: '1073741909.after-重启52-队列位置大小-0ef16716.gil',
    label: '重启52: 队列2132 位置(791,754.5)/尺寸(369,69)',
    fn: (v) => {
      approx(v, 1073742132, 'position', [791, 754.5])
      approx(v, 1073742132, 'size', [369, 69])
    }
  },
  {
    file: '1073741909.after-重启53-队列项样式图片-c23fef5c.gil',
    label: '重启53: 队列样式组2133+图片member2134',
    fn: (v) => {
      expectNode(v, 1073742133, { kind: 'material-group' })
      expectNode(v, 1073742134, { kind: 'material-member' })
    }
  },
  {
    file: '1073741909.after-重启54-队列样式2-2a260b6c.gil',
    label: '重启54: 队列样式=2 / 样式二文本/字号30',
    fn: (v) => {
      const n = expectNode(v, 1073742132, {})
      assert.equal((n.props['styles'] as unknown[]).length, 2)
      expectNode(v, 1073742136, {
        kind: 'material-member',
        props: { text: '样式二', fontSize: 30 }
      })
    }
  },
  {
    file: '1073741909.after-重启55-队列显示项4-8a1ad24f.gil',
    label: '重启55: 队列 maxItems=4',
    fn: (v) => expectNode(v, 1073742132, { props: { maxItems: 4 } })
  },
  {
    file: '1073741909.after-重启56-队列限时显示-6331860c.gil',
    label: '重启56: 队列限时显示开',
    fn: (v) => expectNode(v, 1073742132, { props: { timedShow: true } })
  },
  {
    file: '1073741909.after-重启57-队列插入开头-1e9b73c3.gil',
    label: '重启57: 队列插入结尾→开头',
    fn: (v) => expectNode(v, 1073742132, { props: { insertAt: 'head' } })
  },
  {
    file: '1073741909.after-重启58-队列内容居中-3b7080d7.gil',
    label: '重启58: 队列 content align=center',
    fn: (v) => expectNode(v, 1073742132, { props: { align: 'center' } })
  },
  {
    file: '1073741909.after-重启59-输入框居中-1ba20a88.gil',
    label: '重启59: 输入框2079 align=center',
    fn: (v) => expectNode(v, 1073742079, { props: { align: 'center' } })
  },
  {
    file: '1073741909.after-重启60-样式二文本居中-77c88fc5.gil',
    label: '重启60: 样式二文本框2136 align=center',
    fn: (v) =>
      expectNode(v, 1073742136, {
        kind: 'material-member',
        props: { text: '样式二', align: 'center' }
      })
  },
  {
    file: '1073741909.after-重启61-队列新增消息项-48051914.gil',
    label: '重启61: 队列消息项=2',
    fn: (v) => {
      const n = expectNode(v, 1073742132, {})
      assert.equal((n.props['messages'] as unknown[]).length, 2)
    }
  },
  {
    file: '1073741909.after-重启62-消息配置样式-a5a14a7f.gil',
    label: '重启62: 消息项样式序号（消息项_1=样式一 / 消息项_2=样式二）',
    fn: (v) => {
      const n = expectNode(v, 1073742132, {})
      const messages = n.props['messages'] as Array<{ name?: string; styleIndex?: number }>
      const m1 = messages.find((m) => m.name === '消息项_1')
      const m2 = messages.find((m) => m.name === '消息项_2')
      assert.ok(m1 && m1.styleIndex === 1, '消息项_1 styleIndex should be 1')
      assert.ok(m2 && m2.styleIndex === 2, '消息项_2 styleIndex should be 2')
    }
  },
  {
    file: '1073741909.after-重启63-队列存模板同步-5572a5f9.gil',
    label: '重启63: 队列模板2137/库实例2142/布局实例2132',
    fn: (v) => {
      expectNode(v, 1073742137, { kind: 'message-queue', role: 'template' })
      expectNode(v, 1073742142, {
        kind: 'message-queue',
        role: 'instance',
        pathIncludes: ['控件组库']
      })
      expectNode(v, 1073742132, { role: 'instance' })
    }
  },
  {
    file: '1073741909.after-重启64-容器三控件-e4c92e39.gil',
    label: '重启64: 容器一文本2155/图片2156/输入框2157',
    fn: (v) => {
      expectNode(v, 1073742155, { kind: 'textbox', pathIncludes: ['固有容器'] })
      expectNode(v, 1073742156, { kind: 'image', pathIncludes: ['固有容器'] })
      expectNode(v, 1073742157, { kind: 'input-box', pathIncludes: ['固有容器'] })
    }
  },
  {
    file: '1073741909.after-重启65-删文本框-da17641a.gil',
    label: '重启65: 删除文本2155；图片/输入框保留',
    fn: (v) => {
      expectAbsent(v, 1073742155)
      expectNode(v, 1073742156, { kind: 'image' })
      expectNode(v, 1073742157, { kind: 'input-box' })
    }
  },
  {
    file: '1073741909.after-重启66-默认页签2-7468eadd.gil',
    label: '重启66: 默认选择=页签2（kind 320001 仍在）',
    fn: (v) => expectNode(v, 1073742097, { kind: 'tab', props: { kindNumber: 320001 } })
  },
  // 旧轮（08-26/27）：概念存在性
  {
    file: '1073741909.after-轮1.gil',
    label: '旧轮1: 悬浮页概念存在',
    fn: (v) =>
      assert.ok(
        hasRecord(v, 1073741846) || v.flat.some((n) => n.kind === 'floating-page'),
        'old round1 should contain floating page'
      )
  },
  {
    file: '1073741909.after-轮2.gil',
    label: '旧轮2: 页签/单选项存在',
    fn: (v) =>
      assert.ok(
        v.flat.some((n) => n.kind === 'tab'),
        'old round2 should contain tab'
      )
  }
]

for (const check of checks) {
  if (!files.includes(check.file)) {
    console.log(`skip ${check.label} (file not found)`)
    continue
  }
  ok(check.label, () => check.fn(view(check.file)))
}

console.log(`\nPASS ${passed} snapshot assertions over ${files.length} files`)
