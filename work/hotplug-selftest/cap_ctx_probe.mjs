// 自测夹具 4：把 apply 拿到的 ctx / config 真实 API 面写到标记文件，
// 并注册一个 agent/pre-step 处理器（文档称热载插件收不到该事件 → 不该出现 prestep 标记）
import { appendFileSync } from 'node:fs'

const MARK = '/home/h/genshin-ts/work/hotplug-selftest/lifecycle.log'
const mark = (line) => appendFileSync(MARK, `${line}\n`)

function surface(obj, label) {
  if (obj == null) return `${label}=<${String(obj)}>`
  const names = new Set()
  for (let o = obj; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    for (const k of Object.getOwnPropertyNames(o)) if (k !== 'constructor') names.add(k)
  }
  const parts = []
  for (const k of [...names].sort()) {
    let t = '?'
    try {
      t = typeof obj[k]
    } catch {
      t = '<throw>'
    }
    parts.push(`${k}:${t}`)
  }
  return `${label} = ${parts.join(', ')}`
}

export const name = 'cap-ctx-probe'
export const inject = []

export function apply(ctx, config) {
  const { defineTool } = config
  mark(`--- ctx-probe apply ---`)
  mark(surface(ctx, 'ctx'))
  mark(surface(config, 'config'))
  mark(surface(ctx.tools, 'ctx.tools'))

  // 文档称：热载插件不在 agent 作用域链上，agent/pre-step 收不到事件
  try {
    ctx.on(
      'agent/pre-step',
      async (payload, next) => {
        mark(`prestep:FIRED turn=${payload?.turn} step=${payload?.step}`)
        return next()
      },
      { prepend: true }
    )
    mark('prestep:handler-registered')
  } catch (e) {
    mark(`prestep:register-threw:${e && e.message}`)
  }

  ctx.tools.register(
    defineTool({
      name: 'hp_ctx',
      description: 'Return a marker string; used to probe ctx surface',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_a, v) => [{ type: 'text', text: String(v) }]
      },
      async execute() {
        return 'ctx-probe-ok'
      }
    })
  )
}
