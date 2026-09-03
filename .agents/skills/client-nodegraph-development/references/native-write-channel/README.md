# 原生写通道资源包（native-write-channel，2026-09-03 票 14/18/19 实证）

> 场景：**服务端负载高/同步频率要求 ≥15Hz（超读方向 ~10/s 硬上限）**——把计算搬到客户端自持、
> 结果直传服务端，服务端只收结果零计算。实测：单造物 15/s、4 并发 52.9-53/s（11.6× 旧链基线）。
> 知识层见 SKILL.md 五E 节；本包=可直接抄的资产（模板+脚本+runbook）。

## 快速开始（三处真值填完即编译）

1. 抄 `templates/chan-loop.ts`（客户端 20008 图）与 `templates/chan-listen.ts`（服务端读回图）到你的
   `src-fb/`（或任意 entries 目录），**替换三处真值**：
   - `CFG_BASE`：技能变量配置 ID（用户编辑器【技能变量管理】创建后回填；**占位 ID 禁止注入**）
   - `E1..E4`：造物实体 ID（放置后实测：entities diff 或日志 f9 帧值）
   - 信号名（默认 `chan_echo`——先 `assets:signals register --name chan_echo --param tag:str --param e:int`）
2. 资产注册（命令级，全部候选→回读→--write）：
   ```bash
   MAP=<你的地图.gil>
   node ./bin/gsts.mjs assets:node-graphs create --gil $MAP --name chan-loop --type 20008      # 客户端图占位
   node ./bin/gsts.mjs assets:node-graphs create --gil $MAP --name chan-listen                 # 服务端图占位
   node ./bin/gsts.mjs assets:signals register --gil $MAP --name chan_echo --param tag:str --param e:int
   node ./bin/gsts.mjs assets:custom-variables --gil $MAP --entity <挂载实体> --vars "c1:int=0;c2:int=0;c3:int=0;c4:int=0;x1:float=0;x2:float=0;x3:float=0;x4:float=0"
   node ./bin/gsts.mjs assets:skill-config create --gil $MAP --id <新配置ID> --name chan-skill --template 28 --skill-type instant --graph-id <chan-loop图ID>
   node ./bin/gsts.mjs assets:mounts attach <挂载实体> --graph <chan-listen图ID> --entity --gil $MAP --write
   ```
3. 编译：`node ./bin/gsts.mjs -c <fb 族配置> --noinject`（0 error+零 print+节点<2000）
4. 注入（四件套红线：游戏退出+用户确认+备份+双 SHA）：去掉 `--noinject`；注入后四项核验
   （`check-gil-composite-refs --incoming` / `scan-gil-var-pins` / mounts / skill-config list）
5. 用户编辑器：放造物（**小体型模型**=15-16/s 上限；遗迹守卫只有 7.5/s）→ 绑 chan-skill 配置
   （**CD 0.01s + 忽略公共冷却**，缺一被钉 ~1/s）→ 详情只开两张实验图
6. 复测后判读：`scripts/extract_rates.py <loop帧dump> <listen帧dump> <loop图ID> <listen图ID> <日志>`（见下）

## 判读脚本用法（复测一轮出全部判据）

```bash
# 先 dump 两图帧流（--gil 带地图；大日志必须落文件）
python3 .agents/skills/debug-log-investigator/scripts/gia_log.py <日志.gia> frames --gil <地图.gil> --graph <chan-loop图ID> > loop.txt
python3 .agents/skills/debug-log-investigator/scripts/gia_log.py <日志.gia> frames --gil <地图.gil> --graph <listen图ID> > listen.txt
# 一条命令出：per-instance 施放率/信号到达/HP 事件/位置跟随/秒桶
python3 .agents/skills/client-nodegraph-development/references/native-write-channel/scripts/extract_rates.py loop.txt listen.txt <日志.gia>
```

## 关键约束速查（踩过的坑，模板已内置规避）

| 约束 | 说明 |
|---|---|
| cfg 字面量 | setSkillVariable/querySkillVariableValue 的 configID 仅字面量（不能数据流选）→ 一实例一 cfg 一条链 |
| 客户端不能写自定义变量 | setCustomVariable 客户端图族零支持（只有 getCustomVariable） |
| 服务端读不到技能变量 | 零节点零事件——服务端消费必须信号回传 |
| GUID 分支显式 equal | 每分支 equal(实体GUID)，else 留空（兜底=陌生实例污染数据） |
| entity() 字面量 | 服务端寻址必须字面量（数组索引会被 TS→GS 改写） |
| 定时器粒度 ~0.09s | 服务端轮询上限 11/s；高频读回走事件/信号 |
| 并发处理面 | 4 实例=~5000 帧/s（用户体感压力线）——按需选并发度（20Hz 需 2 实例） |
| float() 禁裸调 | 类构造器不能函数式调用——float 参数传数字字面量（CONST 先例） |

## 编码与协议（多分量状态）

- 六元组→10 分量技能变量（自持）+vec3 信号直传（回传免编码）+×100 定点降级：
  `.scratch/football-v2/issues/19-codec-protocol.md`（可逆性自检 `python3 tools/codec-selftest.py`）
- 12 通道原语接口定义：`.scratch/football-v2/issues/19-channel-api.md`
