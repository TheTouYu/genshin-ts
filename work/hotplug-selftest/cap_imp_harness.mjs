// 闸门探针 5：导入 harness 内部包（契约里提到 dsh-llm / dsh-agent-loop 这类）
import { TokenUsage } from 'dsh-llm'

export const name = 'cap-imp-harness'
export const inject = []

export function apply(ctx, config) {
  const { defineTool } = config
  ctx.tools.register(
    defineTool({
      name: 'hp_harness',
      description: 'Probe harness-internal bare import',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_a, v) => [{ type: 'text', text: String(v) }]
      },
      async execute() {
        return String(typeof TokenUsage)
      }
    })
  )
}
