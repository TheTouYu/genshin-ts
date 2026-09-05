---
name: diff-capture-cli-builder
description: "当用户想基于“编辑器差分 + IPC 抓包”学习真实 wire，并把结论快速做成/扩展 gsts assets:* 命令行（CLI）时使用。触发场景包括：做一个新资产 CLI、把某类资产的差分+抓包结果沉淀成命令、给现有 CLI 补效果/参数/资产类型、或说“把差分+抓包变成可迭代的 CLI 开发流程”。也用于需要“先定框架，donor/细节按需差分补充”的资产命令开发。"
license: MIT
compatibility: Genshin-TS 仓库；Python3、npx tsx、Windows RawCap；复用 editor-incremental-gia-investigator / beyond-semantic-resource-reverse 技能脚本。
metadata:
  user-invocable: "false"
---

# 差分+抓包 → 命令行快速开发技能

把真实编辑器操作转成 wire 证据，再快速实现可迭代的 `gsts assets:*` CLI。
核心节奏（2026-09-05 用户定则）：**框架先定，细节按需差分补**；不要等所有 effect/参数/资产类型都闭合才动手。

## 何时用

- 用户要求“把差分+抓包学习的知识和证据，做成命令行 / CLI”。
- 要为某类 GIL 资产（单位状态、技能、UI、信号等）新增或扩展 `assets:*` 命令。
- 已有 CLI 遇到不支持的 ID/参数，需要“再差分+抓包补 donor/细节”。
- 一句话触发示例：
  - “把这些数据做成第一版 CLI”
  - “支持创建和列出应该数据够了，其他 ID 结构一样，出问题再补”
  - “把单位状态/效果/资产做成命令”
  - “这个流程做成技能/可迭代 CLI 开发流程”

## 核心原则

1. **一次抓包 = 多次差分**：type1017/IPC 帧流相邻帧就是最小差分，不需要“每步操作保存一次 GIL”。
   连续抓包后先做帧级语义差分，把连续编辑拆成小步骤（参考 `status_frame_diff.py`）。
2. **GIL 是落盘真值，IPC 是目录/定义/结构通道**：写回 CLI 以 GIL root 结构为准；
   IPC 用于对照、命名和发现“编辑器连续操作规律”。
3. **框架先行**：只要一类资产的 root 骨架（如 root15/16/6）已由真实差分确认，就可以先实现
   “创建/列出/添加”的 CLI。未知 ID 先用最小结构骨架（如 effect entry `{1: effectId}`），
   不因缺 donor 拒绝整个框架。
4. **donor 按需补充**：已知 ID 用真实字节；未知 ID 出问题/要精确参数时，再做一次最小编辑器
   操作 + 差分/抓包，提取 donor hex 补进数据表，不改 CLI 框架。
5. **安全写回**：默认 `--output` 生成候选，独立回读；`--write` 才写真实地图（自动备份 +
   Temp 同步），真实写回/注入前必须用户明确确认。
6. **证据分层**：候选回读=结构层；编辑器真值对拍=结构/默认参数层；真实游戏核验=行为层。
   不要把“CLI 能生成”说成“游戏已验证”。

## 标准工作流

### 0. 前置判断

- 是否已有同类资产 CLI？先查 `src/cli/AGENTS.md` 命令族表与 `src/cli/assets_*.ts`
  （已落案例：`assets:unit-status`、`assets:global-timers`）。
- 是否已有真实 GIL 样本/Authority？先查 `docs/game-engine-knowledge/` 对应专题（如
  `unit-status.md`）和 `docs/game-engine-knowledge/AGENTS.md`。
- 缺 wire 规则时进入下面的差分+抓包；已有规则时直接按模板实现/扩展。

### 1. 启动“差分+抓包”

用户说“直接轻量启动差分和抓包 / 再差分一次 / 补一次抓包”时，**不要读长文、不要猜探针名**：

```bash
python3 .agents/skills/beyond-semantic-resource-reverse/scripts/quickstart_diff_ipc.py [probe名]
```

- 自动保存 GIL before（editor evidence + beyond evidence）并启动 RawCap。
- 打印 READY 后，请用户做**本轮最小操作**并保存。
- 用户说“好了”后收尾：

```bash
python3 .agents/skills/beyond-semantic-resource-reverse/scripts/quickstart_diff_ipc.py --finish <probe名>
```

### 2. 读证据

GIL 差分（落盘真值）：

```bash
python3 .agents/skills/editor-incremental-gia-investigator/scripts/gil-quick-diff.py \
  <before.gil> <当前地图.gil> --capture-dir <实验目录>/raw --snap <语义名> [--effect-list]
```

IPC 帧流差分（连续操作步骤）：

```bash
# dump type1017 帧
python3 .agents/skills/beyond-semantic-resource-reverse/scripts/summarize_hablp_pcap.py \
  <pcap> --dump-1017-dir <帧目录> --output <summary.json>
# 状态类语义帧差分（把连续加效果拆成每帧一步）
python3 .agents/skills/beyond-semantic-resource-reverse/scripts/status_frame_diff.py <帧目录|pcap> [--output steps.txt]
```

结论落到实验目录 `PROGRESS.md`：样本路径/hash、roots 变化、新增记录结构、IPC 定义、未闭合项。

### 3. 确定 CLI 范围

先做“最小可用 + 可迭代”：

- `list`：只读回该类资产（ID/名称/子项）。
- `create`：按真实 root 骨架新增资产（root 双写 + 目录/页签登记）。
- `add-effect` / `update` / `delete`：按需迭代。

不要一开始追求任意参数编辑；先把“结构能建、能列、能追加”闭环。

### 4. 按 CLI 资产模块模板实现

参考已落地的单位状态案例：

- 模块：`src/cli/assets_unit_status.ts`
- 数据表：`src/cli/unit_status_data.ts`
- 注册：在 `src/cli/gsts.ts` 增加 `assets:unit-status` command + import。
- 写回模式：`--output` / `--write` + `sha256Bytes` 门禁 + `.gsts/backups` + `syncGilToTemp`，
  与 `assets_skill_config.ts` 同构。

实现 checklist：

1. 用 wire helpers（`parseWireMessage` / `emitWireMessage`）读写 root 记录，不要手拼字节。
2. 用真实 donor 作为 base 记录/子项模板；替换 ID/名称/子项列表。
3. 目录/页签登记走真实 root 容器结构（如 root6 folderId=11 + f5={typeValue, id}）。
4. 未知子项 ID 允许最小骨架，并在数据表注释写明“待补 donor”。
5. 文件头注释写明：结构路径、donor 策略、安全边界、如何补 donor。
6. 数据表注释写明：来源快照、如何新增 donor（差分+抓包 → 提取 hex → 加一行）。
7. 新增命令同步更新 `src/cli/AGENTS.md` 命令族速查（若适用）。

### 5. 核验

先在副本/候选上验证：

```bash
npx tsx src/cli/gsts.ts assets:<name> list --gil <真值.gil> --json
npx tsx src/cli/gsts.ts assets:<name> create --gil <before.gil> --id <新ID> \
  --name <名> --effects <id,...> --output <candidate.gil>
npx tsx src/cli/gsts.ts assets:<name> list --gil <candidate.gil> --json
```

再与编辑器真值对拍：

1. 用一次新的差分+抓包让用户创建“相同参数”的编辑器样本；
2. 从 before GIL 用 CLI 生成候选；
3. 对比 root15/16 中目标记录字节：结构一致即为框架通过；
4. donor 差异记录为“待补”，不影响框架结论。

通过后，真实写回/游戏注入前必须用户明确确认目标 ID/效果/地图；执行 `--write` 并请用户游戏内核对。

## 迭代补充（donor/参数细节）

当某个 ID/参数在实际使用中不被接受，或需要精确默认参数：

1. 定位效果/资产类型显示名（可从 `resources/status_effect_names.json` 等资源或问用户）。
2. 让用户在编辑器做**最小操作**（新建/添加该 ID、只改目标参数），保存。
3. 差分+抓包拿真值（必要时逐帧）。
4. 从真实 GIL 提取该子项完整 entry hex，补进数据表。
5. 重新生成候选 → 对拍 → 通过后再写回。

不要为此改 CLI 控制流；数据表与注释就是扩展点。

## 参考

- 案例复盘：`references/unit-status-cli-example.md`
- 全局计时器 CLI 案例（2026-09-05）：`src/cli/assets_global_timers.ts`；
  wire 证据在 `docs/game-engine-knowledge/components.md`（root12 正/倒计时 + root5 type16 f26）
- 差分技能：`.agents/skills/editor-incremental-gia-investigator/SKILL.md`
- IPC 抓包技能：`.agents/skills/beyond-semantic-resource-reverse/SKILL.md`
- 单位状态 Authority：`docs/game-engine-knowledge/unit-status.md`
- 全局计时器 Authority：`docs/game-engine-knowledge/components.md`、`docs/game-engine-knowledge/gil-editor-assets-semantics.md`
