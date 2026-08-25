/*
 * 素材库注入：CSS 资产解析层
 *
 * 把 AI 生成的 CSS 资产（assets/images/*.css，shaper-element 图元语法）
 * 解析为游戏素材库图元参数。所有映射规则均来自真实 .gil 差分闭合：
 *   - 形状类型码：100001=矩形 100002=椭圆 100003=三角形 100004=四角星
 *                  100005=五角星 100006=圆环（src/image-editor/gia/image_mode.ts）
 *   - 位置：CSS left/top（元素中心，translate(-50%,-50%)）→ 游戏画布中心坐标系
 *   - 尺寸：CSS width/height → 图元 505 字段
 *   - 旋转：CSS rotate(deg) → 图元 508 字段
 *   - 颜色：CSS #hex + opacity → ARGB int32（alpha = round(opacity*255)，
 *           实验样本 -65536 = 0xFFFF0000 红色验证）
 */

export interface CssPrimitive {
  shape: number
  x: number
  y: number
  w: number
  h: number
  rotate: number
  color: number
}

export interface CssAsset {
  name: string
  canvasW: number
  canvasH: number
  primitives: CssPrimitive[]
}

const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/

/** #RRGGBB + opacity(0-1) → ARGB int32（与实验样本 -65536 = 0xFFFF0000 同构） */
export function cssColorToArgb(hex: string, opacity: number): number {
  const m = HEX_RE.exec(hex.trim())
  if (!m) throw new Error(`无法解析颜色: ${hex}`)
  let r: number, g: number, b: number
  if (m[1].length === 3) {
    r = parseInt(m[1][0] + m[1][0], 16)
    g = parseInt(m[1][1] + m[1][1], 16)
    b = parseInt(m[1][2] + m[1][2], 16)
  } else {
    r = parseInt(m[1].slice(0, 2), 16)
    g = parseInt(m[1].slice(2, 4), 16)
    b = parseInt(m[1].slice(4, 6), 16)
  }
  const a = Math.round((opacity ?? 1) * 255)
  return ((a << 24) | (r << 16) | (g << 8) | b) | 0
}

function parseRotate(value: string | undefined): number {
  if (!value) return 0
  const m = /rotate\(([-0-9.]+)deg\)/.exec(value)
  if (!m) return 0
  return Number.parseFloat(m[1])
}

/** radial-gradient(closest-side, transparent 79.5%, #f59e0b 80.5%, ...) → 圆环 */
function isRing(background: string): boolean {
  return background.startsWith('radial-gradient')
}

/** polygon(50% 0%, 0% 100%, 100% 100%) 3 点 → 三角形 */
function isTriangle(clipPath: string | undefined): boolean {
  if (!clipPath || !clipPath.startsWith('polygon')) return false
  const points = clipPath.match(/[-0-9.]+%/g) ?? []
  return points.length === 6
}

/** 解析一个 CSS 资产文件为图元参数列表 */
export function parseCssAsset(css: string, name: string): CssAsset {
  const container = /\.shaper-container\s*\{([^}]*)\}/.exec(css)
  const canvasW = Number(/width:\s*([0-9.]+)px/.exec(container?.[1] ?? '')?.[1] ?? 0)
  const canvasH = Number(/height:\s*([0-9.]+)px/.exec(container?.[1] ?? '')?.[1] ?? 0)
  if (!canvasW || !canvasH) throw new Error(`无法解析画布尺寸: ${name}`)

  // 按 .shaper-element.shaper-eN 切块
  const blocks: { index: number; body: string }[] = []
  const re = /\.shaper-element\.shaper-e(\d+)\s*\{([^}]*)\}/g
  let match: RegExpExecArray | null
  while ((match = re.exec(css)) !== null) {
    blocks.push({ index: Number(match[1]), body: match[2] })
  }
  blocks.sort((a, b) => a.index - b.index)
  if (blocks.length === 0) throw new Error(`资产无图元: ${name}`)

  const primitives: CssPrimitive[] = []
  for (const { body } of blocks) {
    const left = Number(/left:\s*([-0-9.]+)px/.exec(body)?.[1] ?? 0)
    const top = Number(/top:\s*([-0-9.]+)px/.exec(body)?.[1] ?? 0)
    const w = Number(/width:\s*([0-9.]+)px/.exec(body)?.[1] ?? 0)
    const h = Number(/height:\s*([0-9.]+)px/.exec(body)?.[1] ?? 0)
    const background = /background:\s*([^;]+)/.exec(body)?.[1]?.trim() ?? ''
    const opacity = Number(/opacity:\s*([0-9.]+)/.exec(body)?.[1] ?? 1)
    const clipPath = /clip-path:\s*([^;]+)/.exec(body)?.[1]?.trim()
    const rotate = parseRotate(/transform:[^;]*/.exec(body)?.[0])
    const border = /border-radius:\s*([^;]+)/.exec(body)?.[1]?.trim()

    let shape: number
    if (isRing(background)) shape = 100006
    else if (isTriangle(clipPath)) shape = 100003
    else if (border === '50%') shape = 100002
    else shape = 100001

    const hex = /#([0-9a-fA-F]{3,6})/.exec(background)?.[0]
    if (!hex) throw new Error(`图元无颜色: ${name} e${blocks.indexOf({ index: -1, body })}`)
    primitives.push({
      shape,
      // CSS left/top 是元素中心（translate(-50%,-50%)），游戏坐标原点在画布中心
      x: left - canvasW / 2,
      y: top - canvasH / 2,
      w,
      h,
      rotate,
      color: cssColorToArgb(hex, opacity),
    })
  }
  return { name, canvasW, canvasH, primitives }
}
