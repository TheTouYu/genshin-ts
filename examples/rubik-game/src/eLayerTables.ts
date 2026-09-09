// 自动生成：node examples/rubik-3x3-client/tools/gen-e-layer-tables.mjs —— 勿手改
// 中二层(E层)棱块策略：E 棱 = ep 索引 8..11（FR/FL/BR/BL）；state=pos*2+eo；宏: move code 0..17；未填 policy=-1
export const CF_E_MACRO_LEN_c0: bigint[] = [1n, 1n, 1n, 8n, 8n, 8n, 8n, 8n, 8n, 8n, 8n, 8n, 8n, 8n, 8n]
export const CF_E_MACRO_C0_c0: bigint[] = [0n, 1n, 2n, 8n, 6n, 9n, 11n, 0n, 2n, 2n, 0n, 2n, 0n, 0n, 2n]
export const CF_E_MACRO_C1_c0: bigint[] = [18n, 18n, 18n, 2n, 0n, 0n, 2n, 12n, 8n, 17n, 6n, 14n, 9n, 15n, 11n]
export const CF_E_MACRO_C2_c0: bigint[] = [18n, 18n, 18n, 6n, 8n, 11n, 9n, 2n, 0n, 0n, 2n, 0n, 2n, 2n, 0n]
export const CF_E_MACRO_C3_c0: bigint[] = [18n, 18n, 18n, 0n, 2n, 2n, 0n, 14n, 6n, 15n, 8n, 12n, 11n, 17n, 9n]
export const CF_E_MACRO_C4_c0: bigint[] = [18n, 18n, 18n, 12n, 17n, 14n, 15n, 2n, 0n, 0n, 2n, 0n, 2n, 2n, 0n]
export const CF_E_MACRO_C5_c0: bigint[] = [18n, 18n, 18n, 0n, 2n, 2n, 0n, 8n, 12n, 6n, 17n, 9n, 14n, 11n, 15n]
export const CF_E_MACRO_C6_c0: bigint[] = [18n, 18n, 18n, 14n, 15n, 12n, 17n, 0n, 2n, 2n, 0n, 2n, 0n, 0n, 2n]
export const CF_E_MACRO_C7_c0: bigint[] = [18n, 18n, 18n, 2n, 0n, 0n, 2n, 6n, 14n, 8n, 15n, 11n, 12n, 9n, 17n]
export const CF_E_POLICY_c0: bigint[] = [1n, 7n, 8n, 0n, 3n, 1n, 0n, 2n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, 3n, 4n, 10n, 5n, 5n, 6n, 6n, 0n, 9n, 1n, 0n, 4n, 1n, 10n, 2n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, 4n, 5n, 5n, 6n, 6n, 1n, 7n, 8n, 0n, 3n, 1n, 0n, 2n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, 3n, -1n, -1n, 5n, 5n, 6n, 6n, 5n, 1n, 12n, 2n, 0n, 11n, 1n, 0n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, 5n, 6n, 14n]
export const CF_E_POLICY_c1: bigint[] = [1n, 7n, 8n, 0n, 3n, 1n, 0n, 2n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, 3n, 4n, 10n, -1n, -1n, 6n, 6n, 0n, 9n, 1n, 0n, 4n, 1n, 10n, 2n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, 4n, -1n, -1n, 6n, 6n, 1n, 7n, 8n, 0n, 3n, 1n, 0n, 2n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, 3n, -1n, -1n, -1n, -1n, 6n, 6n, 6n, 1n, 0n, 2n, 1n, 13n, 14n, 0n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, 6n]
export const CF_E_POLICY_c2: bigint[] = [1n, 7n, 8n, 0n, 3n, 1n, 0n, 2n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, 3n, 4n, 10n, 5n, 5n, -1n, -1n, 0n, 9n, 1n, 0n, 4n, 1n, 10n, 2n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, 4n, 5n, 5n, -1n, -1n, 1n, 7n, 8n, 0n, 3n, 1n, 0n, 2n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, 3n, -1n, -1n, 5n, 5n, -1n, -1n, 5n, 1n, 12n, 2n, 0n, 11n, 1n, 0n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, 5n, -1n, -1n]
export const CF_E_POLICY_c3: bigint[] = [1n, 7n, 8n, 0n, 3n, 1n, 0n, 2n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, 3n, 4n, 10n, -1n, -1n, -1n, -1n, 0n, 9n, 1n, 0n, 4n, 1n, 10n, 2n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, 4n, -1n, -1n, -1n, -1n, 1n, 7n, 8n, 0n, 3n, 1n, 0n, 2n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, 3n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n, -1n]
// 尺寸：{"ePolicy":384,"eMacros":15,"eMaxLen":8,"unfilled":120}
