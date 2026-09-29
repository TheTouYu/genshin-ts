// 闸门探针 3：output.schema 里写 schema 级 required: [...] —— 契约说会被明确拒绝
export const name = 'cap-bad-schema'
export const inject = []

export function apply(ctx, config) {
  const { defineTool } = config
  ctx.tools.register(
    defineTool({
      name: 'hp_bad_schema',
      description: 'Probe schema-level required array',
      parameters: { x: { type: 'string', required: true } },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['x'],
          properties: { x: { type: 'string', required: true } }
        },
        render: (_a, v) => [{ type: 'text', text: String(v.x) }]
      },
      async execute(args) {
        return { x: args.x }
      }
    })
  )
}
