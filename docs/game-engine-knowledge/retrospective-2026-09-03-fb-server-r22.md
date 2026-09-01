# 完整复盘：fb-server 扩建 R2.2（票 02，T3 握手节拍服务端半边）（2026-09-03）

> 范围：单会话票 02 全程（fb-server 79→222 节点 + 挪挂球实体；commit b47093a）。
> 视角：主代理执行者。证据：本会话工具输出 / dist-fb 编译产物 / 地图 SHA 链
> （4ce87ed5→51f60721，Temp 双 SHA）/ 复盘沉淀期回归（扫描器 12 断言全过）。
> 状态：票 02 结构层交付完成；游戏行为层待 04 注入 + 05 用户复测。

## 一、错误谱系总览

| # | 现象 | 根因层 | 修复 | 落盘位置 |
|---|---|---|---|---|
| 1 | `gsts dev --config … --noinject` 挂死（工具调用 aborted） | 技能文档给了 watch 子命令当一次性编译用 | 用户纠正：勿用 dev；`build` 子命令不存在（当文件参数），正确=默认动作 `-c <cfg> --noinject` | dsl 技能步骤 4 + 常错表 + dsl-pitfalls §14 |
| 2 | `entity(ENTS[i])` → `Generic parameter not matched` | TS→GS 转换器把数组索引改写为运行时列表取值节点，把 TS 数组当泛型参数 | entity() 只接 bigint 字面量，多实体多行写 | dsl 技能受限子集表新增行 + 常错表 |
| 3 | decode-gia 常量扫描首轮大量假 ✗ | 值有两种形态：直接 `value.bXxx` / 嵌套 `value.bConcreteValue.value.bXxx`（事件字面量多走嵌套） | 递归扫两层；沉淀为 references/decode-gia-constant-scan.py | gil-node-graph-reading Step 3.6 |
| 4 | 扫描器 float:4.0 计数困惑（先后疑似 0/2/2） | ①json.loads 把无小数点 float（val:4）解析成 int→isinstance 漏；②Assembly List 占位 pin（alreadySet=false）与布局坐标可污染计数；③最终定位两处 4.0 均为真实常量（DRIVE_GAIN + fb_wd 延迟 [4]） | 按来源键 bFloat/bInt 分类 + alreadySetVal 过滤 + 只扫 pins[].value | 同上（脚本内置三个防坑） |
| 5 | edit 工具 3 次"requires reading first" | bash cat / write 创建的文件，edit 前必须 read 工具读过；另 read 输出行号后自带空格，复制缩进会错位 | 先 read 再 edit；缩进以 od/cat -A 为准 | （harness 行为，备忘即可） |

## 二、用户纠正钩子（原话）

- 「不要用 dev dev，它会一直卡在那里的。直接用 build 命令就可以了，就可以执行这个编译了」
  ——工具通道纠偏。半对：dev 确为 watch 挂死；但 build 子命令实际不存在，默认动作才是编译。
  教训：**技能文档里的命令形态是权威入口，错了会直接变成执行者的坑**——本轮 dsl 技能步骤 4
  的 `dev --config` 就是坑源（该形态来自 2026-08-22 实证语境，watch 语义在交互会话不可用）。

## 三、系统性根因

1. **命令形态漂移**：`gsts dev`（watch）/ 默认动作（一次性编译）/ `npm run dev`（=build+watch）
   三种入口语义不同，历史文档混用。一次性编译的规范入口应唯一化：`node ./bin/gsts.mjs -c <cfg> --noinject`。
2. **TS→GS 转换器"字面量形态"约束未成表**：数组字面量（根图 handler）、vec3 字面量（回调内）、
   entity 数组索引（本轮）三次同族踩坑——转换器只认字面量形态，非常量表达式会被改写成
   gsts.f 运行时节点。本次把第三条补进受限子集表，同族闭环。
3. **decode-gia JSON 结构假设**：值位置/类型形态/污染源三层假设，第一版扫描器全靠猜。
   正确姿势=先小样本确认键形态（Step 2.6 纪律），再写扫描——本轮先猜后确认，多花两轮。

## 四、流程与方法论教训

- **有效**：侦察先行（挂载/信号/变量/枚举/API 六路事实核对后才动刀）→ 全程零设计返工；
  候选→CMP-SAME→写回→SHA 对账→Temp 双 SHA 复用票 01 纪律一次过；
  双向定时器名单制核对避免了挪挂串扰事故。
- **绕路**：扫描器两轮修正（应先确认值形态）；edit 缩进三次失败（应先 cat -A）。
- **沉淀资产必须当场回归**：扫描器写完立即用本轮产物跑 12 断言，当场暴露 2 个真缺陷
  （int 形态 float、占位 pin）——"写完就提交"不回归的资产=负资产。

## 五、风险探索与未闭合项

- **瞬移门时序**（RESET ack 置位→首应用拍消费）是推理设计，无游戏日志证据——04 注入后
  观察 fb:goal/复位行为验证；若复位瞬间仍有条纹，查 tp_pending 置位时点。
- **dispatcher 垃圾载荷与真实任务共存**：03 票 fb-phys 必须按"未知类型跳过应用仍 ack"实现，
  否则 REST 期会被垃圾 ack 反复唤醒（票 02 执行备注已写明契约）。
- 游戏行为层全部未验（04/05 票）；E3 float 信号端到端随 04/05 顺带收证。

## 六、产出清单

- 修复/交付：fb-server v2（src-fb/fb-server.ts + signals.ts；commit b47093a，见 PROGRESS R2.2 轮次）
- 技能迭代（本提交）：
  - dsl-nodegraph-development：编译命令更正×3 处 + entity() 字面量行 + 常错表 2 行
  - gil-node-graph-reading：Step 3.6 双层值形态/三防坑 + references/decode-gia-constant-scan.py（12 断言回归过）
  - client-nodegraph-development：通信矩阵补拍门握手模式行（标注结构层已验/行为层待验）
  - genshin-ts-asset-operations：A 节补挪挂两步候选链条目
  - task-retrospective / debug-log-investigator / verify-injection：已检查无需迭代（本轮未触发其域内新知识）
- 初始文件同步：AGENTS.md/CLAUDE.md 已核对——`npm run dev`（增量开发模式=watch）描述准确保留；
  无新技能需加路由行；无规则冲突。
- 知识树（PKC）：entity() 字面量约束与值形态三坑已进技能（生效载体），PKC claims 录入并入 09 票总沉淀（避免碎片化）。
