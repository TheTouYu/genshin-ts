# 案例：单位状态 assets:unit-status（2026-09-05）

本文件是 `diff-capture-cli-builder` 的首个完整案例，展示“差分+抓包 → 学 wire → 快速 CLI → 按需补 donor”的落地方式。

## 目标

- 命令：`gsts assets:unit-status list|create|add-effect`
- 第一版范围：单位状态创建/列出/添加任意 effectId（默认参数）。
- 原则：框架先定；donor/参数细节按需差分+抓包补充。

## 证据来源

- Authority：`docs/game-engine-knowledge/unit-status.md`
- 差分+抓包轮次：
  - `.scratch/editor-incremental-evidence/2026-09-05-probe_20260905_011520/`
  - `.scratch/beyond-semantic-resources/evidence/2026-09-05-probe_20260905_011520-probe/`
  - `.scratch/editor-incremental-evidence/2026-09-05-cli_verify_status/`
  - `.scratch/beyond-semantic-resources/evidence/2026-09-05-cli_verify_status-probe/`
- 真值样本状态：
  - `1077936147 测试状态`（单效果 2010001）
  - `1077936148 新建状态_2`（20 个效果，帧流逐帧追加）
  - `1077936149 新建状态_3`（18 个效果）
  - `1077936150 新建状态_4`（编辑器真值，2110001+2180001）

## 已确认 wire 骨架

```text
root 6   状态分组 folderId=11：f3「未分类页签」tab 追加 f5={1:1900, 2:状态ID}
root15   状态定义记录：{1:id, 2:1, 4[*]: 分节}
         4[0] = {1:1, 11:{1:名称}}
         4[1] = {1:6, 21:{1:{1..6 配置, 3:效果列表容器}}}
root16   平行引用：{1:id, 2:id, 3[*]: 与 root15.4[*] 同构；3[0].11 名称空}
效果列表容器 = repeated f1(effect entry) + f2(tail blob)
effect entry = {1: effectId, 2[*]: 参数条目}
```

## CLI 落点

- CLI 模块：`src/cli/assets_unit_status.ts`
- donor/数据表：`src/cli/unit_status_data.ts`
- 注册：`src/cli/gsts.ts` `assets:unit-status`
- 写回模式：`--output` 候选 / `--write` 真实写回（sha256 门禁 + `.gsts/backups` + `syncGilToTemp`）

## donor 策略

- 已知 effectId：使用真实编辑器字节。
- 未知 effectId：生成最小结构 entry `{1: effectId}`，保证框架可用。
- 补充 donor 方法：
  1. 编辑器最小操作（新建/添加该 effect，或改目标参数）并保存；
  2. 差分+抓包拿真值；
  3. 从真实 GIL root15 记录提取该 effect entry 完整 hex；
  4. 在 `unit_status_data.ts` 增加一行，注明来源。

## 核验结果

- `list`：可读回 21 个真实状态。
- `create --output`：生成候选并读回。
- `add-effect --output`：保留 root15/16 双写并追加。
- 未知 effect `999999` 兜底创建成功（结构层）。
- 对拍 `1077936150 新建状态_4 [2110001,2180001]`：
  - 框架结构一致；
  - 补 donor 后 2110001/2180001 字节与编辑器真值一致；
  - 剩余差异：CLI 基座来自 1077936147（`f32=1.0/f4=1/tail=fd0a`），编辑器新状态为 `f32=4.0/无f4/tail=fc0a`。这是合法真实形态差异，属后续可精修项，不影响框架。

## 未闭合 / 可迭代点

- 多形态效果（120001/380001/400001/1720001/2170001 等）尚无选定默认 donor，使用最小骨架或按需补。
- 基座配置字段（f1 f32、f4 presence、tail blob）尚未做到“任意新状态与编辑器首建完全一致”。
- root46 登记未由 CLI 写入；真实写回后依赖编辑器/游戏是否接受，需用户游戏核验。
- 页签归属：CLI 当前追加到“未分类页签”，编辑器可能追加到当前选中的自定义页签。

## 复用到其他资产

1. 找对应 Authority 或先差分+抓包确定 root 骨架/登记点。
2. 从真实 GIL 抽取 base 记录与 donor 子项。
3. 仿照 `assets_unit_status.ts` 写 `assets_<name>.ts` + 数据表 + 注册。
4. 先做 `list/create/update` 最小闭环，再用“新差分+抓包”对拍。
5. 保持“框架先行、donor 按需补”的注释与扩展点。
