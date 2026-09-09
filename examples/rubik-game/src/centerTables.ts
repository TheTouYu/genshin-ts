// 自动生成：node examples/rubik-3x3/tools/gen-center-tables.mjs —— 勿手改
// 整体旋转归一化表（只用正方向 x/y/z，moveId 10/11/12；执行器逐条 append）
export const CF_CENTER_LOOKUP: bigint[] = [-1n, -1n, 0n, 1n, 2n, 3n, -1n, -1n, 4n, 5n, 6n, 7n, 8n, 9n, -1n, -1n, 10n, 11n, 12n, 13n, -1n, -1n, 14n, 15n, 16n, 17n, 18n, 19n, -1n, -1n, 20n, 21n, 22n, 23n, -1n, -1n]
export const CF_CENTER_MACRO_C0: bigint[] = [0n, 11n, 11n, 11n, 12n, 10n, 10n, 11n, 10n, 10n, 10n, 12n, 10n, 10n, 10n, 11n, 10n, 10n, 12n, 10n, 10n, 10n, 12n, 10n]
export const CF_CENTER_MACRO_C1: bigint[] = [0n, 11n, 11n, 0n, 12n, 10n, 10n, 10n, 11n, 10n, 10n, 11n, 0n, 12n, 12n, 10n, 11n, 11n, 0n, 11n, 11n, 10n, 12n, 10n]
export const CF_CENTER_MACRO_C2: bigint[] = [0n, 0n, 11n, 0n, 0n, 0n, 11n, 10n, 11n, 10n, 11n, 0n, 0n, 12n, 0n, 0n, 0n, 10n, 0n, 10n, 11n, 10n, 12n, 12n]
export const CF_CENTER_MACRO_C3: bigint[] = [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 10n, 0n, 0n, 0n, 0n, 0n, 0n, 10n, 0n, 0n, 11n, 11n, 0n, 0n]
export const CF_CENTER_MACRO_LEN: bigint[] = [0n, 2n, 3n, 1n, 2n, 2n, 3n, 3n, 3n, 3n, 4n, 2n, 1n, 3n, 2n, 2n, 2n, 4n, 1n, 3n, 4n, 4n, 3n, 3n]
// 尺寸：{ lookup: 36, macros: 24 } // macros=[[],[11,11],[11,11,11],[11],[12,12],[10,10],[10,10,11],[11,10,10],[10,11,11],[10,10,10],[10,10,11,10],[12,11],[10],[10,12,12],[10,12],[11,10],[10,11],[10,11,10,10],[12],[10,11,10],[10,11,11,11],[10,10,10,11],[12,12,12],[10,10,12]]
