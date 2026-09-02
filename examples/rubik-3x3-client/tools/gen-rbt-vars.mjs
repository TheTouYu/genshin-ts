// gen-rbt-vars.mjs —— 生成客户端算力通道资产注册的 --vars 参数（票 03/04）
// 用法：npx tsx tools/gen-rbt-vars.mjs host|player
//   host  → 宿主 1077936201：solver_* 状态表 + rbt_* 十字查表（值=cfopTables 定稿）
//   player → 玩家实体：rbx_* 寄存器 + rb_host 引用
// 输出直接拼进：node bin/gsts.mjs assets:custom-variables --gil <map> --entity <id> --vars "<输出>"
import {
  CF_X_MACRO_LEN_c0, CF_X_MACRO_C0_c0, CF_X_MACRO_C1_c0, CF_X_MACRO_C2_c0,
  CF_X_POLICY_c0, CF_X_POLICY_c1, CF_X_POLICY_c2, CF_X_POLICY_c3
} from '../src/cfopTables.js'

const list = (arr) => '[' + arr.map((v) => v.toString()).join(',') + ']'
const which = process.argv[2]

if (which === 'host') {
  const vars = [
    'solver_ep:int_list=' + list(Array.from({ length: 12 }, (_, i) => BigInt(i))),
    'solver_eo:int_list=' + list(Array.from({ length: 12 }, () => 0n)),
    'solver_ct:int_list=' + list([0n, 1n, 2n, 3n, 4n, 5n]),
    'solver_cp:int_list=' + list(Array.from({ length: 8 }, (_, i) => BigInt(i))),
    'solver_co:int_list=' + list(Array.from({ length: 8 }, () => 0n)),
    'rbt_xp0:int_list=' + list(CF_X_POLICY_c0),
    'rbt_xp1:int_list=' + list(CF_X_POLICY_c1),
    'rbt_xp2:int_list=' + list(CF_X_POLICY_c2),
    'rbt_xp3:int_list=' + list(CF_X_POLICY_c3),
    'rbt_xlen:int_list=' + list(CF_X_MACRO_LEN_c0),
    'rbt_xc0:int_list=' + list(CF_X_MACRO_C0_c0),
    'rbt_xc1:int_list=' + list(CF_X_MACRO_C1_c0),
    'rbt_xc2:int_list=' + list(CF_X_MACRO_C2_c0)
  ]
  console.log(vars.join(';'))
} else if (which === 'player') {
  console.log('rbx_t1:int=0;rbx_epoch:int=0;rbx_ack:int=0;rbx_sum:int=0;rb_host:entity=0')
} else {
  console.error('usage: node tools/gen-rbt-vars.mjs host|player')
  process.exit(1)
}
