# 布局任务交接文档 · 物理运动复刻 Round 2

> 状态：历史记录
> 来源：真实 GIA 验证 + 当前代码实现 + 本轮注入/游戏内验证反馈
> 最近校验：2026-07-09
> 适用范围：`复杂gia/物理运动.gia` 复刻工程、复合节点注入问题排查、下一轮交接

> **本轮结果**：已把 `物理运动.gia` 复刻工程改成多文件结构，并完成 `设置物理参数` 的第一轮工程化复刻；主图与复合节点可正常编译、生成、单文件注入，用户确认地图内主图注入成功。但游戏内未看到复合节点内容。已确认：**问题不在编译器，而在注入器当前只替换目标 NodeGraph 本体，没有把 `.gia` 中的复合 accessories / relatedIds 一并写入 `.gil`**。下一轮优先完成“复合节点注入支持”，然后让用户再次进游戏核验；核验通过后，再继续处理 `设置物理参数` 尚未收敛的 3 个差异点。

---

## 一、本轮目标与范围

本轮用户明确要求：

1. 把 `物理运动.gia` 的复刻工程改成像真实 App 一样的多文件组织，而不是继续堆单文件测试。
2. 开始做 `设置物理参数`。
3. 后续如有不确定，先停下来沟通。

随后用户又要求：

1. 把当前生成物注入到**新建地图**里测试。
2. 差异点先不继续做，等用户先完成核验。
3. 有任何不确定的地方停下来沟通。

本轮严格按这个范围执行：

- ✅ 完成多文件工程化组织。
- ✅ 开始复刻 `设置物理参数`。
- ✅ 重新注入到新地图。
- ✅ 发现复合节点注入缺口并定位根因。
- ❌ **没有继续处理** `设置物理参数` 尚未收敛的 3 个差异点。

---

## 二、当前多文件工程结构

新增目录：

```text
tests/layout/physics-motion/
├── README.md
├── main.ts
├── composites/
│   ├── math.ts
│   └── set-physics-params.ts
└── helpers/
    └── variables.ts
```

新增配置：

```text
gsts.physics-motion.config.ts
```

当前职责：

- `tests/layout/physics-motion/main.ts`
  - 唯一主入口。
  - 保持 Step 0 主图结构：`When Entity Is Created -> Create Prefab / 设置物理参数`。
- `tests/layout/physics-motion/composites/set-physics-params.ts`
  - `设置物理参数` 复合节点定义。
- `tests/layout/physics-motion/composites/math.ts`
  - `mul3` 复合定义。
- `tests/layout/physics-motion/helpers/variables.ts`
  - 统一维护真实变量名映射。
- `gsts.physics-motion.config.ts`
  - 专用 compile/inject 配置。

**重要经验**：这个目录必须走 config 编译，不要优先用“单文件源码编译命令”。原因见第六节。

---

## 三、`设置物理参数` 当前实现状态

当前文件：

```text
tests/layout/physics-motion/composites/set-physics-params.ts
```

当前接口定义：

- 复合名：`设置物理参数`
- `inputs`：
  - `目标实体: entity`，显式 `pinIndex = 1365`
- `inflows`：
  - 单入口，显式 `pinIndex = 370`
- `outputs`：无
- `outflows`：无

当前内部实现包含：

- `Get Custom Variable ×12`
- `Query Entity by GUID ×2`
- `Data Type Conversion ×1`
- `Division ×1`
- `复合:mul3 ×1`
- `Set Node Graph Variable ×11`

当前主图文件：

```text
tests/layout/physics-motion/main.ts
```

当前主图仍保持 Step 0 基线：

```text
When Entity Is Created
├─ Create Prefab
└─ 复合:设置物理参数
```

`Create Prefab.Pfb` 仍来自：

```text
Get Custom Variable("物理计算元件id")
```

---

## 四、真实 GIA 与当前复刻的关系

### 4.1 真实 `设置物理参数` 已确认的结构

真实样本：

```text
复杂gia/物理运动.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/物理运动.gia
```

已确认的真实接口：

```text
复合:设置物理参数
InFlow[0] pinIndex=370
Input[0] 目标实体 entity pinIndex=1365
OutFlow: 无
Output: 无
```

已确认的真实内部节点列表：

```text
Set Node Graph Variable ×13
Get Custom Variable ×12
Query Entity by GUID ×2
Data Type Conversion ×1
Division ×1
复合:mul3 ×1
```

已确认的真实变量来源摘要：

```text
G       <- Get Custom Variable("G")
S       <- Get Custom Variable("S")
1/I     <- Get Custom Variable("1/I")
D       <- Get Custom Variable("D")
R       <- Get Custom Variable("R")
u       <- Get Custom Variable("u")
m       <- Get Custom Variable("m")
u_w     <- Get Custom Variable("u_w")
f_g     <- Get Custom Variable("f_g")
运动实体 <- Query Entity by GUID(Get Custom Variable("运动实体guid"))
视觉实体 <- Query Entity by GUID(literal guid 1077936360)
t       <- Data Type Conversion(Get Custom Variable("更新间隔")) / 1000
0.5gt   <- mul3(G, t, 0.5)
```

### 4.2 当前复刻与真实的已知差异

**本轮结束时还保留以下 3 个差异，下一轮再做：**

1. 真实 `Set Node Graph Variable ×13`，当前生成 `×11`。
   - 需要继续核对为什么 `S`、`D` 没进入最终 impl 图。
2. 真实 `视觉实体` 使用 literal GUID `1077936360`。
   - 当前为了工程化可维护性，先写成 `Get Custom Variable("视觉实体guid") -> Query Entity by GUID`。
3. trace 工具对当前生成复合执行 `--expand=设置物理参数` 时，显示内部事件起点为 `0 个`，但 `--list-nodes --composite=设置物理参数` 能列出完整内部节点。
   - 需要核对是 trace 工具展示问题，还是 composite entry 映射差异。

**注意**：用户明确要求这些差异本轮先不做，等游戏核验和注入问题处理完再继续。

---

## 五、本轮关键命令与观察

### 5.1 真实文件分析命令

执行过：

```bash
npx tsx tests/composite/trace-exec-flow.ts 复杂gia/物理运动.gia --expand=设置物理参数 --io
npx tsx tests/composite/trace-dataflow.ts 复杂gia/物理运动.gia --list-nodes --composite=设置物理参数
npx tsx tools/decode-gia.ts 复杂gia/物理运动.gia > /tmp/physics.json
```

关键现象：

- `trace-exec-flow --expand=设置物理参数 --io` 报：

```text
❌ 分析失败: compOutflows is not defined
```

所以不能完全依赖它看真实复合内部结构，需要配合：

- `trace-dataflow --list-nodes --composite=设置物理参数`
- `decode-gia.ts + jq`

### 5.2 当前工程编译/生成命令

执行过：

```bash
npm run build
node bin/gsts.mjs -c gsts.physics-motion.config.ts
```

生成成功：

```text
dist/tests/layout/physics-motion/main.gia
```

### 5.3 当前生成结构核验命令

执行过：

```bash
npx tsx tests/composite/trace-dataflow.ts dist/tests/layout/physics-motion/main.gia --list-nodes --composite=设置物理参数
npx tsx tests/composite/trace-exec-flow.ts dist/tests/layout/physics-motion/main.gia --io
```

观察：

- 主图结构正确：

```text
n1 When Entity Is Created
├─ n3 Create Prefab
└─ n4 复合:设置物理参数
```

- 当前 `设置物理参数` 内部节点列表能被 trace 出来。
- `mul3` 最终以复合节点形式出现，而不是错误 raw 节点。

### 5.4 `main.gia` 的复合附件已确认存在

执行过：

```bash
npx tsx tools/decode-gia.ts dist/tests/layout/physics-motion/main.gia \
  | jq '{rootRelatedIds:(.graph.graph.relatedIds|length), accessories:(.accessories|length), accessoryNames:[.accessories[].name]}'
```

结果：

```json
{
  "rootRelatedIds": 0,
  "accessories": 4,
  "accessoryNames": [
    "mul3",
    "",
    "设置物理参数",
    ""
  ]
}
```

**结论**：编译器生成的 `.gia` 已经带了复合 accessories，问题不在 Stage 2/3。

---

## 六、关于注入到新地图的完整过程（非常重要）

### 6.1 新地图 `mapId` 的获取

用户创建了新地图后，要求改注入目标。

`gsts maps` 直接失败：

```text
[error] Beyond_Local_Save_Level not found: /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/100431567/Beyond_Local_Save_Level
```

原因：CLI 先命中了一个不存在的旧玩家目录。

所以本轮改为手工列目录：

```bash
find /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal \
  -path '*/Beyond_Local_Save_Level/*.gil' \
  -printf '%TY-%Tm-%Td %TH:%TM:%TS %p\n' | sort -r | head -20
```

最新地图文件：

```text
1073741845.gil
```

所以新地图 `mapId` = `1073741845`。

### 6.2 关于 `nodeGraphId` 的规律

用户后来明确提供：

> `1073741825` 这个是游戏的第一个节点图 id，后续会不断 +1

因此本轮将：

```text
nodeGraphId = 1073741825
```

写入：

```text
gsts.physics-motion.config.ts
```

### 6.3 关键坑：`config.inject.nodeGraphId` 只对单文件模式生效

本轮非常重要的踩坑记录：

虽然在 `gsts.physics-motion.config.ts` 中配置了：

```ts
inject: {
  mapId: 1073741845,
  nodeGraphId: 1073741825
}
```

但是直接跑：

```bash
node bin/gsts.mjs -c gsts.physics-motion.config.ts
```

仍然报：

```text
Injection failed main.gia: target NodeGraph not found: 1073741904
```

原因已经查清：

- `config.inject.nodeGraphId` **仅对单文件模式生效**。
- 批量模式会忽略 `nodeGraphId`，仍按 `.gia` 自带 graph id 去查找目标。

代码证据：

```text
src/compiler/gsts_config.ts
src/cli/gsts.ts
```

尤其：

- `src/compiler/gsts_config.ts` 文档注释已明确写：
  - `nodeGraphId` 仅对 `gsts <file>` 单文件模式生效。
- `src/cli/gsts.ts` 也有注释：
  - 批量模式会忽略 `config.inject.nodeGraphId`。

### 6.4 正确注入方式（本轮最终成功）

先生成：

```bash
node bin/gsts.mjs -c gsts.physics-motion.config.ts
```

再执行**单文件注入**：

```bash
node bin/gsts.mjs -c gsts.physics-motion.config.ts dist/tests/layout/physics-motion/main.gia
```

最终成功：

```text
[ok] injected main.gia -> /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741845.gil
```

用户反馈：

- ✅ 注入成功。
- ❌ 游戏里没有看到复合节点内容。

---

## 七、复合节点“注入后看不到内容”的根因

### 7.1 当前结论

已确认：

> **问题不在编译器，在注入器。**

更具体地说：

> **当前注入器只替换目标 NodeGraph 本体，没有把 `.gia` 中的 `accessories` / `relatedIds` 一并写进 `.gil`。**

所以：

- 主图 NodeGraph 被成功替换。
- 但复合节点定义（CompositeDef）和实现图（impl NodeGraph）没有进入地图。
- 游戏里因此看不到复合节点内容。

### 7.2 证据链

#### 证据 A：编译产物本身有复合附件

`dist/tests/layout/physics-motion/main.gia` 已确认带：

- `accessories = 4`
- 名字含 `mul3`、`设置物理参数`

说明编译阶段没丢。

#### 证据 B：注入器实现只替换单个 NodeGraph blob

注入器关键代码：

```text
src/injector/index.ts
src/injector/node_graph.ts
src/injector/binary.ts
```

当前路径：

1. `loadGiaGraph(...)`
   - 只从 `.gia` 中取出主 `NodeGraph`。
2. `findNodeGraphTargets(...)`
   - 只在 `.gil` 里查目标 NodeGraph blob。
3. `applyReplacement(...)`
   - 只对目标 graph field 做一次 bytes 替换。

当前没有任何逻辑：

- 读取 `.gia` 的 `accessories`
- 把 `CompositeDef` / impl GraphUnit 写入 `.gil`
- 同步主图 `relatedIds`
- 维护复合附件在地图文件中的容器关系

#### 证据 C：`src/injector/AGENTS.md` 也表明当前注入器定位是“单图替换器”

描述中写的是：

- 找目标 NodeGraph
- 运行安全检查
- `applyReplacement` 替换图

没有任何“复合附件图单元合并”的说明。

### 7.3 为什么这是新问题

用户补充说明：

> 之前不支持复合节点

因此当前注入器很可能历史上只为普通图替换设计，没有覆盖复合 accessory 注入场景。

---

## 八、下一轮的明确优先级

下一轮优先级已经非常明确：

### P0：补齐“复合节点注入支持”

目标：

- 让 `dist/tests/layout/physics-motion/main.gia` 中的复合 accessories 也进入目标 `.gil`
- 让游戏内能看到并使用 `设置物理参数` / `mul3` 的复合内容

建议排查方向：

1. 先研究 `.gil` 中附件图单元（GraphUnit/accessories）存放位置。
2. 确认普通 NodeGraph 替换之外，复合附件需要 patch 哪些区域。
3. 将 `.gia` 中：
   - 主图 NodeGraph
   - accessories（CompositeDef + impl 图）
   - 主图/附件的 relatedIds
   一起注入到地图。
4. 做最小改动，不要顺手大改注入器结构。

重点代码入口：

```text
src/injector/index.ts
src/injector/binary.ts
src/injector/node_graph.ts
src/injector/folder.ts
```

### P1：用户进游戏核验

复合注入修好后，重新执行：

```bash
node bin/gsts.mjs -c gsts.physics-motion.config.ts dist/tests/layout/physics-motion/main.gia
```

然后请用户进游戏核验：

- 主图是否正常
- `设置物理参数` 是否可见/有内容
- `mul3` 是否被正确带入

### P2：再继续处理 `设置物理参数` 的 3 个差异点

只有在复合注入问题解决并且游戏内能看到复合后，再继续：

1. `Set Node Graph Variable ×13` vs 当前 `×11`
2. `视觉实体` 是否改回真实 literal GUID `1077936360`
3. trace `--expand=设置物理参数` 的内部事件起点显示问题

---

## 九、下一轮建议的起手动作

建议下一轮按这个顺序开始：

1. 读：

```text
src/injector/AGENTS.md
docs/documentation-governance.md
docs/documentation-map.md
docs/architecture/composite/gia-encoding.md
docs/architecture/composite/pipeline-flow.md
```

2. 先确认当前 `.gia` 带附件：

```bash
npx tsx tools/decode-gia.ts dist/tests/layout/physics-motion/main.gia \
  | jq '{rootRelatedIds:(.graph.graph.relatedIds|length), accessories:(.accessories|length), accessoryNames:[.accessories[].name]}'
```

3. 再从 `src/injector/index.ts` 开始，确认当前注入路径只 patch 单图。

4. 设计并实现“把 `.gia` accessories 合并进 `.gil`”的最小 patch。

5. 单文件注入到：

```text
mapId = 1073741845
nodeGraphId = 1073741825
```

命令固定用：

```bash
node bin/gsts.mjs -c gsts.physics-motion.config.ts dist/tests/layout/physics-motion/main.gia
```

**不要再用批量模式直接尝试覆盖 `nodeGraphId`。**

---

## 十、给下一位助手的一句话

> 当前 `物理运动` 已改成多文件工程，`设置物理参数` 第一轮复刻已能编译并单文件注入到新地图 `1073741845` 的首个节点图 `1073741825`。用户已确认主图注入成功，但游戏里看不到复合内容。根因已确认：`main.gia` 本身带 `mul3` / `设置物理参数` accessories，问题出在注入器只替换主 NodeGraph，没有把复合附件图单元和 relatedIds 一起写进 `.gil`。下一轮优先补“复合节点注入支持”，修完后让用户进游戏核验，再继续做 `设置物理参数` 剩下的 3 个差异点。`nodeGraphId` 只对单文件注入生效，命令必须用 `node bin/gsts.mjs -c gsts.physics-motion.config.ts dist/tests/layout/physics-motion/main.gia`。
