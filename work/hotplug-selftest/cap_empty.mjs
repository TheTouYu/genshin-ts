// 探针 6：一个工具都不注册 —— 看是否被拒
export const name = 'cap-empty'
export const inject = []

export function apply(_ctx, _config) {
  // 故意不注册任何工具
}
