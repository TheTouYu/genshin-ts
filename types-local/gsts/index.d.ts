/// <reference path="../../src/runtime/server_globals.d.ts" />

// 开发仓库统一 src 单副本：dist 是构建产物（可能过期/缺失），双副本会让
// branded 类型（entity/vec3 等带 private brand）在 nominal 层面互不兼容。
export * from '../../src/index.js'
