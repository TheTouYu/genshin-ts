# 档案：GUI AGI 模块（L3）

> 状态：当前实现（**摘要 + 指针**；判据细节以 `AGI-BAR.md` 为准，读数以 `STATE.md` 为准）
> 来源：`.scratch/gui-stack/AGI-BAR.md`、`STATE.md`、`tools/ys-editor/`、失败账本
> 最近校验：2026-10-22
> 读法：做 GUI 相关任务时读本文件 → 再按 §六 指针读权威文件，别在归档文档里找现状

---

## 一、这个模块要做什么

把"看屏幕 → 判断状态 → 动作 → 复验"做成**通用**的世界状态服务：
- 一个 schema、三个动词 `look / act / wait_until`；
- 返回**回执**（结构化对象/文本/状态），不返回像素；
- 预算写进契约：超预算要**降级并说出来**；
- 不抬窗取数，`act` 默认 dry-run。

## 二、六层能力与当前成色（2026-10-18 实测，后续有改进但没重测）

| 层 | 内容 | 成色 |
|---|---|---|
| L1 感知 | 容器/控件/文字 | 容器命中 1/124=0.8%；不透明 95–100%、半透明 0–67%；纯图标/头像全漏 |
| L2 结构 | parent/group 层级 | parent 曾全 None；D3 后 parent F1 编辑器 0.78 / 游戏 0.91 |
| L3 状态 | 选中态/开关态 | schema 曾无 state 字段；绝对亮度判据失效 |
| L4 可点性 | clickable | 曾恒 unknown |
| L5 完整性 | clipped | 曾恒空；单帧滚动特征全被证伪 |
| L6 否定闸门 | "扫全才许说不存在" | **完全没有**（"千星入口"在首屏之下属此层） |

## 三、判"是否达标"的四把尺子

见 `../01-charter.md` §三：ms 级单次 / 学习型检测 / 主动补全 / 用户在环。另加人类基准 5s。

## 四、关键工具（真名，能直接跑）

| 工具 | 用途 | 注意 |
|---|---|---|
| `worldsvc look/act/wait` | 三动词主入口 | `act --expect` **必填**（漏了 rc=2、stdout 空） |
| `ys-capture` | 抓帧（预编码/环缓冲） | `--format png` fail-closed，`--encode-if-needed` 不稳 |
| `ys-state` / `ysd` | 判态（单一源） | 空闲 123–129ms / 游戏在跑 330–340ms |
| `ys-scroll` / `ys-list` | 滚动 + 结构化列表 | seek 约 8 行/次，多执行几次即可 |
| `ys-session` | 屏幕租期（begin/end） | 内置 grant；空闲 3s 自动交还 |
| `ys-gui-slot` / `ys-focus-guard` | 焦点槽 / 归还守卫 | 无凭据 slot rc=6 |
| `ys-probe` | 未知界面探索 | 单变体 6.35s（含注入开销） |
| `ys_advice.py` | 教练建议 `world.advice[]` | 需 daemon 进程级累积 ≥3 次 observe；CLI 单次恒空 |
| `ys-read --grep` | 两帧稳定判据 | 两次文字集合不一致 → rc=9 `UNSTABLE_UI` |

## 五、已踩过的坑（复现即可验证）

1. `ATTRIBUTION_OTHER_DESKTOP`：`ys-session begin` 后首次 look 可能发生，重试 1–2 次。
2. 先手动 grant 会 `GRANT_STILL_VALID`——租期要走 `ys-session begin`。
3. `frames_written` 低是设计（只写变化帧），不是故障。
4. 单帧不可信：角色切换是"名字先变、头像/立绘后变"。
5. 跨栏混串：文字按 y 行硬合并（见 `../05-open.md` O-2026-10-22-4）。

## 六、权威指针

- 判据：`.scratch/gui-stack/AGI-BAR.md`（六层 + 四条口径 + 预算表 + 已证伪路线）
- 现状：`.scratch/gui-stack/STATE.md`（组件版本、工作线、读数）
- 恢复报告：`.scratch/gui-stack/CONTEXT-2026-10-22.md`；交接：`HANDOFF-C-2026-10-22.md`
- 技能：`gui-world-state`（感知）、`gui-perception-loop`（方法论）、`device-playtest-loop`（真机闭环）
- 门禁：`tools/failure-ledger.gates.tsv`
