# D 轴专题文档规范（T04 补充 · 与 _TOPIC-SPEC.md 配合使用）

> **先读 `_TOPIC-SPEC.md`**，本文件只补充 D 轴特有的差异。
> D 轴（能力面）与 K 轴（优质度面）的证据结构不同，写法也不同。

## 一、为什么 D 轴写法要变

K 轴的知识只能来自人（官方文档不写"怎么做好玩"），所以 K 轴以**视频语料**为主。
D 轴正相反：**引擎事实的权威来源是官方文档，不是讲师口述**。

T03 的覆盖矩阵已暴露这一点：**D1 概念模型只有 4 个源讲，且与 K 轴零共现**——
因为教程都在讲"怎么做"，基础概念只在官方文档里。所以：

| | 主源 | 辅源 |
|---|---|---|
| K 轴 | 视频语料（`learn/`） | 官方文档、评论 |
| **D 轴** | **官方指南（`docs/ui-tutorial/`）+ 官方 KB（远程）** | 视频语料（补充实操细节） |

## 二、官方文档输入（D 轴必读）

本地已镜像官方综合指南全文，**按你的域读对应文件**：

| D 域 | 必读官方文件 | 关键章节 |
|---|---|---|
| D0 元知识 | `docs/ui-tutorial/official-guide-editor-interface.md` | 界面介绍 / 千星沙箱 / 奇域资产中心 / 编辑工具 |
| D1 概念模型 | `docs/ui-tutorial/official-guide-concepts.md` | 单位 / 玩家 / 复苏 / 角色 / 造物 / 复杂造物 / 物件 / 水物件 / 白盒物件 / 本地投射物 / 关卡 / 功能 / 技能 |
| D2 编辑器资产 | `official-guide-editor-interface.md`（地形编辑/实体摆放/元件库/战斗预设/关卡设置/资产导入导出）+ `official-guide-concepts.md`（功能：43 个组件） | — |
| D3 逻辑编写 | `official-guide-nodes-server.md` + `official-guide-nodes-client.md` + `official-guide-auxiliary-appendix.md` | 执行/事件/流程控制/查询/运算节点；泛型引脚 / 节点图变量 / 复合节点 / 三类节点图日志 / 信号 / 字典 / 结构体 |
| D4 玩法系统 | `official-guide-concepts.md` | 外围系统 / 资源系统 / 技能 / 复杂造物 |
| D5 表现层 | `docs/ui-tutorial/official-ui-tutorial.md`（UI 专项）+ `official-guide-concepts.md` | 20 种界面控件 / 界面布局 / 界面控件组 / 素材库 / 主镜头 |
| D7 工程化工具链 | `official-guide-auxiliary-appendix.md` + `docs/capability-coverage-map.md` | 负载计算功能 / 风险检查功能 / 编辑项范围限制 |

远程官方 KB（305 篇，需要时查）：
```bash
bash .agents/skills/miliastra-knowledge/references/query.sh get_document '<file 路径>'
bash .agents/skills/miliastra-knowledge/references/query.sh rag_search '<问题>'
```

## 三、D 轴的证据等级特别规定

- 官方指南原文 → `硬规则`
- 官方 KB 文档 → `硬规则`
- **我方源码/实测命令** → 新增等级 `我方实测`（用于「我方覆盖度」一节；比视频更硬）
- 视频讲师的话 → 照 `_TOPIC-SPEC.md` 的四级

## 四、D 轴文档结构（在 `_TOPIC-SPEC.md` 六段式上微调）

```markdown
# <域/专题名>

> 状态：**当前实现**（2026-09-15 建）
> 官方权威：`docs/ui-tutorial/<文件>:<行>` ｜ 语料：<N> 个源 / <M> 条
> 证据分级：硬规则（官方）> 我方实测 > 实测 > 经验共识 > 个人经验

## 一、官方定义与命名
（**以官方原文为准**，带 `文件:行`；口语别名另注）

## 二、源绑定
| 源 | 类型 | 覆盖什么 | 证据等级 |
（官方文件 + ≥1 视频教程；官方指南本身可作为「≥1 教程」的满足项之一，但**不能只有官方**——
objective 要求每专题 ≥1 教程源）

## 三、硬规则清单（官方）
（逐条带 `文件:行`。这是 D 轴的核心资产——**可被实现直接依赖**）

## 四、实操细节（来自视频语料）
（官方文档不写的做法/坑/邪修；带 BV + 时间戳）

## 五、我方覆盖度
（照 `_CAPABILITY.md` 的三档 + 证据）

## 六、诊断路径
（现象 → 查什么 → 我方命令）

## 七、缺口与待验证
```

## 五、返回给协调者

**只返回**（≤150 字）：文件路径 + 硬规则条数 + 教程源数 + 一句话发现。**不要贴内容。**
