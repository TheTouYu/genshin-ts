---
name: verify-injection
description: 游戏核验的最小自动注入通道。当用户说“去核验”“核验”“游戏核验”“注入核验”“帮我跑核验”，或需要把某个编译器/编码规则的最小复现 case 注入游戏供用户核验时，使用本技能。它按约定复用专用验证地图与按分支命名的 placeholder 节点图，用最小 TS case 编译成 .gia、回填注入配置、单文件注入、解码断言 wire，最后通知用户去游戏核验。区别于 editor-incremental-gia-investigator（编辑器规则探索性快照实验）：本技能只做“已锁定规则的最小生产注入核验”，不研究未知规则。
---

# 最小核验注入通道（verify-injection）

## 定位

今天（2026-08-06）首次跑通“自动创建地图 → 自动注入节点图 → 注入最小 case → 用户游戏核验”全链路。
本技能固化这条成功路径：**不每次新建地图**，复用专用验证地图；**每个核验分支一个 placeholder 节点图**；
同一分支图内可挂同类型多个核验点（一个 TS 文件多个事件/多段逻辑）。

## 约定

- 专用验证地图：名字含 `GSTS核验`（当前实例：`1073741888`「GSTS核验-复合族4」——
  复合族验证实验最终地图：图 1825/1826/1827 挂载到普通实体 1077936151，信号 `verify_ping`
  （msg:str/tag:str）已注册。优先复用；只有需要隔离或地图损坏时才 `maps:create` 新建。
  历史实例：`1073741852`「InFlow核验」、`1073741853`「gsts-verify」（见
  `references/verified-cases.md`）。
- 从零新建（隔离场景）：`maps:create` 无 `--graphs` 时是 62B 最小骨架（无 root 6/10），
  `assets:node-graphs create` 会自动补最小挂载容器（2026-08-05 修复）；新地图无信号
  注册表，`assets:signals register` 会自动初始化 field 10.5（无需手工脚本）。
- **信号从零注册（2026-08-15 起无 donor 可用）**：`assets:signals register --name <新名>
  --param k:v` 不再需要 `--template-signal`——内置参数布局表（字节 100% 来自编辑器真实
  信号，覆盖 str/int/float/bool/vec3/entity/guid/prefab_id/config_id + 全部列表类型）会在
  无 donor 时自动使用；`--template-signal` 仍可用作 donor 覆盖（布局与 pin 基址从 donor 克隆，
  此时字节与内置路径一致，仅当 donor 覆盖所有参数类型时生效）。重复的非 str 同型参数
  （如两个 int）仍需 donor（编辑器无此布局证据，fail-closed）。
  **端到端已验（2026-08-15）**：在真实无信号地图副本（1073741880.gil）上
  `register --name verify_ping --param msg:str --param tag:str --output <副本输出>` 全流程
  通过——空注册表自动初始化、规范 pin（12/34/40、16/35/41）、CLI 候选回读、inspect 确认。
  剩余待验：真实地图 `--write` + 游戏内信号可用性（需用户游戏核验）。
- **注册后必须核验参数布局（2026-08-16 五连错实证）**：`assets:signals register/update` 后
  用 `inspect` 确认版本一致（v= 与 defs=[..] 相等且 ≥ 阈值），**多参数信号（尤其含 vec3/entity/
  guid 等非 str/int 类型）还需确认参数 n3 field2 = 全局序号**（send/server=0/1/2…，monitor=3+序号）；
  引擎对布局序号错位会"参数错误"拒载（静态检查全过但游戏进不去、无日志）。判断标准：
  用编辑器重建的同类信号样本逐字节对照，而不是只查已知字段。
- 分支节点图名：`verify-<点>`（如 `verify-inflow-index`）。注入后图名被替换为 `_GSTS_<gia基名>`。
- case 文件：`verify/<分支>/<分支>.ts`，模板见 `references/template-case.ts`。
- 注入配置：`gsts.verify.config.ts`（entries=`./verify`，outDir=`./dist-verify`）。

## 最小路径（每条命令均已实测跑通）

```bash
cd /home/h/genshin-ts

# 1. 定位验证地图（找 GSTS核验 前缀；记录 mapId 与已有图 id）
node bin/gsts.mjs maps

# 2. 确保分支 placeholder 图存在（不存在才执行；--write 会先备份再写回）
#    （新建专用地图的替代命令：node bin/gsts.mjs maps:create --name "GSTS核验-xxx" --graphs "verify-a,verify-b"）
node bin/gsts.mjs assets:node-graphs --gil <saveLevelDir>/<mapId>.gil --name verify-<点> --write

# 3. 写最小 case：verify/<分支>/<分支>.ts（graph id 用约定 1073741825 即可，见关键点 4）

# 4. 编译（config 此时不配 inject，见关键点 1）
node bin/gsts.mjs -c gsts.verify.config.ts --noinject

# 5. 解码 GIA 断言目标 wire（把预期 connects 与真实输出比对）
npx tsx tools/decode-gia.ts dist-verify/verify/<分支>/<分支>.gia -o /tmp/verify-gia.json
#    python3 提取片段见“wire 断言片段”

# 6. 给 gsts.verify.config.ts 加 inject 段（mapId=验证地图 id、nodeGraphId=placeholder 图 id，模板见文件头注释；config 平时不配 inject，见关键点 1）

# 7. 单文件注入
node bin/gsts.mjs -c gsts.verify.config.ts dist-verify/verify/<分支>/<分支>.gia

# 8. 注入后检查：图存在 + .gil 中 wire 形态保持
npx tsx tools/list-gil-node-graphs.ts <saveLevelDir>/<mapId>.gil
#    .gil 解码片段见“wire 断言片段”

# 8b. 注入后必跑复合残留检查（2026-08-30 足球拒载事故后强制）：
#     只跑 list-gil-node-graphs / check-gil-composite-refs（不带 --incoming）看到"0 悬空"就交付，
#     会漏掉旧版残留 def 链类型错位 → 游戏拒载无日志。--incoming 是唯一能抓"残留引用被覆盖 ID"的检查。
npx tsx tools/check-gil-composite-refs.ts <saveLevelDir>/<mapId>.gil --incoming <本次.gia>
#     输出判读：
#       ✗ 残留复合 X 引用的 ID ... 被本次注入覆盖——可能类型错位 → 真问题，先 def-clean 清理残留再交付
#         （清理流程见 gil-node-graph-editing 技能「残留复合清理」）
#       ✓ 0 悬空 → 只证明引用存在，还需 parse --list 确认复合目录无多版本残留（(1) 后缀/旧 def）
#       「GIA 复合 16106127xx 注入后在地图中缺失」→ 信号定义单元误报，用 scan-gil-signals 确认即可
#       「GIA 复合 2000000000 段缺失」→ 旧 def 段本次未注入，非残留，主图正常引用即无害（2026-08-30 实证）

# 9. 通知用户去游戏核验：明确“看什么、正确/错误行为各是什么”（见 template-case.ts 注释风格）
```

## wire 断言片段（GIA 与注入后 .gil 通用，只换输入文件）

```bash
# 提取某节点（按 genericId 定位）所有 connects 的 connect/connect2
npx tsx tools/decode-gia.ts <file.gia|file.gil> -o /tmp/g.json 2>/dev/null
python3 - <<'EOF'
import json
d = json.load(open('/tmp/g.json'))
def walk(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == 'nodes' and isinstance(v, list): return v
            r = walk(v)
            if r is not None: return r
    elif isinstance(o, list):
        for v in o:
            r = walk(v)
            if r is not None: return r
    return None
for n in walk(d):
    if (n.get('genericId') or {}).get('nodeId') != <目标nodeId>: continue
    for p in n.get('pins', []):
        for c in p.get('connects', []):
            print(c.get('id'), json.dumps(c.get('connect')), json.dumps(c.get('connect2')))
EOF
```

注入后的 `.gil` 用 `tools/list-gil-node-graphs.ts` 找到目标图后，需按
`nodeGraphMessage.decode` 结构（nodes 在 decode 顶层，`g.nodes`）提取；.gil 路径 =
`/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/<playerId>/Beyond_Local_Save_Level/<mapId>.gil`
（本机 playerId=110170759，可用 `gsts maps` 输出确认）。

## 挂载目标选择（2026-08-14 地图异常教训，必读）

节点图必须挂载到实体才生效（graph-mounting.md），但挂载目标有硬性规则：

1. **禁止手动添加关卡实体**（1094713345，官方 defId=10003004）：关卡实体由游戏运行时
   默认创建，GIL 不预置；`assets:entities import` 手动添加 → 游戏报"地图异常"无法启动
   （2026-08-14 两次作废实证）。
2. **挂载目标 = 普通场景实体**：官方空模型 10005018（static-assemblies 创建）或
   `assets:entities import` 普通实体；确认 export 列表里该实体 comps 正常。
3. **tabBar 组件只能加普通实体**（魔方控制器 1077936138 已验证），禁止加关卡实体。
4. 地图作废特征：游戏加载报"地图异常"；排查优先查是否手动加过关卡实体。
5. 流程顺序（从零地图）：maps:create --graphs → 建普通实体（static-assemblies 或 import）→
   注册信号（如需）→ 注入图 → mounts attach 到普通实体 → 读图自检。

## 关键点（实测踩坑，勿重踩）

0. **注入报 EROFS/read-only file system（2026-08-27 3×3 实锤）**：批量注入输出
   `[error] Injection failed xxx.gia: EROFS: read-only file system`（备份 .gil 时 copyfile 失败）
   = **游戏目录挂载只读**（WSL `/mnt/c` 可能被挂成 `ro`），不是代码/注入器问题。排查：
   `mount | grep /mnt/c` 看是否 `ro`；能写则 `sudo mount -o remount,rw /mnt/c`（或环境沙箱
   放宽文件权限后重试）。先确认可写再跑注入，别反复编译浪费轮次。
1. **编译阶段 inject 的取舍**：非信号 case 不要配 inject——只要 inject 存在（即使
   `--noinject`），编译就会解析目标 gil，`mapId/nodeGraphId` 未回填（=0）时直接报
   `[error] target gil not found: .../0.gil`。**信号 case 例外**：GIA 生成从
   `cfg.inject` 指向的 GIL 读信号注册表（`finalizeSignalEncoding`），不配 inject 报
   `[error] signal registry is required when encoding signal nodes`；此时临时配 inject
   （mapId 回填验证地图 id）+ `--noinject` 编译（防批量注入），编译完再单文件注入。
2. **单文件注入**（`gsts <config> <file.gia>`）以 `config.inject.nodeGraphId` 为目标，且会把
   GIA 内 graph id 自动改写为目标 id（`loadGiaGraph` setGraphId）——**DSL 里 `g.server({id})`
   不必与 placeholder 图 id 一致**。这是最稳路径。
2a. **信号注册 pin 规律（2026-08-15 内置布局调查结论，勿手猜）**：编辑器为每种参数类型分配
   规范 pin 基址（新鲜地图：str=12/34/40、int=68/76/83、entity=69/77/84、float=90/109/122 等，
   索引/发送/监听/服务器节点各自独立）；同型重复参数按 send+4/mon+1/ser+1 递增（仅 str 有编辑器
   实证）；同地图内后续信号复用已有类型的基址（复用规则）。内置布局生成器已把这些规则编码，
   无需手工指定 pin。
2b. **多 case 注入流程（2026-08-14 复合族三合一实验复盘，必读）**：一次核验多个 case 时，
   每个 case 必须注入**各自的 placeholder 图**，且**每次注入前把 config.inject.nodeGraphId
   改成该 case 的目标图 id**（config 每次只指向一张图）。流程：
   ```bash
   # 为每个 case 建图（id 自动递增 1826/1827/1828...）：assets:node-graphs --name verify-<case> --write
   # 逐个注入（每次先改 config 的 nodeGraphId）
   node bin/gsts.mjs -c gsts.verify.config.ts dist-verify/.../<case1>.gia   # 注入前 config.nodeGraphId=<图1 id>
   # 下一个 case 重复：先改 config.nodeGraphId=<图2 id>，再注入 <case2>.gia
   ```
   **陷阱**：所有 case 用同一个 nodeGraphId 注入会互相覆盖（后注入的替换先注入的，只剩最后一张图）——
   "每分支一个图"原则的落地要求就是 nodeGraphId 逐一指向。**注入后必须自检**：
   `npx tsx tools/list-gil-node-graphs.ts <map.gil>` 核对每个目标图 nodeCount > 0 且图名为
   `_GSTS_<case>`；nodeCount=0 或图名没变 = 注入没落到目标图（典型：config nodeGraphId 没改）。
   多个实验也可写进**同一张 placeholder 图**（一个 TS 文件多个事件/多段逻辑，技能约定第 11 行），
   单次注入即可
2c. **注入后必挂载（2026-08-15 实测教训，必读）**：节点图注入 .gil 只是"存在于地图"，
   **必须 attach 到实体才执行**（graph-mounting.md）。漏挂载的症状 = 游戏日志只有旧图执行、
   新注入图零帧（本次验证：5 图注入 3 图挂载，日志只有 3 张旧图）。流程与自检：
   ```bash
   # 挂载到普通实体（挂载 API 比 CLI 稳定：assets:mounts attach 曾被 commander 参数解析卡住）
   # 用 production API：mountGraphToEntity(bytes, <entityId>, <graphId>, true) 写回 + 备份
   # 自检：list 盘点必须显示 graphs not mounted anywhere (0)
   node bin/gsts.mjs assets:mounts list --gil <map.gil>   # 每张图都有归属实体
   ```
   同时确认游戏加载目录：Save_Level 与 Temp 双份 .gil 必须一致（md5 对比；CLI 写 Save_Level
   后 Temp 需手动同步，否则游戏可能加载旧 Temp 版本）。；但失败时难以拆分定位——规则未闭合阶段建议每 case 一图（用户 2026-08-14 指导）。
3. **批量注入**（不带文件参数）按 GIA 内 graph id 找目标图（不改写），要求该 id 已存在于
   地图；需要 placeholder 分配 id 与 DSL id 对齐，脆弱，默认不用。
4. 新地图：`maps:create` 的 mapId = 现有最大 mapId + 1；`--graphs` 的 placeholder 图 id 从
   `1073741825` 起自增。给已有地图加图用 `assets:node-graphs --gil ... --name ... --write`。
5. `.gia` 默认输出到 IR JSON 同目录：`dist-verify/verify/<分支>/<分支>.gia`（config outDir 下）。
6. 注入前自动备份目标 `.gil`；`assets:node-graphs --write` 也会备份。
7. 注入成功 ≠ 游戏核验通过：wire 断言只是注入层证据，最终以用户游戏内结果为准。
8. 目标节点图不存在时注入报 `[error] target NodeGraph not found: <id>` → 回到第 2 步建 placeholder。
9. 破坏性操作边界：注入/新建地图前把 mapId、nodeGraphId、playerId、目标 .gil、源 .gia、命令
   一次性展示给用户确认（除非用户已给出本轮明确授权）。
9a. **客户端图注入（2026-08-29 实证，rubik-3x3-client clientProbe）**：客户端图（g.characterControlSkill 等）
   的注入与 server 图同链路（单文件注入自动改写图 id），但有三点差异：
   - **单文件 entry 配置编译会失败**：`entries=['./src/clientProbe.ts']` 触发
     `gsts.fCharacterControlSkill is only available in client_character_control_skill_* ctxType (current: javascript)`
     ——必须用**主配置**（entries 含全部图）`--noinject` 编译出 .gia，再单文件注入。
   - 信号类客户端图编译期仍需要 inject 指向目标 gil（读信号注册表），主配置 inject 已含 mapId 即可。
   - 客户端图**不经 mounts attach**（技能配置绑定/事件轨道是执行通道）；注入后回读哨兵 =
     图名变 `_GSTS_<gia基名>` + nodeCount 变化；图内节点名是服务端撞号产物，须按 genericId 重映射核对。
   - 客户端图 ID 段自动分配（起始 1082130433）见 `assets:node-graphs create --type`。
10. **多分支共存**：`./verify` 下多个分支的 DSL graph id 必须互不相同（merge 按图 id 合并，
    同 id 只出 1 个 GIA）；单文件注入会改写为目标图 id，DSL id 可随意取（用 1073741826+ 递增即可）。

## 核验闭环

用户游戏核验后：

1. 把结论写回 `references/verified-cases.md`（分支、地图/图 id、wire 形态、行为、日期、结果）。
2. 若核验揭示生产 gap：更新对应权威文档的 gap 标注（区分“已修复待核验/已核验闭合”），
   按 `composite-docs-maintainer` 路由。
3. 报告中分开陈述：自动证据（编译/wire 断言/注入成功）与用户游戏证据，不得混淆。

## 双轨差分核验协议（矩阵式，2026-08-29 变量系统 12 批实证，可复用）

适用：变量/资产/图结构的**字节级核验**（L3），用户能在编辑器执行同样操作时。
不是"注入后游戏核验"的替代（L4 仍按上方核验闭环由用户执行）。

流程：
1. **设计矩阵**：连续且小巧的改动点，覆盖容器×类型×形态×操作种类（新增/更新/默认/非默认/
   空/稀疏）；每批 = 用户一次编辑器保存；先读真实地图当前 sha 锁定 base。
2. **我方模拟注入**：在 /tmp 副本上连续累积（CLI `--output` 写实体变量 / 管线 GIA → 追加图
   记录），每批记录模拟 sha。
3. **用户操作**：编辑器执行同批操作 → 保存 → 报告"批次 N 完成"。
4. **逐批核验**：真实地图 vs 模拟——结构级比对（按字段解析，不逐字节）：
   - 变量语义字节必须逐字节一致（entry/记录级 hex）；
   - **位置字段（节点 x/y）不纳入**（编辑器布局 vs 管线默认布局）；
   - **编辑器归一化不纳入 DIFF**（root46 审计、dict f6/Map25 升级、首存省略默认字段）——
     标注 NOTE；
   - 操作偏差（类型看错/默认名/值输错）→ 以样本字节为准，模拟对齐后继续，顺带覆盖新形态。
5. **即时回填**：每批新实样（新形态/新语义）立即回填规律表/知识文档/记录（矩阵即证据），
   防止"核验完就丢"。

关键坑（2026-08-29 实证）：
- 逐字节全文件比对遇字段长度变化会整段错位报大量假差异——用结构级比对（cmp-entities/
  cmp-graph-nodes 式，位置显式排除）；
- 单一形态的字节巧合不能当规律（dict containerBinding 曾因 entity→entity 的 1/1 误判
  "恒写 1"，int→entity 实样才揭示 = key/value 类型码）——至少两个差异化样本定语义；
- 玩家/角色实体修改 = 编辑器自动同步全部副本（资产侧模板同步），模拟需按同步语义重建；
- 资产侧现象 ≠ 游戏行为：分层报告（资产侧字节实证 / 运行时语义待 L4 用户核验）。
