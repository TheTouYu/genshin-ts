// 热载自测夹具 1：最小形状 + 生命周期标记
// 验证点：name/inject/apply 契约、defineTool 注入、ctx.tools.register、ctx.effect 清理钩子
import { appendFileSync } from 'node:fs'

const MARK = '/home/h/genshin-ts/work/hotplug-selftest/lifecycle.log'
const mark = (line) => appendFileSync(MARK, `${line}\n`)

export const name = 'cap-basic'
export const inject = []

export function apply(ctx, config) {
  const { defineTool } = config
  mark('apply:cap-basic')

  ctx.effect(() => {
    // 卸载时应执行到这里 —— 用来证明 scope 收口
    return () => mark('dispose:cap-basic')
  })

  ctx.tools.register(
    defineTool({
      name: 'hp_echo',
      description: 'Echo the given text back, prefixed with "echo:"',
      parameters: {
        text: { type: 'string', required: true, description: '要回显的文本' }
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: String(value) }]
      },
      async execute(args) {
        mark(`call:hp_echo:${args.text}`)
        return `echo:${args.text}`
      }
    })
  )
}
