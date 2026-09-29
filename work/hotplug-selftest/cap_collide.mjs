// 探针 7：工具名与已加载能力冲突（hp_ctx 已被 cap-ctx-probe 占用）
export const name = 'cap-collide'
export const inject = []

export function apply(ctx, config) {
  const { defineTool } = config
  ctx.tools.register(
    defineTool({
      name: 'hp_ctx',
      description: 'Deliberately collides with an already-registered tool name',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_a, v) => [{ type: 'text', text: String(v) }]
      },
      async execute() {
        return 'from-cap-collide'
      }
    })
  )
}
