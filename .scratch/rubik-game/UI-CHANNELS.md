# UI 资产通道侦察报告（G4 步20，2026-09-09）

> 结论先行：**UI v3 三界面全部有既有通道承载，无「判死」项**；真正的缺口集中在 4 个 wire 细节（插值/进度条/计时器/页内状态设置），均可走「克隆官方→差分」兜底。本报告=票04 执行前的通道对号。

## 一、通道现状（实测）

| 通道 | 实测证据 | 覆盖 |
|---|---|---|
| `assets:ui create --type floating-page --on library` | src/cli/assets_ui.ts:91/109（票10 落地；显式三元组 ID：实体/容器/关闭按钮顺延） | 界面①③ 悬浮页壳 |
| `assets:ui floating-page variable add` | assets_ui.ts:112 | 页变量 |
| `addPageContainerCandidate`（页面容器） | ui/src/floating-page.ts:183 | 页签容器面（①的三页签） |
| 控件三面通用（layout/悬浮页容器面） | ui/mappings.md:25（轮26/28/64 用户权威）；create 类型 custom-button/textbox/image/input-box/message-queue/tab | ①③ 内控件+② HUD 控件 |
| 素材层 | ui/src/button-materials.ts+button-material-donors.ts（ donors 克隆官方再调色） | 18 转动按钮六面色系/金色提示 |
| 语义层 list/anchor/diff | ui/src/cli.ts（只读，票04 语义命令） | 玩家细排后 AI 回读差异 |

## 二、界面×通道可行性

| 界面 | 元素 | 通道 | 判定 |
|---|---|---|---|
| ① 选关悬浮页 | 页壳+三页签 | floating-page create + page-container | ✅ 直接 |
| ① | 档位列表 | **页原生列表**（唤起节点带初始化列表数据字典+更新列表数据节点；事件出参列表索引⇄选中项一一对应——RG-DESIGN §2.2） | ✅ 无需单选项视窗控件（设计简化：不引入「单选项视窗」控件，用页原生 list） |
| ① | 开始挑战按钮 | custom-button（关联监听页签=表单确认模式，官方） | ✅ |
| ② HUD 常驻层 | 关卡名/步数文本框 | textbox（插值缺口见下） | ⚠️ 缺口 G1 |
| ② | moves/par 进度条 | **缺口 G2**（create 类型无 progress-bar） | ⚠️ 克隆/差分 |
| ② | 正计时控件 | **缺口 G3**（create 类型无 timer 控件） | ⚠️ 克隆/差分 |
| ② | 18 转动按钮+提示+重开+菜单 | custom-button + 素材层 | ✅ |
| ③ 结算悬浮页 | 星级文本+统计文本+按钮组 | floating-page + textbox + custom-button | ✅（染色 `<color>` 官方实证） |

## 三、缺口清单（每条：官方出处+我方证据+建议动作）

| # | 缺口 | 官方出处 | 我方证据 | 建议动作 |
|---|---|---|---|---|
| G1 | 文本框插值 wire（f505 变量引用形态） | docs/ui-tutorial（变量变化实时刷新） | ui-controls.md 63 轮差分未含插值形态；RG-DESIGN §6 风险4 | **10 秒编辑器差分**：HUD 文本框插 moves 变量→保存→提取 wire（用户配合一轮） |
| G2 | 官方进度条控件创建 | docs/ui-tutorial（官方进度条） | create 类型枚举无此项 | 编辑器放一个官方进度条→diff 提取→clone 通道或补 create 类型 |
| G3 | 官方计时器控件创建 | docs/ui-tutorial（官方计时器控件） | 同上 | 同 G2（可与 G2 同轮差分） |
| G4 | 悬浮页**内**控件能否用通用「设置界面控件(组)状态」 | 教程自注待核验 | 未实测 | 低风险绕行：页有专属唤起/关闭/更新列表三节点，初版不依赖页内状态设置 |

## 四、票04 执行顺序建议（含兜底）

1. **零差分先行**：floating-page ①③ 壳+页签+custom-button 全套+HUD 文本框/按钮（不含插值）→ 注入 → 用户编辑器核验形态。
2. **一轮差分打包**：G1 插值+G2 进度条+G3 计时器（用户一次编辑器操作 3 个控件→保存→我方提取 wire）。
3. 插值落地后接 rgState 的 rg_* 变量（HUD 绑定收口）。

## 五、人判挂账提醒

- UI v3「对局按钮放常驻层非悬浮页」设计决策（RG-DESIGN §2.1）**待用户认可**——本报告按此执行，异议则改。
