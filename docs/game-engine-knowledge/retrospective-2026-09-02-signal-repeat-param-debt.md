# 完整复盘：信号同型重复参数能力债偿还（2026-09-02）

> 状态：已闭环（四轮编辑器差分 → 规律闭合 → 源码还债 → 写回 → 用户游戏核验通过）
> 范围：单会话完整任务——从用户提出"抄作业机制能力债该还了"到 cli_debt_test 游戏核验通过
> 证据：evidence ~/genshin-ts-evidence/node-graph-logic/signals/2026-09-02-repeat-param-pins/
> （raw/ 基线+R1-R4 快照+SHA，notes/manifest.md）；提交 e231402（源码+测试+signals.md）、
> 0641894（PKC bnd_93e6b6c0 / clm_93DF427F）
> 视角：主代理复盘（含 DSH 环境工具使用谱系）

## 一、任务成果一句话

旧实现"非 str 同型重复参数 fail-closed 要求 donor"的能力债，通过四轮编辑器最小差分闭合了
参数槽完整生成规律（field2=全局序号跨类型连续 / n4=类型模板 / pin=计数器副产物引擎不校验），
any 组合无需 donor 直接注册，游戏核验通过。

## 二、错误谱系总览（9 项）

| # | 类别 | 具体错误 | 代价 | 修复 |
| --- | --- | --- | --- | --- |
| 1 | **用户协作** | 把知识文档里的描述（图内有"信号调试"节点图）冒充地图名给用户，用户找不到 | 1 轮往返+用户批评 | `gsts maps --format json` 查真实显示名「模型比对」 |
| 2 | **方法论** | 拿 R1 数据静态推理 pin 分配规律（+4k/+1k 猜测、脑内拼分配史） | ~2 轮无效推理 | 用户纠偏：多拆几轮差分；R2-R4 数据直接证伪所有猜测 |
| 3 | 实现细节 | 解码脚本对 definitionBytes 多剥一层 wire（未先打印字段构成就套结构假设） | 1 轮报错 | 先打印 root fields 再写解析 |
| 4 | 测试方法 | 测试期望值连续 3 次写错（[16]→[13]；[[111],[13],[14]]；[90],[91]）——没先打印 mapPool 实际构成就断言 | 3 轮红测 | 每次失败后打印实际值再改；教训=**先观察后断言** |
| 5 | 逻辑完备性 | dedupeByPins 只在 missing>0 分支回写，missing≤0 时保留未去重池 → 同信号两参数同 pin | 2 轮（v2 候选误判+修复） | 去重池无条件回写 |
| 6 | 工具特性 | --output 不覆盖已存在文件，v2"重新生成"静默失败，回读到旧候选 | 1 轮误判 | 换新文件名 v3；候选生成后核对 SHA 变化 |
| 7 | DSH 环境 | run_code 模板字符串嵌套反引号（${process.pid} 被外层求值）语法错误 ×3、重复 description 键 ×3 | 6 次调用失败 | 行数组 join("\n") 模式；参数写完自查键名 |
| 8 | 元层铁证 | PKC new-claim 返回 ok:true 即报"录入成功"，实际 applied:false（生产模式强制 dry-run） | 1 轮误报+返工 | 读完整返回体关键字段；走 capture→finalize→approve→apply 正规链 |
| 9 | 环境盘点 | 工作区含上一会话未提交的 donor 聚合改动，stash 对比实验新旧行为时归因混乱 | ~3 轮排查 | git diff 全量看懂改动词；发现非己改动后重新归因 |

## 三、系统性根因（3 条）

### R-A 预测先于观察

写测试期望、猜 pin 规律、套 wire 结构——三次都在**没有打印实际数据**前就下了结论。
差分实验的正确姿势是：每一轮先让数据说话（打印 pool 构成/实际 pin/字段树），再写断言。
谱系 #2/#3/#4 同源。

### R-B 工具返回关键字段未读

PKC 的 `applied`、bash 管道的退出码（`set -e` 被 `grep|tail` 掩盖）、--output 的已存在行为——
工具"成功返回"≠"按预期生效"。元复盘铁证原则（工具状态断言必须取证）同样适用于自己的
工具链调用：**读返回体里的状态字段，不要只看 ok/exit 0**。谱系 #6/#8 同源。

### R-C 环境嵌套语法陷阱无固化模式

run_code 的 code 参数里写含反引号/${} 的内容时，模板字符串嵌套必然出错，本轮踩了 6 次才
固化"行数组 join"写法。此类环境级坑一旦发现应立即记录模式，避免下一轮重踩。谱系 #7。

## 四、流程与方法论教训

### 帮到定位的（可复用）

1. **四轮原子差分的判别设计**：R1 判别（2-float 直接看重复形态）、R2 证伪（追加第 3 个 float
   推翻固定步长）、R3 对照（连续会话第二信号揭示计数器衔接 230→231）、R4 铁证（混合重复证明
   field2 跨类型连续）。每轮一个可唯一归因的变化，四轮闭合全部规律。
2. **用户误操作变黄金样本**：R3 用户选错类型（想要 int 建了 float），反而是最佳对照——
   同一会话连续第二个 2-float 信号。不要浪费"意外"，先看它能判别什么。
3. **探针实验定位路径分歧**：源码改动"理论上"不影响路径选择但行为变了时，插
   `if (env) throw` 探针一锤定音（新代码从未进 fallback → 差异来自工作区他人的
   donor 聚合改动）。
4. **回读断言抓隐藏缺陷**：候选生成后逐参数回读 pin，抓到 speed/delta 同 pin 的去重缺陷——
   只看"注册成功"永远发现不了。
5. **用户纠正是最高优先级输入**：两次纠偏（真实地图名/多差分不瞎猜）都直指方法论缺陷，
   复盘必答一问逐字回收。

### 绕路的（引以为戒）

- 静态推理 pin 分配史（脑内拼"编辑器怎么分配"）浪费 2 轮，被用户一句话打断后 4 轮差分全闭合
- stash 实验前没先盘点工作区非己改动，导致"新旧代码行为矛盾"的假灵异排查

## 五、同族扩展检查

- **donor 聚合路径同信号重复 pin（未闭合，登记 O-2026-09-02-01）**：
  `registerSignalInGil` donor 路径（L1465 buildParamPool 聚合全部信号）借槽时未去重，
  too_many_strings 案例 [[12],[16],[12]] 两参数同 pin。编辑器无此形态、引擎接受度未验证
  （football-v2 fb_ball_state 同法拼装在使用中但无显式游戏验证记录）。fallback 路径已修复
  （dedupeByPins），donor 路径保持现状——如遇拒载优先查此处。
- **update/repair 路径**（L1270/L1347 buildParamPool 单信号聚合）：同信号内参数 pin 天然互异
  （编辑器保证），低风险，不动作。
- **知识文档旧口径**：signals.md 早期章节"Same-type repeats: send +4k (verified for str)"
  类说法已被新章节取代，新章节已明确作废旧规律；历史章节保留原貌（历史记录不删改）。

## 六、产出清单

- 源码：mergePoolFor 解锁+dedupeByPins、builtinTemplatesFor +1k 统一（e231402）
- 测试：signal_registration_builtin（2-int 无 donor）、signal_registration_repeated_type
  （donor 聚合/builtin 3-float/共享槽去重）全绿
- 知识：signals.md 新章节（四轮证据链）；PKC clm_93DF427F（bnd_93e6b6c0 apply）
- 证据：~/genshin-ts-evidence/.../2026-09-02-repeat-param-pins/（5 快照+manifest）
- 真实地图：cli_debt_test 写回 1073741849（游戏核验通过，用户 2026-09-02 确认"测试通过"）
- 技能迭代：editor-incremental-gia-investigator 两条（见下）
- 本复盘文档

## 七、技能迭代（本轮实际加载清单逐个检查）

1. **editor-incremental-gia-investigator**（read SKILL.md + signals 模块）→ **迭代 2 条**：
   - 用户操作指令必须用游戏内地图显示名（`gsts maps --format json`），禁止把文档代号/
     内部 mapId 当地图名给用户（2026-09-02 用户实证纠偏）
   - pin/ID/序号类分配规律未知时禁止静态推理，直接增加差分轮次（2026-09-02 用户纠偏：
     "多拆分几次，多进行几次差分，真相立马就出来"）
2. **genshin-ts-asset-operations**（未实际加载——skill 工具未解锁，本轮未用其流程）：
   已检查——其描述不含"重复参数需 donor"旧口径，无需迭代。
3. **task-retrospective**（本次通过 skill_content 注入）：流程顺畅，无需迭代。
4. **gil-node-graph-reading / gil-node-graph-editing**：本轮未加载（信号注册走 asset 层），
   无需迭代。

## 八、AGENTS.md 规则反馈检查

- 本轮新经验（真实地图名/多差分）适用范围限于差分实验场景 → 落 editor-incremental-gia-
  investigator 技能，不进 AGENTS.md（局部经验不推广）
- 现有 AGENTS.md 规则本轮无冲突：写回红线（确认后 --write）、证据分层（三栏报告）、
  PKC 查询前置均按规执行
