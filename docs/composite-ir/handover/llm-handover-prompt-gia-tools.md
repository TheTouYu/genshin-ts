# GIA 数据流探查工具包 — 交接到新 LLM 的完整提示词

> 你即将接手一个 Genshin Impact 自定义节点图（GIA）文件的数据流分析任务。
> 以下是全部工具说明、资源路径和分析方法。

---

## 一、工作目录与环境

```sh
工作目录: /home/h/genshin-ts
Node.js 运行器: npx tsx
运行方式: 所有命令从 /home/h/genshin-ts 执行
```

注意：`tsx` 会输出一行 `[DEP0205] DeprecationWarning` 到 stderr，不影响 stdout。可用 `NODE_OPTIONS='--no-deprecation'` 环境变量屏蔽。

---

## 二、核心工具：trace-dataflow.ts

文件位置：`tests/composite/trace-dataflow.ts`（995 行）
GIA 解码器：`dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js`
节点名称数据库：`dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js`

### 基本语法

```sh
npx tsx tests/composite/trace-dataflow.ts <文件路径> <节点索引|节点名> [参数索引...] [选项]
```

### 主要选项

| 选项 | 作用 |
|------|------|
| `--max-depth N` / `-d N` | 追溯深度，默认 5，N=0 无限制 |
| `--all-params` | 追溯目标节点所有输入参数（默认只追前 3 个） |
| `--json` | 输出嵌套 JSON（适合程序化分析和 LLM 消费） |
| `--list-nodes` / `-l` | 列出主图所有节点（无需节点参数） |
| `-c <复合名>` / `--composite <复合名>` | 进入复合 impl 图内部追溯 |

### 省略参数规则

- **省略 -c**：工具自动在所有图（主图 + 所有复合 impl 图）中按名称搜索
- **省略参数索引**：默认追溯前 `DEFAULT_MAX_PARAMS=3` 个参数
- **仅传文件名 + --list-nodes**：列出主图节点而不追溯

### 示例

```sh
# 0. 查看文件有哪些节点（第一步永远是这个）
npx tsx tests/composite/trace-dataflow.ts <文件路径> --list-nodes

# 0b. JSON 格式的节点列表
npx tsx tests/composite/trace-dataflow.ts <文件路径> --list-nodes --json

# 1. 快速查看某个节点的所有输入
npx tsx tests/composite/trace-dataflow.ts <文件路径> 7 --all-params -d 0

# 2. 查看复合 impl 图内部的节点
npx tsx tests/composite/trace-dataflow.ts <文件路径> 10 -c "复合名称" --all-params -d 0

# 3. JSON 格式（适合你阅读）
npx tsx tests/composite/trace-dataflow.ts <文件路径> 7 --json --all-params -d 0

# 4. 名字自动查找（不加 -c 会自动在所有图搜索）
npx tsx tests/composite/trace-dataflow.ts <文件路径> 节点名 --all-params -d 0

# 5. 只追某几个指定参数
npx tsx tests/composite/trace-dataflow.ts <文件路径> 7 0 1
```

### 树格式输出解读

```
InParam[0] "Vec" (Vec)
  <- n=2  复合:监听信号  OutParam[3] "r"    ← 来源节点
    InParam[0] "信号" (...)                    ← 来源节点的输入
      = "使用技能"                             ← 字面值终端
  = "短传球-自动方向"                          ← 字面值（无来源）
  ... (达到追溯深度限制 6)                     ← 截断标记
 ← 父输入 "计算分力"."w"                      ← 复合输入直通
  (未连接)                                     ← 悬空输入
```

### JSON 格式输出结构

```json
{
  "graph": "主图",
  "node": 7,
  "node_name": "Multiple Branches",
  "params": [
    {
      "index": 0,
      "name": "R<T>",
      "type": "R<T>",
      "source_type": "node",
      "source": {
        "node": 2,
        "name": "复合:监听信号",
        "out_index": 6,
        "out_name": "事件",
        "terminal": true,
        "inputs": [ ... ]
      }
    },
    {
      "index": 1,
      "name": "L<R<T>>",
      "type": "L<R<T>>",
      "source_type": "literal",
      "value": "[6 items]"
    }
  ],
  "_info": "该节点没有输入参数（InParam）...",
  "call_sites": [
    { "graph": "复合:e技能特效", "node": 32, "node_name": "复合:[时间]定时器设置与触发" }
  ]
}
```

`source_type` 取值：
- `"node"` — 来自其他节点的输出
- `"literal"` — 字面值（终端）
- `"parent_input"` — 来自父复合输入（直通）
- `"unconnected"` — 未连接

额外字段：
- `terminal: true` — 终端节点（不再继续追溯）
- `truncated: true` — 因 `--max-depth` 被截断
- `folded_count: 99` — 连续相同字面值被折叠
- `_info` — 无参节点的补充说明

---

## 三、探查方法论（完整步骤）

### Step 1: 文件结构概览

```sh
npx tsx tests/composite/trace-dataflow.ts <文件路径> --list-nodes
```

观察输出，识别：
- 哪些是普通节点（kind=22000）— 如 Get Self Entity、Multiple Branches、SetVariable
- 哪些是复合节点（kind=22001）— 如 "复合:监听信号"、"复合:获取三实体"
- 哪些是终端节点（term）— 事件上下文、图变量读取
- 节点数量、pin 数量分布

### Step 2: 按功能分组探查

将节点按功能分组后逐一探查。典型组别：
- **事件源节点**（WhenEntityIsCreated、WhenPlayerClassChanges、监听信号）
- **数据源节点**（GetNodeGraphVariable、GetCustomVariable、GetSelfEntity）
- **数据处理节点**（3DVectorZoom、Addition、Subtraction、Equal）
- **控制流节点**（MultipleBranches、DoubleBranch）
- **复合节点**（职业branch、蓄力时间、标记e技能释放）

对每个非终端节点执行：
```sh
npx tsx tests/composite/trace-dataflow.ts <文件路径> <节点id> --all-params -d 0
```

### Step 3: 复合展开

对每个复合节点（kind=22001），先找其名称，然后：
```sh
# 观察输出是否有 "复合:xxx" 名称
# 然后用 -c 进入 impl 图
npx tsx tests/composite/trace-dataflow.ts <文件路径> --list-nodes
# 找到复合名称后，列出其 impl 图节点
# 需要先用 --list-nodes 找到索引，然后对 impl 图中感兴趣的节点做：
npx tsx tests/composite/trace-dataflow.ts <文件路径> <内部节点索引> -c "<复合名>" --all-params -d 0
```

注意：复合节点在树格式输出末尾会自动显示 `[上层调用]` 信息，标注该复合被哪些节点调用。JSON 模式下 `call_sites` 字段包含相同信息。

### Step 4: 追踪数据链

对于有深层链的节点，使用 `-d 0` 确保看到完整链。观察：
- 链的深度
- 是否有截断（需增加 `--max-depth`）
- 常见终端类型：字面值、图变量、事件上下文、复合输入直通

### Step 5: 验证与交叉引用

将发现与 handover 文档交叉验证：
- `docs/composite-ir/handover/r4-passball-impl.md` — 传球.gia 的复合展开描述
- `docs/composite-ir/handover/r6-report-agent-a-json.md` — Agent A (JSON) 报告
- `docs/composite-ir/handover/r6-report-agent-b-tree.md` — Agent B (树格式) 报告

---

## 四、GIA 文件资源目录

### 复杂 GIA 文件（最适合深度分析）

路径前缀：`/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/`

| 文件 | 位置 | 大小 | 节点数 | 复合数 | 复杂度 | 说明 |
|------|------|------|--------|--------|--------|------|
| 物理运动.gia | `复杂gia/` | 117KB | ~68 | 50+ | ★★★★★ | 最大文件，物理引擎模拟 |
| 弹球.gia | `复杂gia/` | 55KB | ~40+ | 25+ | ★★★★ | 弹球物理 |
| 传球.gia | `复杂gia/` | 21KB | 24 | 15 | ★★★ | 传球技能系统 |
| 传球.gia | `./`（顶层） | 21KB | 同 | 同 | ★★★ | 顶层副本 |
| 物理运动.gia | `./`（顶层） | 117KB | 同 | 同 | ★★★★★ | 顶层副本 |

### 中等复杂度（user_edit/）

路径前缀同上 + `user_edit/`

| 文件 | 大小 | 说明 |
|------|------|------|
| 各种flow.gia | 2.9KB | 多种控制流模式 |
| 基础节点复合.gia | 2.3KB | 基础复合使用 |
| 嵌套.gia | 2.2KB | 复合嵌套 |
| 数据流输入参数合并比对.gia | 1.4KB | 数据流合并 |
| 顺序执行-比对.gia | 1.5KB | 顺序执行模式 |
| 顺序执行.gia / 顺序执行2.gia / 顺序执行3.gia | ~1KB | 顺序执行变体 |
| 两个复合节点.gia | 1.5KB | 双复合 |
| two_exec.gia / two_exec2.gia | ~900B | 双执行流 |
| 分支.gia / 分支2.gia | ~1KB | 分支控制流 |
| 基本调用节点.gia | 564B | 最简单的单节点 |
| 类型转化.gia / 类型转化_gen.gia | ~500B | 类型转换测试 |

### 小测试文件（tests/composite/output/）

路径：`/home/h/genshin-ts/tests/composite/output/`

| 文件 | 大小 | 说明 |
|------|------|------|
| mixed_composite_and_normal.gia | 1.6KB | 混合复合+普通节点 |
| replicate_mul3.gia | 1.2KB | 复合复制 |
| basic_call.gia / basic_call_param.gia | ~800B | 基础调用 |
| two_simple.gia | 2.0KB | 两个简单复合 |
| two_exec.gia | 1.3KB | 双执行流 |
| 两个复合节点.gia | 1.8KB | 中文命名复合 |
| verify_gv.gia | 707B | 图变量验证 |
| 类型转化_gen.gia | 496B | 类型转化生成 |

### 游戏导出目录的其他资源

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `user_edit/gsts/` | 1（输出.gia） | gsts 工具输出 |
| `composite/` | 10+ | 包含 demo_A/B/C 系列（基本调用→执行调用→嵌套调用）|
| `实用/` | 72 | 实用工具类 GIA |
| `布局/` | 2 | 布局测试 |
| `真-测试通过/` | 43 | 测试通过文件集 |

---

## 五、注意事项

### 格式兼容性

工具兼容所有 GIA 格式（IR 编译格式和游戏原生格式）。但对于**不包含 which=8 复合定义体**的文件（如传球.gia 只有 which=9 编译体），复合名称查找通过编译体的 compositeDef 解析，不影响主图追溯。

### 已知问题

1. **DEP0205 deprecation warning** — tsx 模块加载时输出到 stderr，JSON 管道建议 `2>/dev/null`
2. **`-c <复合名>` 要求复合存在于 accessories** — 系统内建复合（0 impl 节点）可用但无 impl 图
3. **复合节点的 OutParam 名称** — 只有定义了 `compositeDef.outputs` 的复合才有名称
4. **Assembly List 节点** — `--all-params` 会看到大量重复 0 值，已被自动折叠为 `×99`

### 探查效率建议

- 先用 `--list-nodes` 摸清结构，再逐节点深入
- 复合内部节点用 `-c <名称> --all-params -d 0` 一次到位
- JSON 模式 + `jq` 可批量筛选：`jq '.params[] | select(.source_type == "parent_input")'`
- 输出过长时关注的是数据链形状而非每个字面值
