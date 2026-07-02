# w衰减力矩 · 数据流追溯过程记录

> 本文件记录了使用 `trace-dataflow.ts` 工具探查 `w衰减力矩` 完整数据流动的**每一步操作和工具返回结果**。
> 读者可复现每一步，学习工具的用法和理解数据流分析思路。

---

## 背景

物理运动.gia 中有多个力矩相关的复合节点：

- `力矩`（id=1610612932）：inputs: w, f, 压力（一瞬间），outputs: J-空中, J-地面
- `摩擦力矩`（id=1610612934）：inputs: f，outputs: 结果
- `w衰减力矩`（id=1610612935）：inputs: w, 地面衰减系数，outputs: 结果

目标：追踪 `w衰减力矩` 的输入参数 `w` 的完整数据源链。

---

## 第1步：搜索 w衰减力矩 出现在哪里

**命令：**
```bash
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" w衰减力矩
```

**工具返回：**
```
❌ "w衰减力矩" 在多个图中匹配，请用 -c 指定：
  复合:力矩 n=6  复合:w衰减力矩  →  -c "力矩"
  复合:力矩 n=7  复合:w衰减力矩  →  -c "力矩"
```

**结论：** w衰减力矩 在 `力矩` 复合的 impl 图中被调用了两次（n=6 和 n=7）。需要加 `-c 力矩` 来精确指定。

---

## 第2步：探查 力矩 内部第一个 w衰减力矩（n=6）

**命令：**
```bash
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 6 -c 力矩
```

**工具返回：**
```
数据流追溯: 复合 "力矩" impl 图 · n=6  复合:w衰减力矩

InParam[0] "w" (?)
  ← 父输入 "力矩"."w"

InParam[1] "地面衰减系数" (?)
  = 0.20000000298023224

[上层调用] "力矩" 被调用于：
  计算分力 n=5  复合:力矩
→ 使用 --composite "计算分力" 向上一级追溯
```

**分析：**
- InParam[0] `w` 来自父复合 `力矩` 的输入参数 `w`（直通）。
- InParam[1] `地面衰减系数` 是一个字面值 `0.2`。
- 同时工具提示：`力矩` 被 `计算分力` 在 n=5 处调用。这说明还需要继续向上追。

---

## 第3步：对比第二个 w衰减力矩（n=7）

**命令：**
```bash
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 7 -c 力矩
```

**工具返回：**
```
数据流追溯: 复合 "力矩" impl 图 · n=7  复合:w衰减力矩

InParam[0] "w" (?)
  ← 父输入 "力矩"."w"

InParam[1] "地面衰减系数" (?)  (未连接)

[上层调用] "力矩" 被调用于：
  计算分力 n=5  复合:力矩
→ 使用 --composite "计算分力" 向上一级追溯
```

**分析：** 两个 w衰减力矩 的 `w` 来源相同，但 `地面衰减系数` 不同：
- n=6：系数 = **0.2**（有明确定义的值）
- n=7：系数 = **未连接**（使用节点默认值）

---

## 第4步：追 力矩 的 w 来自哪里

现在按提示向上追，在 `计算分力` 的 impl 图中查找 `力矩`（n=5）的输入参数。

**命令：**
```bash
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 5 -c 计算分力
```

**工具返回：**
```
数据流追溯: 复合 "计算分力" impl 图 · n=5  复合:力矩

InParam[0] "w" (?)
  ← 父输入 "计算分力"."w"

InParam[1] "f" (?)
  <- n=78  Get Local Variable  OutParam[1]
    InParam[0] "初始值" (R<T>)
      <- n=7  复合:friction_force  OutParam[0] "结果"
        InParam[2] "额外受力" (?)
          <- n=4  Addition  OutParam[0]
            InParam[0] "R<T>" (R<T>)
              <- n=2  Split 3D Vector  OutParam[1]
                InParam[0] "Vec" (Vec)
                  <- n=1  复合:aerodynamic_forces  OutParam[0] "magnus"
            InParam[1] "R<T>" (R<T>)
              ← 父输入 "计算分力"."额外受力"
        InParam[0] "w" (?)
          ← 父输入 "计算分力"."w"
        InParam[1] "v" (?)
          ← 父输入 "计算分力"."v"

InParam[2] "压力（一瞬间）" (?)
  <- n=7  复合:friction_force  OutParam[3] "压力摩擦分力（一瞬间）"
    (InParam 同上面 f 的展开, 省略)
    InParam[0] "w" (?)
      ← 父输入 "计算分力"."w"
    InParam[1] "v" (?)
      ← 父输入 "计算分力"."v"

[上层调用] "计算分力" 被调用于：
  发送信号 n=5  复合:计算分力
→ 使用 --composite "发送信号" 向上一级追溯
```

**分析：**
- 力矩的三个参数各有不同来源：
  - `w`：直通自 `计算分力` 的父输入
  - `f`：链式追溯 → 局部变量 ← friction_force ← Addition ← Split3D ← aerodynamic_forces + 父输入"额外受力"
  - `压力（一瞬间）`：直连 friction_force.OutParam[3]
- 工具提示：`计算分力` 在 `发送信号` 的 n=5 处被调用。

---

## 第5步：追 计算分力 的 w 来自哪里

**命令：**
```bash
npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" 5 -c 发送信号
```

**工具返回：**
```
数据流追溯: 复合 "发送信号" impl 图 · n=5  复合:计算分力

InParam[0] "w" (?)
  <- n=68  Get Node Graph Variable  OutParam[0]  (读取图变量)

InParam[1] "v" (?)
  <- n=56  Get Node Graph Variable  OutParam[0]  (读取图变量)

InParam[2] "额外受力" (?)
  <- n=2  Get Node Graph Variable  OutParam[0]  (读取图变量)
```

**分析：**
- 计算分力 的三个输入全部来自 **图变量（GetNodeGraphVariable）**
- 变量名验证（通过额外脚本 `_check_vars.ts` 确认）：
  - InParam[0] `w` → 图变量名 **"w"**
  - InParam[1] `v` → 图变量名 **"v"**
  - InParam[2] `额外受力` → 图变量名 **"额外压力"**
- 图变量是数据流追溯的终点——数据由系统其他部分的 `SetNodeGraphVariable` 写入

---

## 第6步：查找 发送信号 的上层调用者

**分析：** 工具在第5步的输出中没有显示 `[上层调用]`，说明 `发送信号` 本身可能没有被其他复合调用（它是信号发送节点，which=14，结构不同）。

通过辅助脚本 `_check_signal.ts` 手动搜索：

**命令：**
```bash
npx tsx tests/composite/_check_signal.ts
# (脚本内容：遍历所有编译体impl图，搜索调用 发送信号(id=1610612737) 的节点)
```

**输出：**
```
"物理运动控制器" (Acc[13], id=1610612864) calls 发送信号 at n=36
```

**结论：** `发送信号` 在 `物理运动控制器` 的 impl 图中被 n=36 调用。

---

## 完整链路总图

```
图变量 "w"（由系统其他部分写入）
  │
  ├── 发送信号 n=68  GetNodeGraphVariable("w")    读取图变量
  │    ← 发送信号由 物理运动控制器 n=36 调用
  │
  ├── 计算分力 n=5  (compositePins outer[0] → inner n=1/5/7 kind=3 idx=0)
  │    ← 父输入 "计算分力"."w"
  │
  ├── 力矩 n=5  (compositePins outer[0] → inner n=5 kind=3 idx=0)
  │    ← 父输入 "力矩"."w"
  │
  ├── w衰减力矩 n=6  (系数=0.2)
  └── w衰减力矩 n=7  (系数=未连接)
```

---

## 附录：工具调用速查

| 步骤 | 命令 | 目的 |
|------|------|------|
| 搜索 | `trace-dataflow.ts 物理运动.gia w衰减力矩` | 查调用位置 |
| 参数指定 | `trace-dataflow.ts 物理运动.gia 6 -c 力矩` | 追第1个实例 |
| 对比 | `trace-dataflow.ts 物理运动.gia 7 -c 力矩` | 追第2个实例 |
| 上升一层 | `trace-dataflow.ts 物理运动.gia 5 -c 计算分力` | 追父级来源 |
| 再上升 | `trace-dataflow.ts 物理运动.gia 5 -c 发送信号` | 追上级来源 |
| 全局识别 | `trace-dataflow.ts 物理运动.gia 计算合力` | 自动匹配 |

## 附录：工具版本信息

此文档使用 `tests/composite/trace-dataflow.ts` 的以下功能：
- `--composite` / `-c`：在指定复合的 impl 图中追溯
- 自动名字匹配（唯一匹配时自动进入复合模式）
- 多匹配消歧（列出所有匹配提示用户选）
- `compositePins` 父输入直通检测
- 递归子节点父输入检测
- `[上层调用]` 提示：显示父复合的调用点
