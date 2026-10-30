#!/usr/bin/env node
// v5 机器审计（C 件）：对任意一帧快照输出 fail/warn/info 清单，有 fail 即退出码非 0。
//
// 用法：
//   node qxqy/audit-ui.mjs --dir docs/shots/v5-b1            # 审计整个出图批次（离线、零模拟器成本）
//   node qxqy/audit-ui.mjs --frame docs/shots/v5-b1/pc-16-9/game.frame.json
//   node qxqy/audit-ui.mjs --live --canvas mobile-19.5-9 --screen game
//   node qxqy/audit-ui.mjs --dir docs/shots/v5-b1 --overlay   # 额外落 *.audit.png（红=fail 橙=warn）
//   node qxqy/audit-ui.mjs --dir ... --expect pbtnleft,pbtnright,...   # 期望存在的控件名
//
// 六类判据（全部可复算，阈值可调）：
//   ① bounds   控件越界（画布外的可见控件；cursor 命中区越界只算 warn）
//   ② overlap  同屏可点区局部重叠（cursor/button/grid 命中盒两两相交；包含关系不算）
//   ③ text     textbox textLayout.fits=false 或文本宽 > 框宽-4（与 shot-style.mjs 同判据）
//   ④ names    名称为空 / 重名
//   ⑤ contrast 正文与正下方最近不透明底板亮度对比（WCAG 比值，<2 fail，<3 warn，禁用描边兜底）
//   ⑥ expect   应存在的控件缺失（移动端游戏屏默认校验 8 个手机按钮）
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CANVAS_PRESETS, PROJECT_ROOT, drawBoxes, decodePng, isMain } from './frame-strip.mjs'
import { captureCanvasScreen } from './shots-v5.mjs'

// v5.0 手机按钮实证名（cursor 命中区；见 docs/shots/*/game.frame.json 的 zones）
// v5：ui.lua 给按钮名加了分组前缀（padp / navn / acts），旧名 phleft 等已不存在。
// 这份清单是「手机按钮必须都在」的静态断言，改名时要同步更新（防改名后静默通过）。
const DEFAULT_EXPECT_MOBILE = [
  'phpadleft', 'phpadright', 'phpadrot', 'phpadsoft', 'phpadhard', 'phpadhold',
  'phpadskill1', 'phpadskill2', 'phpadswitch',
  'phnavhelp', 'phnavroster',
]
const EPS = 0.5

function argb(value) {
  if (value == null) return null
  const u = value >>> 0
  return { a: (u >>> 24) & 255, r: (u >>> 16) & 255, g: (u >>> 8) & 255, b: u & 255 }
}
function css({ r, g, b }) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}
function linear(ch) {
  const s = ch / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
function luminance({ r, g, b }) {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}
function over(fg, bg) {
  const a = (fg.a ?? 255) / 255
  return {
    a: 255,
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
  }
}
function contrastRatio(fg, bg) {
  const l1 = luminance(fg)
  const l2 = luminance(bg)
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}
const boxOf = (c) => (c && c.box ? { left: c.box.left, bottom: c.box.bottom, width: c.box.width, height: c.box.height } : null)
const boxRight = (b) => b.left + b.width
const boxTop = (b) => b.bottom + b.height
const contains = (b, x, y) => x >= b.left && x <= boxRight(b) && y >= b.bottom && y <= boxTop(b)
const validBox = (b) => b && b.width > 0 && b.height > 0

function intersectArea(a, b) {
  const w = Math.min(boxRight(a), boxRight(b)) - Math.max(a.left, b.left)
  const h = Math.min(boxTop(a), boxTop(b)) - Math.max(a.bottom, b.bottom)
  if (w <= EPS || h <= EPS) return 0
  return w * h
}
const areaOf = (b) => b.width * b.height


/**
 * 从渲染后的 PNG 像素里取「文字框底色」：框内像素按 8 级量化取众数；
 * 众数若接近文字色（小框被字占满）则取次众数。返回 {r,g,b,a:255} 或 null。
 */
export function sampleBackground(pixels, box, { canvasW, canvasH, fontColor } = {}) {
  if (!pixels || !pixels.data || !canvasW || !canvasH) return null
  const sx = pixels.width / canvasW
  const sy = pixels.height / canvasH
  const inset = 0.06
  const x0 = Math.round((box.left + box.width * inset) * sx)
  const x1 = Math.round((box.left + box.width * (1 - inset)) * sx)
  const y0 = Math.round((canvasH - (box.bottom + box.height * (1 - inset))) * sy)
  const y1 = Math.round((canvasH - (box.bottom + box.height * inset)) * sy)
  if (x1 <= x0 || y1 <= y0) return null
  if (x0 < 0 || y0 < 0 || x1 >= pixels.width || y1 >= pixels.height) return null
  const hist = new Map()
  const stepX = Math.max(1, Math.floor((x1 - x0) / 64))
  const stepY = Math.max(1, Math.floor((y1 - y0) / 64))
  let total = 0
  for (let y = y0; y <= y1; y += stepY) {
    for (let x = x0; x <= x1; x += stepX) {
      const i = (y * pixels.width + x) * 4
      const key = ((pixels.data[i] >> 3) << 10) | ((pixels.data[i + 1] >> 3) << 5) | (pixels.data[i + 2] >> 3)
      hist.set(key, (hist.get(key) || 0) + 1)
      total++
    }
  }
  if (!total) return null
  const dist = (key, c) => {
    const r = ((key >> 10) & 31) * 8 + 4
    const g = ((key >> 5) & 31) * 8 + 4
    const b = (key & 31) * 8 + 4
    return Math.hypot(r - c.r, g - c.g, b - c.b)
  }
  const rows = [...hist.entries()].sort((a, b) => b[1] - a[1])
  const pick = rows.find(([key]) => !fontColor || dist(key, fontColor) > 26) || rows[0]
  const key = pick[0]
  const share = pick[1] / total
  if (share < 0.12) return null                 // 底色不集中（渐变/花纹）⇒ 交给模型回退
  return {
    a: 255,
    r: ((key >> 10) & 31) * 8 + 4,
    g: ((key >> 5) & 31) * 8 + 4,
    b: (key & 31) * 8 + 4,
  }
}

/**
 * 审计一帧。frame 结构见 qxqy/shots-v5.mjs:frameOf：
 *  { screen, canvas:{id,width,height,mobile}, nodes[], controls[], zones[], texts[] }
 */
export function auditFrame(frame, opts = {}) {
  const {
    pixels = null, waiver = null, expect = [], specContrast = null, contrastFail = 1.5, contrastWarn = 2.6, minOverlapRatio = 0.15, overlapWarnRatio = 0.02,
    baseColor = { a: 255, r: 24, g: 30, b: 42 }, outlineRelief = 1.25,
  } = opts
  const canvas = frame.canvas || {}
  const W = Number(canvas.width) || 0
  const H = Number(canvas.height) || 0
  const controls = frame.controls || []
  const nodes = frame.nodes || []
  const issues = []
  const add = (level, code, target, message, extra = {}) => issues.push({ level, code, target, message, ...extra })

  const byName = new Map()
  for (const c of controls) {
    if (!c.name) continue
    if (!byName.has(c.name)) byName.set(c.name, [])
    byName.get(c.name).push(c)
  }
  const sceneByName = new Map()
  for (const n of nodes) sceneByName.set(n.name, n)
  // 遮罩检测：全屏 dim/mask 层存在时，底板被压暗 ⇒ 对比度读数降级为 warn（否则会把「遮罩生效」误读成配色缺陷）
  const dimOverlay = controls.find((c) => /(dim|scrim|veil|shade|mask)/i.test(c.name || '') &&
    validBox(boxOf(c)) && c.active !== false && c.visible !== false &&
    areaOf(boxOf(c)) >= 0.6 * Math.max(1, W * H))

  // ① 越界。分级依据（实测过才这么分）：
  //   · 完全在画布外 = info「停放隐藏」——本工程用「挪出画布」当 visible=false 的替代
  //     （lua/main.lua:3633 空槽 SetSizeDelta(1,1)+SetAnchoredPosition(0,-4000)），不是 bug；
  //   · 部分出界：textbox 不按盒判（实测 ihud 盒宽 640/文字仅 ~200，盒出界 90px 而字完整可见），
  //     文字截断由 ③ text 判据（fits/textWidth）负责；
  //   · 可见 image 局部出界只 warn（背景装饰/画布出血是常见手法）；
  //   · 可点区有 ≥25% 面积在画布外 = fail（那块点不到）。
  const DECOR = /(^bg|deco|decor|star|sky|wall|wash|glow|ring|blob|cloud|dot)/i
  if (W > 0 && H > 0) {
    for (const c of controls) {
      const b = boxOf(c)
      if (!validBox(b)) continue
      const outside = {
        left: Math.max(0, -b.left), right: Math.max(0, boxRight(b) - W),
        bottom: Math.max(0, -b.bottom), top: Math.max(0, boxTop(b) - H),
      }
      const worst = Math.max(outside.left, outside.right, outside.bottom, outside.top)
      if (worst <= 2) continue
      const insideW = Math.max(0, Math.min(boxRight(b), W) - Math.max(b.left, 0))
      const insideH = Math.max(0, Math.min(boxTop(b), H) - Math.max(b.bottom, 0))
      const insideFrac = areaOf(b) ? (insideW * insideH) / areaOf(b) : 0
      const col = argb(c.imageColor)
      const isVisibleImage = c.kind === 'image' && col && col.a > 0
      const isZone = c.kind === 'cursor' || c.kind === 'button' || c.kind === 'grid'
      const isText = (c.kind === 'textbox' || c.kind === 'textwindow') && c.text
      if (insideFrac === 0) {
        add('info', 'bounds', c.name, `${c.kind} 整块在画布外（停放隐藏，不参与画面）`, { box: b })
        continue
      }
      if (isZone && insideFrac < 0.75) {
        add('fail', 'bounds', c.name, `可点区 ${(100 - insideFrac * 100).toFixed(0)}% 在画布外（点不到）`, { box: b })
      } else if (isVisibleImage && !DECOR.test(c.name || '') && insideFrac < 0.7) {
        add('fail', 'bounds', c.name, `可见控件 ${(100 - insideFrac * 100).toFixed(0)}% 出画布 ${worst.toFixed(0)}px`, { box: b })
      } else if (isText) {
        add('warn', 'bounds', c.name, `textbox 盒越界 ${worst.toFixed(0)}px（盒≠字宽，看 text 判据）`, { box: b })
      } else {
        add('warn', 'bounds', c.name, `${c.kind} 局部越界 ${worst.toFixed(1)}px（画布出血/装饰）`, { box: b })
      }
    }
  }

  // ② 同屏可点区局部重叠：只拿真实命中区（cursor/button/grid）两两比；
  //    包含关系（热区套按钮）不算问题，局部相交 >15% 较小盒面积 = fail，>2% = warn。
  // 只在「真的在画布上」的命中区之间比：本工程用「挪到画布外」当 visible=false
  // （实测 phhold/phsoft/… 空槽全部停在 bottom=-3676，两个 parked 热区互相重叠没有意义）。
  const onCanvas = (b) => {
    if (!W || !H) return true
    const iw = Math.max(0, Math.min(boxRight(b), W) - Math.max(b.left, 0))
    const ih = Math.max(0, Math.min(boxTop(b), H) - Math.max(b.bottom, 0))
    return areaOf(b) ? (iw * ih) / areaOf(b) >= 0.5 : false
  }
  const hitZones = controls
    .filter((c) => c.kind === 'cursor' || c.kind === 'button' || c.kind === 'grid')
    .filter((c) => c.active !== false && c.visible !== false && validBox(boxOf(c)) && onCanvas(boxOf(c)))
  for (let i = 0; i < hitZones.length; i++) {
    for (let j = i + 1; j < hitZones.length; j++) {
      const a = boxOf(hitZones[i])
      const b = boxOf(hitZones[j])
      const inter = intersectArea(a, b)
      if (inter <= 0) continue
      const smaller = Math.min(areaOf(a), areaOf(b))
      const ratio = smaller ? inter / smaller : 0
      if (ratio >= 0.98) continue                       // 完全包含/重合 = 分层热区，不算冲突
      if (ratio < overlapWarnRatio) continue
      const level = ratio >= minOverlapRatio ? 'fail' : 'warn'
      add(level, 'overlap', `${hitZones[i].name} ∩ ${hitZones[j].name}`,
        `可点区重叠 ${inter.toFixed(0)}px² = 较小盒的 ${(ratio * 100).toFixed(1)}%（点下去只有上层收得到）`,
        { box: a, box2: b, ratio })
    }
  }

  // ③ textbox 适配：fits=false 或文本宽超框（shot-style.mjs 同判据）
  for (const n of nodes) {
    if (n.kind !== 'textbox' || !n.text) continue
    const tl = n.textLayout || {}
    const need = (n.fontSize || 0) * 1.45 + 4
    const box = boxOf(byName.get(n.name)?.[0])
    const shortBy = (n.sourceHeight != null && tl.requiredHeight != null) ? tl.requiredHeight - n.sourceHeight : 0
    // 停放隐藏（整块在画布外）的控件用户看不到 ⇒ 裁切只记 info「潜在」，
    // 不能让它冒充可见缺陷（本工程用挪出画布当 hidden：ikeyA 在移动端 x=-3320，PC 端才在画布上）
    const parkedText = (() => {
      if (!W || !H || !box) return false
      const iw = Math.max(0, Math.min(boxRight(box), W) - Math.max(box.left, 0))
      const ih = Math.max(0, Math.min(boxTop(box), H) - Math.max(box.bottom, 0))
      return iw * ih === 0
    })()
    const clipped = tl.textWidth != null && n.sourceWidth != null && tl.textWidth > n.sourceWidth - 4
    // 判据分级：文本宽超框 = fail（字被截）；行高不够 >1.5px = fail（整行会被裁）；
    // 只差 1px 之内的 fits=false = warn（运行时按 visibleLineCount 仍会画，实测 ikeyA 可见）。
    if (parkedText) {
      if (clipped || shortBy > 1.5 || tl.fits === false) {
        add('info', 'text', n.name, `停放隐藏，但文案会裁切（需高 ${tl.requiredHeight ?? '-'} vs 框 ${n.sourceHeight}）——一旦显示就会截断`, { box })
      }
    } else if (clipped || shortBy > 1.5 || (tl.fits === false && shortBy > 1.5)) {
      add('fail', 'text', n.name, `「${n.text}」size=${n.fontSize} 框=${n.sourceWidth}x${n.sourceHeight} ` +
        `需高=${tl.requiredHeight ?? need.toFixed(1)} (差 ${shortBy.toFixed(1)}px) fits=${tl.fits} 文本宽=${tl.textWidth}/${n.sourceWidth}`, { box })
    } else if (tl.fits === false) {
      add('warn', 'text', n.name, `「${n.text}」size=${n.fontSize} 框高 ${n.sourceHeight} vs 需 ${tl.requiredHeight ?? '-'}（差 ${shortBy.toFixed(1)}px，临界）`, { box })
    }
  }

  // ④ 名称：空名 / 重名（重名会让日志与用例锚点歧义，降为 warn）
  const nameCount = new Map()
  for (const c of controls) {
    if (!c.name) add('fail', 'names', c.kind, '控件名为空（审计与用例都无法锚定）')
    else nameCount.set(c.name, (nameCount.get(c.name) || 0) + 1)
  }
  const dups = [...nameCount.entries()].filter(([, n]) => n > 1)
  if (dups.length) {
    const sample = dups.slice(0, 8).map(([n, k]) => `${n}×${k}`).join(', ')
    add('warn', 'names', `${dups.length} 组重名`,
      `同名控件会让按名锚定命中多个：${sample}${dups.length > 8 ? ' …' : ''}`)
  }

  // ⑤ 对比度：正文色 vs 它下面真实的底色。
  //    底色优先取**渲染后 PNG 的像素众数**（真值，不受绘制顺序建模误差影响）；没像素时退回
  //    「树顺序里最近的不透明 image」。有描边时阈值放宽（描边提供轮廓对比）。
  const imageList = controls.filter((c) => c.kind === 'image' && argb(c.imageColor)?.a > 0 && validBox(boxOf(c)))
  for (const n of nodes) {
    if (n.kind !== 'textbox' || !n.text) continue
    const fgRaw = argb(n.fontColor)
    if (!fgRaw || fgRaw.a === 0) continue
    const ctl = byName.get(n.name)?.[0]
    const b = boxOf(ctl)
    if (!validBox(b)) continue
    // 盒不在画布内 = 停放隐藏（本工程用挪出画布当 hidden）⇒ 没有可测的底色，跳过
    if (W && H && (b.left < -1 || b.bottom < -1 || boxRight(b) > W + 1 || boxTop(b) > H + 1)) continue
    let bg = sampleBackground(pixels, b, { canvasW: W, canvasH: H, fontColor: fgRaw })
    if (!bg) {
      const cx = b.left + b.width / 2
      const cy = b.bottom + b.height / 2
      bg = baseColor
      for (let k = imageList.length - 1; k >= 0; k--) {
        const img = imageList[k]
        const col = argb(img.imageColor)
        if (col.a >= 128 && contains(boxOf(img), cx, cy)) { bg = over(col, baseColor); break }
      }
    }
    const fg = fgRaw.a >= 255 ? fgRaw : over(fgRaw, bg)
    const ratio = contrastRatio(fg, bg)
    // specContrast：按「设计目标值」判（原始 WCAG 比值，不给描边放宽）——lead 口径 ≥3.0
    if (specContrast != null) {
      if (ratio < specContrast) {
        const sug = suggestColor(fg, bg, specContrast + 0.2)
        add('fail', 'contrast', n.name,
          `「${n.text}」${css(fg)} on ${css(bg)} = ${ratio.toFixed(2)}:1 < 目标 ${specContrast.toFixed(1)}` +
          (sug ? ` ⇒ 建议 ${sug.color}（${sug.ratio}:1）` : ''),
          { box: b, ratio, fontColor: css(fg), bgColor: css(bg), targetRatio: specContrast, suggested: sug?.color || null })
      }
      continue
    }
    const relief = ctl?.enableOutline ? outlineRelief : 1
    if (ratio < contrastFail * relief && !dimOverlay) {
      add('fail', 'contrast', n.name, `「${n.text}」文字 ${css(fg)} vs 底色 ${css(bg)} 对比 ${ratio.toFixed(2)}:1 ` +
        `(阈值 ${(contrastFail * relief).toFixed(2)}${ctl?.enableOutline ? ' 描边已放宽' : ''})`, { box: b, ratio })
    } else if (ratio < contrastWarn * relief) {
      add('warn', 'contrast', n.name, ` 「${n.text}」对比 ${ratio.toFixed(2)}:1 偏低（<${(contrastWarn * relief).toFixed(2)}${dimOverlay ? ' · 遮罩下' : ''}）`, { box: b, ratio })
    }
  }

  // ⑥ 期望控件清单（移动端游戏屏默认校验 8 个手机按钮）
  const want = [...expect]
  if (!want.length && canvas.mobile && frame.screen === 'game') want.push(...DEFAULT_EXPECT_MOBILE)
  // 手机按钮防「改了名就静默通过」：帧里没有任何 ph* 命中区 = 按钮没建出来；
  // 有 ph* 但一个都不在期望清单里 = 命名变了，期望清单要更新（这两种都不算通过）。
  if (!expect.length && canvas.mobile) {
    const ph = (frame.zones || []).filter((z) => /^ph[a-z0-9]+$/i.test(z.name || ''))
    if (!ph.length) {
      add('fail', 'expect', 'ph*', `移动端 ${frame.screen} 屏没有任何 ph* 手机按钮命中区（画面里点不到手机操作）`)
    } else if (!ph.some((z) => DEFAULT_EXPECT_MOBILE.includes(z.name))) {
      add('fail', 'expect', 'ph*', `手机按钮命名变了（发现 ${ph.slice(0, 6).map((z) => z.name).join(',')}…），请更新 DEFAULT_EXPECT_MOBILE`)
    }
  }
  for (const name of want) {
    const present = controls.some((c) => c.name === name && c.active !== false && c.visible !== false)
    if (!present) add('fail', 'expect', name, `期望控件 ${name} 不存在或不可见`)
  }

  // 豁免（waiver）：已知且被接受的 fail（例如"氛围文案低对比"），必须带 reason 与 expires。
  // 命中豁免 → level 降为 'waived'（不计入 fail，但仍出现在报告与 JSON 里，可审计）。
  const today = new Date().toISOString().slice(0, 10)
  if (waiver && Array.isArray(waiver.allow)) {
    for (const issue of issues) {
      if (issue.level !== 'fail') continue
      const hit = waiver.allow.find((w) =>
        (!w.code || w.code === issue.code) &&
        (!w.target || w.target === issue.target) &&
        (!w.frame || w.frame === `${canvas.id}/${frame.screen}`) &&
        (!w.expires || w.expires >= today))
      if (hit) {
        issue.level = 'waived'
        issue.waivedReason = hit.reason || '(未写理由)'
        issue.waivedUntil = hit.expires || null
      }
    }
  }
  const fails = issues.filter((i) => i.level === 'fail').length
  const warns = issues.filter((i) => i.level === 'warn').length
  return {
    frame: `${canvas.id || '?'}/${frame.screen || '?'}`,
    canvas, reached: frame.reached !== false,
    counts: { fail: fails, warn: warns, waived: issues.filter((i) => i.level === 'waived').length, issues: issues.length },
    verdict: fails ? 'FAIL' : (warns ? 'WARN' : 'PASS'),
    issues,
  }
}

/** 给定文字色与底色，求一个达到 target 对比度的替代色（保持色相，仅调明度）。 */
export function suggestColor(fg, bg, target = 3.0) {
  const bgL = luminance(bg)
  const dirs = bgL > 0.4 ? [[0, 0, 0], [255, 255, 255]] : [[255, 255, 255], [0, 0, 0]]
  for (const dir of dirs) {
    for (let i = 1; i <= 40; i++) {
      const t = i / 40
      const c = { a: 255, r: Math.round(fg.r + (dir[0] - fg.r) * t), g: Math.round(fg.g + (dir[1] - fg.g) * t), b: Math.round(fg.b + (dir[2] - fg.b) * t) }
      if (contrastRatio(c, bg) >= target) return { color: css(c), ratio: +contrastRatio(c, bg).toFixed(2) }
    }
  }
  return null
}

/** 在 lua/** 里找控件名的创建点（取第一处带引号的字面量），用于归属分桶。 */
export function findLuaSource(name, root = PROJECT_ROOT) {
  const files = ['lua/main.lua', 'lua/tetris/ui.lua', 'lua/tetris/widgets.lua', 'lua/tetris/config.lua', 'lua/tetris/fx.lua']
  const needle = `'${name}'`
  for (const rel of files) {
    let text = ''
    try { text = readFileSync(join(root, rel), 'utf8') } catch { continue }
    const idx = text.indexOf(needle)
    if (idx >= 0) {
      const line = text.slice(0, idx).split('\n').length
      return `${rel}:${line}`
    }
  }
  return null
}

export function formatReport(report, limit = 8) {
  const lines = []
  const mark = report.verdict === 'FAIL' ? '✗' : (report.verdict === 'WARN' ? '!' : '✓')
  lines.push(`${mark} ${report.frame}  fail=${report.counts.fail} warn=${report.counts.warn} waived=${report.counts.waived}`)
  const order = { fail: 0, warn: 1, info: 2 }
  const sorted = [...report.issues].sort((a, b) => order[a.level] - order[b.level])
  const shown = sorted.filter((i) => i.level !== 'info').slice(0, limit)
  const LEVEL_MARK = { fail: '✗', warn: '!', waived: '~', info: '·' }
  for (const issue of shown) {
    lines.push(`   ${LEVEL_MARK[issue.level] || '·'} [${issue.code}] ${issue.target}: ${issue.message}` +
      (issue.level === 'waived' ? `  ⟨豁免：${issue.waivedReason}${issue.waivedUntil ? ` · 至 ${issue.waivedUntil}` : ''}⟩` : ''))
  }
  const rest = sorted.filter((i) => i.level !== 'info').length - shown.length
  if (rest > 0) lines.push(`   … 另有 ${rest} 条（完整清单见 --json）`)
  return lines.join('\n')
}

function walkFrames(dir) {
  const out = []
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else if (name.endsWith('.frame.json')) out.push(p)
    }
  }
  walk(dir)
  return out.sort()
}

function parseArgs(argv) {
  const opts = { frames: [], dir: null, live: null, overlay: false, expect: [], json: null }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--frame') opts.frames.push(argv[++i])
    else if (a === '--dir') opts.dir = argv[++i]
    else if (a === '--live') opts.live = true
    else if (a === '--canvas') opts.canvas = argv[++i]
    else if (a === '--screen') opts.screen = argv[++i]
    else if (a === '--overlay') opts.overlay = true
    else if (a === '--no-pixels') opts.noPixels = true
    else if (a === '--waiver') opts.waiver = argv[++i]
    else if (a === '--write-waiver') opts.writeWaiver = argv[++i]
    else if (a === '--spec-contrast') opts.specContrast = Number(argv[++i])
    else if (a === '--group') opts.group = true
    else if (a === '--attribution') opts.attribution = true
    else if (a === '--expect') opts.expect.push(...String(argv[++i]).split(',').filter(Boolean))
    else if (a === '--json') opts.json = argv[++i]
    else if (a === '--contrast-fail') opts.contrastFail = Number(argv[++i])
    else if (a === '--contrast-warn') opts.contrastWarn = Number(argv[++i])
    else if (a === '-h' || a === '--help') opts.help = true
    else throw new Error(`未知参数 ${a}`)
  }
  return opts
}

async function main() {
  const opts = parseArgs(process.argv)
  if (opts.help) {
    console.log('node qxqy/audit-ui.mjs --dir docs/shots/<批次> [--overlay] [--expect name1,name2]\n' +
      'node qxqy/audit-ui.mjs --frame <x.frame.json>\n' +
      'node qxqy/audit-ui.mjs --live --canvas mobile-19.5-9 --screen game')
    return 0
  }
  const frames = [...opts.frames]
  if (opts.dir) frames.push(...walkFrames(resolve(PROJECT_ROOT, opts.dir)))
  if (opts.live) {
    const canvasId = opts.canvas || 'pc-16-9'
    const screen = opts.screen || 'game'
    if (!CANVAS_PRESETS[canvasId]) throw new Error(`未知画布 ${canvasId}`)
    const out = resolve(PROJECT_ROOT, 'docs', 'shots', '_audit-live')
    const { entry } = captureCanvasScreen(canvasId, screen, out)
    frames.push(entry.png.replace(/\.png$/, '.frame.json'))
  }
  if (!frames.length) throw new Error('没有输入：给 --dir / --frame / --live 之一')
  const waiver = opts.waiver ? JSON.parse(readFileSync(resolve(PROJECT_ROOT, opts.waiver), 'utf8')) : null
  const reports = []
  let totalFail = 0
  let totalWarn = 0
  let totalWaived = 0
  for (const file of frames) {
    const frame = JSON.parse(readFileSync(resolve(PROJECT_ROOT, file), 'utf8'))
    let pixels = null
    if (!opts.noPixels) {
      const png = resolve(PROJECT_ROOT, file).replace(/\.frame\.json$/, '.png')
      try { pixels = await decodePng(readFileSync(png)) } catch { pixels = null }
    }
    const report = auditFrame(frame, {
      pixels,
      waiver,
      specContrast: opts.specContrast ?? null,
      expect: opts.expect,
      contrastFail: opts.contrastFail ?? 1.5,
      contrastWarn: opts.contrastWarn ?? 2.6,
    })
    report.file = file
    if (opts.attribution) {
      for (const issue of report.issues) {
        if (!issue.source && /^[a-zA-Z_][\w]*$/.test(String(issue.target))) {
          const src = findLuaSource(issue.target)
          if (src) issue.source = src
        }
      }
    }
    reports.push(report)
    totalFail += report.counts.fail
    totalWarn += report.counts.warn
    totalWaived += report.counts.waived
    console.log(formatReport(report))
    if (opts.overlay) {
      const png = resolve(PROJECT_ROOT, file).replace(/\.frame\.json$/, '.png')
      try {
        const boxes = report.issues
          .filter((i) => i.box && i.level !== 'info')
          .map((i) => ({
            x: i.box.left, y: i.box.bottom, w: i.box.width, h: i.box.height,
            color: i.level === 'fail' ? '#ff4d4f' : '#ffa940',
            label: `${i.code}:${i.target}`.slice(0, 34),
          }))
        const buf = await drawBoxes(readFileSync(png), boxes)
        const outPng = png.replace(/\.png$/, '.audit.png')
        writeFileSync(outPng, buf)
        console.log(`   ⇢ ${outPng}`)
      } catch (err) {
        console.log(`   ! overlay 失败 ${basename(png)}: ${err.message}`)
      }
    }
  }
  const summary = {
    format: 'qxqy-audit-ui', version: 1, generatedAt: new Date().toISOString(),
    frames: reports.length, fail: totalFail, warn: totalWarn, waived: totalWaived,
    verdict: totalFail ? 'FAIL' : (totalWarn ? 'WARN' : 'PASS'),
    failFrames: reports.filter((r) => r.counts.fail).map((r) => r.frame),
    reports,
  }
  if (opts.group) {
    const map = new Map()
    for (const r of reports) for (const i of r.issues) {
      if (i.level !== 'fail') continue
      const key = `${i.code}|${i.target}`
      const cur = map.get(key) || { code: i.code, target: i.target, count: 0, frames: [], minRatio: i.code === 'contrast' ? (i.ratio ?? null) : null, fontColor: i.fontColor, bgColor: i.bgColor, suggested: i.suggested, source: i.source, message: i.message, text: i.message }
      cur.count += 1
      if (!cur.frames.includes(r.frame)) cur.frames.push(r.frame)
      if (i.code === 'contrast' && i.ratio != null && (cur.minRatio == null || i.ratio < cur.minRatio)) cur.minRatio = i.ratio
      if (!cur.source && i.source) cur.source = i.source
      map.set(key, cur)
    }
    const rows = [...map.values()].sort((a, b) => b.count - a.count)
    console.log(`\n— 按控件名聚合（fail 源头 ${rows.length} 个）—`)
    for (const r of rows) {
      console.log(`  ${String(r.count).padStart(3)}× [${r.code}] ${r.target}` +
        (r.minRatio != null ? ` min=${r.minRatio.toFixed(2)}:1` : '') +
        (r.fontColor ? ` ${r.fontColor} on ${r.bgColor}` : '') +
        (r.suggested ? ` ⇒ ${r.suggested}` : '') +
        (r.source ? ` @${r.source}` : '') +
        ` · 帧 ${r.frames.length}`)
    }
    summary.groups = rows
  }
  if (opts.json) writeFileSync(resolve(PROJECT_ROOT, opts.json), JSON.stringify(summary, null, 1))
  if (opts.writeWaiver) {
    // 把当前所有 fail 摊成豁免草稿：人逐条填 reason/expires 后才生效（默认不生效）
    const allow = []
    for (const r of reports) for (const i of r.issues) {
      if (i.level !== 'fail') continue
      allow.push({ code: i.code, target: i.target, frame: r.frame, reason: 'TODO：此人为何可接受？', expires: '2026-11-05' })
    }
    writeFileSync(resolve(PROJECT_ROOT, opts.writeWaiver), JSON.stringify({ format: 'qxqy-audit-waiver', version: 1, allow }, null, 1))
    console.log(`   ⇢ 豁免草稿 ${opts.writeWaiver}（${allow.length} 条，填好 reason/expires 后用 --waiver 传入才生效）`)
  }
  console.log(`\n${summary.verdict}: ${reports.length} 帧 · fail ${totalFail} · warn ${totalWarn} · waived ${totalWaived}` +
    (opts.json ? ` · → ${opts.json}` : ''))
  return totalFail ? 1 : 0
}

if (isMain(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error('audit-ui 失败:', err?.stack || err)
    process.exit(2)
  })
}
