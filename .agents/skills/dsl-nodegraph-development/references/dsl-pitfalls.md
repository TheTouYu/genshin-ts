# DSL 踩坑明细（2026-08-13/14 魔方 P4 实证）

> 按"现象 → 根因 → 修复 → 证据"记录；通用速查见 SKILL.md，这里保留细节与证据链。

## 1. import 路径错误（TS2307）

- 现象：import type ServerExecutionFlowFunctions 自 "genshin-ts/runtime/definitions/nodes" 报 TS2307。
- 根因：src/runtime/definitions/ 目录不存在；类型真实位置是 src/definitions/nodes.ts（class）。
- 修复：改为 "genshin-ts/definitions/nodes"（package.json exports 有 ./definitions/*）。
- 教训：管线 tsx 不查类型，此类错误只在 tsc/编辑器暴露——写 import 前 grep 真实导出。

## 2. 循环变量 float / int（Invalid value type: int）

- 现象：for (let i = 0; i < 8; i++) + setOrAddKeyValuePairsToDictionary(vels, i, vel) 报 Invalid value type: int。
- 根因：循环变量 let i = 0 被转为 float（转换产物 float(i)）；字典 key 要求 int。
- 修复：for (let i = 0n; i < 8n; i++)（bigint → int）且 helper 参数标注 i: bigint（避免调用点 float(i) 转换）。

## 3. capture vec3 失败（unsupported timer capture type: any）

- 现象：setTimeout 回调引用外层 const vel2 = f._3dVectorZoom(...) 报 any。
- 根因：DSL 方法返回值类型推断为 any（跨声明文件解析），capture 只支持可推断的 StorableLocalValueType。
- 修复：速度向量经图变量/字典中转（回调读图变量，不 capture 表达式结果）。

## 4. 泛型参数不匹配（Generic parameter not matched）

- 现象：f.multiplication(f._3dVectorDotProduct(u, v), 1 - c) 报 dot product result pin 泛型错误。
- 根因：1 - c 混合表达式与 runtime 值的泛型推断冲突。
- 修复：公式变形避免混合表达式——罗德里格斯改为 u·dot + (v − u·dot)·c + (u×v)·s（P4 v5.5）。

## 5. 返回字段名 rotate（不是 rotation）

- getEntityLocationAndRotation 的返回类型字段为 location 和 rotate；写 .rotation 编译期不报错（TS 宽松）但运行时报 undefined。

## 6. 列表下标 0-based

- getCorrespondingValueFromList(list, 1) 取第 2 个；1..4 遍历 4 元素列表 → 第 4 个越界返回空实体 → 运动器作用空实体（日志 IN0:Entity= 空）。

## 6.1 列表操作 API 速查（官方文档确认，2026-08-17）

来源：官方节点指南 `docs/ui-tutorial/official-guide-nodes-server.md`「二、列表相关」+ 知识库「执行节点」；映射 `src/compiler/ir_to_gia_transform/mappings.ts`。中英文关键词均可搜到。

## 6.2 创建 vec3 的正确写法（2026-08-19 差分核实，编译器已加拦截）

- **正确**：`new vec3([x, y, z])`（数组参数）或 `f.create3dVector(x, y, z)`（三参数 API）。
- **错误**：`new vec3(1, 2, 3)` —— 构造函数只收一个数组参数，三参数写法**静默丢分量**
  （value 只取第一个参数 = 1），IR 里变成 `{"type":"vec3","value":1}`，曾导致
  误判为 vendor 编码 bug（Assertion failed），实际是用法坑。
- **编译器保护**（2026-08-19 起）：`src/runtime/value.ts` vec3 构造器对多参数显式抛错：
  `new vec3() 只接受数组参数：new vec3([x, y, z])…三参数请用 f.create3dVector(x, y, z)`。
- 类型层双保险：`new vec3(1,2,3)` 也会触发 TS2554（Expected 1 arguments, but got 3）。
- 教训：**传值前先看构造函数签名**（单数组参数 vs 多参数 API）；DSL 方法返回值/构造器
  不匹配是静默错误的重灾区——写完后跑一次 `npx tsc --noEmit` + 编译看 IR。

| 操作 | 中文名 | 英文名 | DSL 调用 |
|---|---|---|---|
| 读 | 对列表取值 / 获取列表对应值 | Get Corresponding Value From List | `f.getCorrespondingValueFromList(list, id)`（0-based） |
| **写** | 对列表设置值 / 设置列表值 | Set List Value | **f.* 未封装** → `f.registerExecNode('set_list_value', [list, id, value])`（mappings 456: → `modify_value_in_list`） |
| 插入 | 对列表插入值 | Insert Value Into List | `f.insertValueIntoList(list, insertId, insertValue)` |
| 移除 | 对列表移除值 | Remove Value From List | `f.removeValueFromList(list, removeId)` |
| 长度 | 获取列表长度 | Get List Length | `f.getListLength(list)` |
| 拼接 | 拼接列表 | Concatenate List | `f.concatenateList(target, input)` |
| 清除 | 清除列表 | Clear List | `f.clearList(list)` |

要点：
- **性能（用户经验 + 实测）**：列表数量不多时**性能远高于字典**——字典条目一多，读/操作开销都大（实测 dict 图变量读一次 ~20 负载，整字典序列化；列表读 ~1-3）。高频操作一律用列表；字典只放低频操作（如打乱队列）。
- **静态列表不可改**（官方 FAQ）：拼装列表（Assembly List）是静态的，只能查询；**变量里声明的列表**才能增删改。
- 列表图变量声明：`[0n, 1n, 2n]`（bigint → int_list）或 `[entity(0), …]`（entity_list）；数字字面量会推断 float。

## 7. 函数内联节点爆炸

- helper 函数被每个调用点展开：6 分支 × 4 块 × 5 段 = 2400 节点（超 2000 上限）。
- 解法链：数据驱动合并分支（2400→498）→ **循环体只物化 1 次**（240）。

## 8. 字典图变量

- 声明：vels: dict([{ k: 0, v: vec3([0, 0, 0]) }])（初始条目推断 int→vec3）；读取 f.getNodeGraphVariable("vels").asDict("int", "vec3")。
- 空值信号：字典未填充时日志 Query Dictionary 返回 13=0.0（排障第一信号）。
- 数组字面量可作值：setOrAddKeyValuePairsToDictionary(layers, 1n, [c1, c3, c5, c7])。

## 9. 运动器/引擎语义（详见 motion-devices.md）

- axis = 相对朝向（局部轴），绕世界轴要传 R^T·worldAxis（罗德里格斯×3，YXZ 内旋）。
- 公转公式必须保持平行分量（直接缩放 v0 → 每轮漂移 0.5）。
- 魔方层成员动态（组合旋转静态层映射失效）。

## 10. 日志/调试补充

- 字典未填充：Query Dictionary Value by Key OUT0 = 13=0.0。
- 空实体：运动器 IN0:Entity= 空（0-based 越界/字典空值）。
- rotation 输出含残差（如 270.0862°）——精确验证用矩阵，不用角度直接比较。
