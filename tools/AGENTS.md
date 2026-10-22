# `tools/`：交互式只读 GIA/GIL 分析工具

## 适用范围

这里放开发者手动运行的 GIA/GIL 解码、分析、拓扑和布局工具。它们不属于 CI 或发布流程；自动化脚本应放在 `scripts/`。

## 关键入口

- GIA 解码/结构：`decode-gia.ts`、`analyze-composite-gia.ts`、`parse-gia-graphs.ts`、`inventory-gia-units.ts`。
- GIL 节点图/追踪/信号/变量：`parse-gil-node-graph.ts`、`explain-gil-node-graph.ts`、`trace-gil-exec-flow.ts`、`trace-gil-dataflow.ts`、`list-gil-node-graphs.ts`、`compare-gil-node-graph.ts`、`wire-inspect.ts`、`decode-gil-raw.ts`、`scan-gil-signals.ts`、`inspect-gil-custom-variables.ts`。
- 差分/布局：`diff-gil-files.ts`、`dump-layout.ts`、`topology.ts`。
- 屏幕/可点性（GUI 感知层，离线只读帧）：`ys-screen`（文本/控件/分区/邻接/遮挡/**容器层 containers[]**——面板/卡片/格子/按钮，含 skin/text/glyphs/badges/clipped；`--containers` 轻量输出）、`ys-layer`（层级/模态/scrim/关闭控件）、`ys-afford`（可点性打分：红点>一小一大>颜色对比>圆环>邻近文字）、`ys-watch`（ROI 变化事件：文字/颜色/数值/时间）、`ys-editor/ys-view`（看图包：整帧+标注+2×2 切片+index.json，一条命令，供判不准时模型自己看）。
- PKC：`pkc.py`、`evaluate_pkc_retrieval.py`、`validate_pkc_bundle.py`（知识树操作，不是游戏分析工具）。

## 修改前

- 先确认工具是解码、结构分析、Composite 分析、拓扑、coverage、layout、PKC 还是 Markdown 预览用途。
- 涉及真实 GIA/GIL 结论时，先确定具体样本、命令、观察字段和结论范围；工具输出只是证据的一部分。
- 新工具以 argv 接收样本路径；不要硬编码用户本机路径或游戏目录。

## 修改规则

- 工具默认通过 `npx tsx tools/<tool>.ts <file>` 运行，应保持参数可见、失败信息清楚和输出适合人工检查。
- 工具必须保持只读，不修改 `.gia`、`.gil`、游戏目录或真实样本；PKC 工具按自身命令语义操作知识库，不碰游戏文件。
- 解码 JSON 默认值、结构统计和 coverage 分类不能单独证明 wire presence 或游戏行为；报告时要说明边界。

## 验证

- 使用仓库内或用户明确提供的最小样本运行工具，检查帮助、错误路径和正常输出。
- 改动 TypeScript 后运行 `npm run build`（若适用）和 `git diff --check`。
- 修改 PKC 工具后按 `tools/pkc.py --help` 或对应 `validate_pkc_bundle.py` 做冒烟验证。
- **验证参数行为前先 `grep -n "argparse\|sys.argv" <工具>`**：没有 argparse 的工具会把 `--help` 当真参数执行
  （2026-10-22 实测：给 `ys-loop` 传 `--help` 直接开跑一轮真机流程、抬了一次原神窗）。没有 argparse 就只做
  `py_compile` / `bash -n` / import，绝不追加未知参数。

## 不要做

- 不要把注入、批量修改、CI/发布任务放入这里。
- 不要把工具的成功输出写成“已在游戏内验证”。

## ys-editor（GUI 注入/感知）：X 会话环境必须走唯一入口

本机是 Wayland(KWin) + Xwayland `:1`，X 访问要 `XAUTHORITY=/run/user/<uid>/xauth_*`（**每会话随机文件名**）。
同一条根因（环境解析散落在各工具里）3 周内被独立修了 4 次（`bf11dfa6`/`4431b48c`/`26b2a96e`/`4946d448`），
所以：**凡是要碰 X 或 ydotool 的工具，环境只从统一入口取，不在调用点自己读 `os.environ`。**

| 栈 | 统一入口 | 一行接入 |
| --- | --- | --- |
| bash | `tools/ys-editor/ys-env.sh` | `. "$HERE/ys-env.sh"` |
| python | `tools/ys-editor/ys_env.py` | `env=ys_env.env(YS_SLOT_ACTIVE="1")` |

可复制模板（新增工具时抄这两行）：

```bash
# bash：先定 HERE，再 source；之后 xdotool/ydotool/wmctrl 直接用
HERE="$(dirname "$(readlink -f "$0")")"; . "$HERE/ys-env.sh" >/dev/null 2>&1 || true
```

```python
# python：子进程一律传 env=（DISPLAY 空串兜底 :1、XAUTHORITY 取最新 xauth_*、YDOTOOL_SOCKET 缺省）
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ys_env
subprocess.run(["ydotool", "key", "1:1"], env=ys_env.env(YS_SLOT_ACTIVE="1"))
```

- 进程内 X 客户端（ctypes/XShm/XQueryPointer）用 `ys_env.apply()` 写 `os.environ`；子进程只认 `env()`。
- 诊断：`python3 tools/ys-editor/ys_env.py --json`；失败分支把 `ys_env.explain()` 拼进 stderr——
  只回 `injected:false` 不算错误信息（4946d448 的坑）。
- 门禁 `env-single-source`（`python3 tools/ys-editor/tests/env-single-source-scan.py`，登记在
  `tools/failure-ledger.gates.tsv`，tier=fast）：扫描 `tools/ys-editor/` 与 `tools/` 顶层，执行
  xdotool/ydotool 却未引用入口 ⇒ 红（**严格模式，没有 EXEMPT/NOTE 通道**）。注释、文档串、纯查表、
  `re.*` 判据模式不算；只在提示语里 `source …/ys-env.sh` 不算引用。
- 环境变量（`DISPLAY` / `XAUTHORITY` / `YDOTOOL_SOCKET`）不要在工具里写死：socket 路径也别写
  `/run/user/1000/…`（换 uid / 换机就错），一律由入口提供。
- **窗口 id 同理只有一处实现**：`ys_win.py`（python: `import ys_win; ys_win.resolve()` /
  `ys_win.resolve_editor()`；bash: `"$(ys-win-id)"`）。不要在工具里写死任何窗口 id 或回退旧 id——
  解析不到就报错退出（fail-closed）。门禁 `no-dead-window-id` 会扫（判据：7-8 位十六进制 id 字面量）。
