import { createRequire } from 'node:module'

import { match } from '@formatjs/intl-localematcher'
import i18next from 'i18next'
import { osLocaleSync } from 'os-locale'

const requireFn = createRequire(import.meta.url)
const enUS = requireFn('./locales/en-US/main.json') as Record<string, string>
const zhCN = requireFn('./locales/zh-CN/main.json') as Record<string, string>

export type Lang = 'zh-CN' | 'en-US'

function normalizeLocale(s: string): string {
  return s.replace(/_/g, '-').trim()
}

function envLocaleCandidates(): string[] {
  const keys = ['LC_ALL', 'LC_MESSAGES', 'LANG', 'LANGUAGE']
  const out: string[] = []
  for (const k of keys) {
    const v = process.env[k]
    if (!v) continue
    // e.g. zh_CN.UTF-8
    out.push(normalizeLocale(v.split('.', 1)[0] ?? v))
  }
  return out
}

export function detectLang(raw?: string): Lang {
  if (raw && raw !== 'auto') {
    return raw.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
  }

  const supported = ['zh-CN', 'en-US'] as const
  const candidates: string[] = []

  candidates.push(...envLocaleCandidates())
  try {
    candidates.push(normalizeLocale(osLocaleSync()))
  } catch {
    // ignore
  }
  try {
    candidates.push(normalizeLocale(Intl.DateTimeFormat().resolvedOptions().locale))
  } catch {
    // ignore
  }

  // locale=C / POSIX 等非 BCP47 tag 会让 intl-localematcher 抛
  // "Invalid language tag: C"（2026-08-15 CLI 测试/CI 环境实证）：先过滤非法候选，
  // match 仍失败时兜底回退 en-US，绝不因环境 locale 崩 CLI。
  const valid = candidates.filter((candidate) => {
    try {
      new Intl.Locale(candidate)
      return true
    } catch {
      return false
    }
  })
  try {
    return match(valid, supported, 'en-US') as Lang
  } catch {
    return 'en-US'
  }
}

export function initCliI18n(lang: Lang) {
  if (!i18next.isInitialized) {
    void i18next.init({
      lng: lang,
      fallbackLng: 'en-US',
      initImmediate: false,
      showSupportNotice: false,
      interpolation: { escapeValue: false },
      resources: {
        'zh-CN': { translation: zhCN },
        'en-US': { translation: enUS }
      }
    })
  } else {
    void i18next.changeLanguage(lang)
  }
  return {
    lang,
    t: i18next.t.bind(i18next) as (key: string, options?: Record<string, unknown>) => string
  }
}

/**
 * Convenience translation helper for non-CLI modules.
 *
 * - If i18n is not initialized yet, it will auto-init with detected language.
 * - Safe to call multiple times.
 */
export function t(key: string, options?: Record<string, unknown>) {
  if (!i18next.isInitialized) {
    initCliI18n(detectLang())
  }
  return i18next.t(key, options)
}
