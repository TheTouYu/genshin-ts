// 热载自测夹具 3：render 调用探针 / output schema 校验探针 / execute 抛错探针
import { appendFileSync } from 'node:fs'

const MARK = '/home/h/genshin-ts/work/hotplug-selftest/lifecycle.log'
const mark = (line) => appendFileSync(MARK, `${line}\n`)

export const name = 'cap-render'
export const inject = []

export function apply(ctx, config) {
  const { defineTool } = config

  // A：render 里写标记 —— 用来判断 render 是否被真正调用
  ctx.tools.register(
    defineTool({
      name: 'hp_render_probe',
      description: 'Probe whether render() is invoked; returns an object value',
      parameters: { tag: { type: 'string', required: true, description: '标记名' } },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { tag: { type: 'string', required: true } }
        },
        render: (_args, value) => {
          mark(`render:hp_render_probe:${value.tag}`)
          return [{ type: 'text', text: `RENDERED<${value.tag}>` }]
        }
      },
      async execute(args) {
        return { tag: args.tag }
      }
    })
  )

  // B：output schema 声明 string，实际返回 number —— 看是否被校验
  ctx.tools.register(
    defineTool({
      name: 'hp_bad_return',
      description: 'Declares a string output schema but returns a number',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: String(value) }]
      },
      async execute() {
        return 42
      }
    })
  )

  // C：execute 抛错 —— 看错误是否被兜住并回报
  ctx.tools.register(
    defineTool({
      name: 'hp_throw',
      description: 'Throws inside execute to probe error handling',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: String(value) }]
      },
      async execute() {
        throw new Error('deliberate-explosion')
      }
    })
  )
}
