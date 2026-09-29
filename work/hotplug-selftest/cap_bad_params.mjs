// 闸门探针 2：parameters 写成 JSON Schema（根上 type:'object'）—— 契约说会被当成名为 type 的属性而报错
export const name = 'cap-bad-params'
export const inject = []

export function apply(ctx, config) {
  const { defineTool } = config
  ctx.tools.register(
    defineTool({
      name: 'hp_bad_params',
      description: 'Probe JSON-Schema-style parameters',
      parameters: {
        type: 'object',
        properties: { x: { type: 'string', required: true } }
      },
      output: {
        schema: { type: 'string' },
        render: (_a, v) => [{ type: 'text', text: String(v) }]
      },
      async execute() {
        return 'should-not-run'
      }
    })
  )
}
