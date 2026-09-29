// 闸门探针 1：bare import —— 契约说插件文件里不能 import 裸包名
// 这里用的 'typescript' 在工作区 /home/h/genshin-ts/node_modules 里确实存在
import ts from 'typescript'

export const name = 'cap-imp-bare'
export const inject = []

export function apply(ctx, config) {
  const { defineTool } = config
  ctx.tools.register(
    defineTool({
      name: 'hp_bare',
      description: 'Probe bare-specifier import',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_a, v) => [{ type: 'text', text: String(v) }]
      },
      async execute() {
        return String(typeof ts.version)
      }
    })
  )
}
