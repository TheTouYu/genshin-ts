/**
 * Color helpers for the image editor scene model.
 * All colors are normalized to `#rrggbb` hex strings in scene documents.
 */

import { DEFAULT_SHAPE_COLOR } from './types.js'

const HEX_COLOR_RE = /^[0-9a-f]+$/

/** Parse an rgb()/rgba() string into [r, g, b] clamped to 0..255. */
export function rgbStringToHex(value: string): string {
  const numbers = (value.match(/-?\d+/g) ?? [])
    .slice(0, 3)
    .map((part) => Math.max(0, Math.min(255, Number(part))))
  if (numbers.length !== 3 || numbers.some((n) => !Number.isFinite(n))) {
    throw new Error('invalid rgb')
  }
  return `#${numbers.map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

const NAMED_COLORS: Record<string, string> = {
  transparent: '#000000',
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  pink: '#ffc0cb',
  gray: '#808080',
  grey: '#808080',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  brown: '#a52a2a',
  teal: '#008080',
  navy: '#000080',
  lime: '#00ff00',
  maroon: '#800000',
  olive: '#808000',
  silver: '#c0c0c0',
  gold: '#ffd700'
}

/** Normalize any supported color input to `#rrggbb` (fallback on failure). */
export function normalizeColor(value: string): string {
  const input = (value ?? '').trim()
  if (!input) return DEFAULT_SHAPE_COLOR
  const lowered = input.toLowerCase()
  if (lowered.startsWith('#')) {
    const hex = lowered.slice(1)
    if ((hex.length === 3 || hex.length === 4) && HEX_COLOR_RE.test(hex)) {
      const expanded = hex
        .slice(0, 3)
        .split('')
        .map((ch) => ch + ch)
        .join('')
      return `#${expanded}`
    }
    if ((hex.length === 6 || hex.length === 8) && HEX_COLOR_RE.test(hex)) {
      return `#${hex.slice(0, 6)}`
    }
    return DEFAULT_SHAPE_COLOR
  }
  if (lowered.startsWith('rgb')) {
    try {
      return rgbStringToHex(lowered)
    } catch {
      return DEFAULT_SHAPE_COLOR
    }
  }
  return NAMED_COLORS[lowered] ?? DEFAULT_SHAPE_COLOR
}

function rgbFromHex(color: string): [number, number, number] {
  const hex = color.replace('#', '')
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16)
  ]
}

/** Pack a scene color + opacity into protobuf ARGB int (0xAARRGGBB). */
export function toPackedArgb(color: string, opacity: number): number {
  const [r, g, b] = rgbFromHex(normalizeColor(color))
  const alpha = Math.max(0, Math.min(255, Math.round(opacity * 255)))
  return ((alpha << 24) | (r << 16) | (g << 8) | b) >>> 0
}

/** Scene color + opacity → css `rgba(...)` string. */
export function colorWithAlphaCss(color: string, opacity: number): string {
  const [r, g, b] = rgbFromHex(normalizeColor(color))
  const alpha = Math.max(0, Math.min(1, opacity))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
