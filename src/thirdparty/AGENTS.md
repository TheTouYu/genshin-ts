# `src/thirdparty/`：Vendor 数据与代码

## 适用范围

本目录包含 vendored 的 GIA protobuf、生成器和节点数据。它是外部数据快照，不是项目日常业务源码。

## 访问与审计

- 项目代码通过 `src/compiler/gia_vendor.ts` 使用公开 vendor API，不直接深层导入 vendor 路径。
- 一致性审计脚本：`scripts/audit-vendor-gia-files.ts`、`scripts/check-node-def-consistency.ts`、`scripts/check-client-definitions-consistency.ts`。

## 修改前

- 先确认问题能否在项目 adapter、映射或生成流程解决；通常应查看 `src/compiler/gia_vendor.ts`、Stage 3 映射和相关测试。
- 如确需更新 vendor，先向用户说明上游来源、版本/提交、影响文件、再生成步骤和验证计划。

## 修改规则

- 不手改本目录文件，也不要在项目其他目录复制 vendor 数据来绕过同步流程。
- protobuf schema、节点 ID、pin records 和 concrete map 的变化必须随 vendor 同步流程处理，并检查项目映射、生成脚本和一致性审计。
- vendor 是编码机制和数据来源，不自动等同真实游戏编辑器规范；真实 GIA 结论仍需独立样本证据。

## 验证

- vendor 更新后运行约定的生成、一致性审计、构建和受影响回归；最后运行 `git diff --check`。

## 不要做

- 不要直接补 node ID、pin record、protobuf 字段或 `any` workaround 来修单个案例。
- 不要把 vendor 编码成功报告为游戏行为已经验证。
