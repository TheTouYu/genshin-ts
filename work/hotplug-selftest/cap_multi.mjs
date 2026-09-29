// 热载自测夹具 2：多工具 + 参数方言（各类型/可选=省略 required/数组/对象）+ 对象型 output schema
// 注意：parameters 方言里 required 只能为 true，可选 = 不写 required（写 false 会被拒）
export const name = 'cap-multi'
export const inject = []

export function apply(ctx, config) {
  const { defineTool } = config

  // 工具 A：标量参数 + 对象输出（additionalProperties 与逐属性 required）
  ctx.tools.register(
    defineTool({
      name: 'hp_sum',
      description: 'Add two numbers and report the result with a note',
      parameters: {
        a: { type: 'number', required: true, description: '第一个加数' },
        b: { type: 'number', required: true, description: '第二个加数' },
        note: { type: 'string', description: '可选备注（省略 required 即为可选）' }
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sum: { type: 'number', required: true },
            note: { type: 'string', required: true },
            even: { type: 'boolean', required: true }
          }
        },
        render: (_args, value) => [
          { type: 'text', text: `sum=${value.sum} note=${value.note} even=${value.even}` }
        ]
      },
      async execute(args) {
        const sum = args.a + args.b
        return { sum, note: `V2-${args.note ?? '(none)'}`, even: sum % 2 === 0 }
      }
    })
  )

  // 工具 B：数组 / 对象 / 布尔 参数
  ctx.tools.register(
    defineTool({
      name: 'hp_describe',
      description: 'Describe a list of items and a config object',
      parameters: {
        items: { type: 'array', required: true, items: { type: 'string' }, description: '字符串列表' },
        options: {
          type: 'object',
          additionalProperties: true,
          properties: { upper: { type: 'boolean' } },
          description: '可选配置对象'
        }
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            count: { type: 'number', required: true },
            joined: { type: 'string', required: true }
          }
        },
        render: (_args, value) => [{ type: 'text', text: `${value.count} :: ${value.joined}` }]
      },
      async execute(args) {
        const up = args.options?.upper === true
        const list = args.items.map((s) => (up ? String(s).toUpperCase() : String(s)))
        return { count: list.length, joined: list.join('|') }
      }
    })
  )

  // 工具 C：无参工具（验证 parameters: {} 是否被接受）
  ctx.tools.register(
    defineTool({
      name: 'hp_ping',
      description: 'Return a fixed pong string; takes no arguments',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: String(value) }]
      },
      async execute() {
        return 'pong'
      }
    })
  )
}
