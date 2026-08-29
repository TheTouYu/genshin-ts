import { g } from 'genshin-ts/runtime/core'

// 列表字面量 fixture：server 局部变量 init/set 的列表字面量路径（O-29-07 修复回归）。
// 被 tests/local_variable_list_literal_test.ts 编译断言 + gsts.test.config.ts 批量编译。
g.server({ id: 1073742001, name: 'local-variable-list-literal' }).on('whenCustomVariableChanges', (evt, f) => {
  // 常量列表字面量 init：值必须保留（Stage 1 包装成 assemblyList，不得静默丢值）
  const lv = f.initLocalVariable('int_list', [1n, 2n, 3n])
  // 先声明空列表，再 set 列表字面量：第二条路径
  const lv2 = f.initLocalVariable('int_list')
  f.setLocalVariable(lv2.localVariable, [4n, 5n])
  // 消费 lv（与 lv.value 回写），保持两条身份连线都有下游
  f.setLocalVariable(lv.localVariable, lv.value)
})
