# GUI 操作目录（catalog）

> 状态：**当前实现**（2026-10-17 建）｜来源：`docs/ui-tutorial/official-guide-editor-interface.md`（2576 行 / 69 小节）
> 生成器：`tools/gui-catalog`｜验收器：`tools/ys-gates --only 6`

## 为什么有它

"按官方指南就能完成编辑器的全部操作"这句话要能成立，必须先有**分母**：指南是界面与概念的散文，
不是操作清单。catalog 把散文机械抽成**一条一个可执行操作**，每条带**逐字原文引用与行号**，
所以它既能当分母，也能当索引入口（点开就知道"指南哪一行说了这件事"）。

## 文件

| 文件 | 内容 |
|---|---|
| `official-guide-editor-interface.tsv` | 操作候选（13 列，见下） |
| `official-guide-editor-interface.sections.tsv` | 69 个小节台账（含 0 操作小节与原因），**盲区显式化** |
| `measurements.tsv` | 实测台账：每条升档的操作一行证据（可复现命令 + 读数） |
| `coverage.jsonl` | 覆盖率历史（`./tools/ys-gates --only 6 --record` 追加），用来看**单调性** |
| `channels.md` | 定位通道矩阵：各通道的实现、读数、局限 |

## 列

`id / file / line / section / quote / intent / action / target / precond / postcond / channels / status / notes`

- `quote` **必须逐字**出现在指南里（`tools/gui-catalog verify` 逐行 grep -F 验真，不中即弃）。
- `target` 只写**描述**（面板/控件类型/文本标签/图标含义/区域），**不写像素坐标**——坐标归 `ys-state` 与锚图库。
- `postcond` 必须**可观测**；指南没写可观测效应时保留占位符「需实测补后置断言」（当前 228/352 条）。

## 状态机（只有实测能升档）

```
待测 → 可定位 → 可执行 → 可验证
  ↘ 非操作（复核后确认不是可执行操作，分母里剔除但保留行）
```

- **可定位**：至少一条定位通道拿到候选，且与第二通道或已知实测点对账一致（证据进 `measurements.tsv`）。
- **可执行**：前置态成立 → 动作执行 → 后置断言成立，且退出码/观测值有记录。
- **可验证**：`tools/round-report --replay` 能只凭落盘物重算出结论。

`tools/ys-gates --only 6` 会检查：catalog 里状态≥可定位的行**必须有台账**、台账状态必须与 catalog 一致、
台账不许有孤儿 id。**自己改 status 而不留证据 → 门槛⑥ 直接红。**

## 怎么用

```bash
./tools/gui-catalog extract docs/ui-tutorial/official-guide-editor-interface.md   # 重抽（改动词表后）
./tools/gui-catalog verify  docs/ui-tutorial/official-guide-editor-interface.md \
                            docs/maintenance/gui-catalog/official-guide-editor-interface.tsv
./tools/gui-catalog stats   docs/maintenance/gui-catalog/official-guide-editor-interface.tsv
./tools/ys-gates --only 6   # 门槛⑥：分母存在且可信（覆盖率数字只报，阈值由用户定）
./tools/ys-gates --only 6 --record   # 顺带把读数写进 coverage.jsonl 看单调性
```
