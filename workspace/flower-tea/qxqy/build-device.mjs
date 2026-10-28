#!/usr/bin/env node
// 生成真实地图用 Lua（模板 GUID 已知时）
// 用法：FLOWER_PRIM=... FLOWER_LABEL=... FLOWER_HIT=... node qxqy/build-device.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const prim = process.env.FLOWER_PRIM || '1073741910'
const label = process.env.FLOWER_LABEL || '1073741911'
const hit = process.env.FLOWER_HIT || '1073741912'
const srcDir = join(root, 'lua/src')
const files = readdirSync(srcDir).filter((f) => f.endsWith('.lua')).sort()
let lua = '-- 由 qxqy/build-device.mjs 生成（真实地图模板 GUID）\n'
for (const f of files) lua += `\n-- ===== ${f} =====\n` + readFileSync(join(srcDir, f), 'utf8') + '\n'
lua = lua.replaceAll('__GUID_PRIM__', prim).replaceAll('__GUID_LABEL__', label).replaceAll('__GUID_HIT__', hit)
  .replaceAll('__BUILD_ID__', 'device-' + Date.now())
if (/__GUID_[A-Z]+__/.test(lua)) throw new Error('still has placeholders')
const out = join(root, 'device-package/main-device.lua')
writeFileSync(out, lua)
execFileSync('lua5.3', ['-e', `assert(loadfile('${out.replaceAll("'", "\\'")}'))`], { stdio: 'pipe' })
console.log('wrote', out, Buffer.byteLength(lua), 'bytes', 'tpl=', prim, label, hit)
