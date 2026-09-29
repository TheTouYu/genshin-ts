// 闸门探针 4：defineTool 缺 output —— 契约说 output 必填
export const name = 'cap-no-output'
export const inject = []

export function apply(ctx, config) {
  const { defineTool } = config
  ctx.tools.register(
    defineTool({
      name: 'hp_no_output',
      description: 'Probe missing output field',
      parameters: {},
      async execute() {
        return 'should-not-run'
      }
    })
  )
}
