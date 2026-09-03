# 票 05 · create 候选生成——真实命令输出样例（可复查）

> 会话：2026-09-02（仓库 `feat/composite-and-project-knowledge`，HEAD `b1fd6a0`）
> 范围：只读候选（`--output`），无任何 `.gil` 写回；写回/编辑器/游戏核验属后段（blocked，需用户确认）。
> 复现入口：先 `npx tsx ui/tests/extract-create-donors.ts`，再逐条执行下列命令。
> 门禁约定：80 快照语义验收全绿（禁抽查）；本文件是产出样例（铁律 9：重要输出落盘可复查）。

## 1. donor 提取（真实编辑器样本字节入注册表）

```bash
npx tsx ui/tests/extract-create-donors.ts
```

```
extracted custom-button.layout: 1073741909.after-重启4-默认布局自定义按钮-e645aefb.gil record=1073742032 len=963 sha256=cbf4739df5a1cfc7...
extracted custom-button.container: 1073741909.after-重启26-悬浮页加按钮-f0ddb622.gil record=1073742089 len=1156 sha256=dbcdd91b30569ba0...
extracted input-box.layout: 1073741909.after-重启19-图文输入框-a81cbfbf.gil record=1073742079 len=622 sha256=69d3d25dec23781f...
extracted input-box.container: 1073741909.after-重启64-容器三控件-e4c92e39.gil record=1073742157 len=622 sha256=00743f5fd8aad247...
extracted textbox.container: 1073741909.after-重启64-容器三控件-e4c92e39.gil record=1073742155 len=604 sha256=d35f61c566e45310...
extracted image.container: 1073741909.after-重启64-容器三控件-e4c92e39.gil record=1073742156 len=591 sha256=ef74578087681808...
extracted message-queue.layout: 1073741909.after-重启51-消息队列-536528cb.gil record=1073742132 len=859 sha256=20e65841ddd0c04d...
wrote /home/h/genshin-ts/ui/src/create-donors.ts
next: npx tsx ui/tests/create-candidates-assert.ts
```

donor 矩阵（kind × 放置面）= 80 快照内该控件**首次新建事件**（新建当轮字节，非后续编辑态）：
按钮 轮4 963B / 轮26 1156B；图文输入框 轮19 622B(布局1989) / 轮64 622B(容器)；
文本框 轮64 604B(容器)；图片 轮64 591B(容器)；消息队列 轮51 859B(默认布局)。
文本框/图片「布局面」无编辑器新建样本——create 层回退容器 donor + f504 重映射
（跨面同构已被 input-box 双真实样本互 remap 逐字节相等实证，见 §2 ok 14）。

## 2. 候选字节级断言（28/28 PASS）

```bash
npx tsx ui/tests/create-candidates-assert.ts
```

```
ok 1-7  - donor 防漂移 ×7（kind/parent/长度/sha256/hex 全对）
ok 8    - donor 集齐支持矩阵（7 样本 = 80 快照内全部单条新建事件）
ok 9    - 重放对拍: 布局自定义按钮（轮3→轮4；root9 全等 + root46 审计登记）
ok 10   - 重放对拍: 悬浮页容器自定义按钮（轮25→轮26）
ok 11   - 重放对拍: 图文输入框→自定义布局1989（轮18→轮19）
ok 12   - 重放对拍: 消息队列→默认布局（轮50→轮51）
ok 13   - 重放对拍: 容器面 textbox/image/input-box（轮63→64 三件套逐件重放）
ok 14   - 跨面同构: input-box 布局 2079 ↔ 容器 2157 互 remap 逐字节相等
ok 15-18- 分配器（空洞 2031 / 不冲突 / 占用报错 / 确定性）
ok 19   - 参数 patch: custom-button --name/--position/--size 语义回读
ok 20   - donor 回退: textbox/image 布局面 = 容器 donor + f504 重映射
ok 21-22- resolveSurfaceTarget 归属/配对校验
ok 23   - 全量快照: 80 个文件 × 5 kind 逐一 layout 面候选冒烟（禁抽查）
ok 24   - 全量快照: 含容器 2084 的快照 × 4 kind 逐一 container 面候选冒烟
ok 25   - fail-closed: message-queue 容器面无样本 → 显式报错
ok 26-27- 布局创建: 轮0→轮1（1989+14 克隆）/ 轮1→轮2（2004+14，重名 _1）root9 全等重放
ok 28   - 全量快照: 80 文件逐一布局创建冒烟（+1+14 / 成员 / 父引用 / 其余零改动）
PASS 28 create-candidate assertions
```

对拍方法学（本轮修正）：编辑器每次保存会**等长改写 root46 审计段**（差分笔记「root46 等长
审计」的实义=长度不变、内容变化）。因此整文件逐字节对拍改为**顶层字段级**：root9 段逐字节
相等（记录/顺序/宿主 f503 全覆盖），其余字段等值，root46 仅等长校验并登记为预期差异。

全量快照逐文件冒烟（禁抽查）：80 个 `.gil` 每个都生成 **5 kind（custom-button/textbox/image/
input-box/message-queue）× 布局面**只读候选并断言（+1 记录 / 宿主 f503 含新 ID / 其余记录
零改动 / 分配 ID 非冲突）；其中 45 个含悬浮页固有容器 2084 的快照额外做 **4 kind × container 面**
候选（35 个快照为轮24 前或无归属容器，跳过=样本外合法）。

## 3. 全量语义回归（80 快照，硬门禁）

```bash
npx tsx ui/tests/exhaustive-snapshot-verify.ts 2>&1 | tail -2
```

```
PASS 127 snapshot assertions over 80 files
```

```bash
for f in .gsts/diff-exp/ui学习/*.gil; do
  node bin/gsts.mjs assets:ui list --flat --gil "$f" --format json >/dev/null || echo "FAIL $f"
done
```

```
CLI80 files=80 FAIL=0
```

## 4. 类型检查 / 构建

```bash
# 本票改动子集（src + ui/src）：
npx tsc -p tsconfig.json --noEmit   # 全量被 examples/football WIP 阻塞时用子集 tsconfig（临时）
```

```
TSC_EXIT:0（src + ui/src 子集，临时 tsconfig.ui05.tmp.json，跑完即删）
```

```bash
npm run build
```

```
EXIT:2 —— 唯一错误：examples/football/src-fb/fb-phys.ts(121,35): error TS2551
（examples/football/* 为交接书 §3 无关 dirty 路径，football 票13 WIP，本票未触碰；
 子集 tsc EXIT 0 证明本票代码类型全绿；全量构建待 football 收口后重跑复核）
```

## 5. create 真命令冒烟（源码入口 = dist 未含新代码时与 bin 等价执行路径）

```bash
GIL=.gsts/diff-exp/ui学习/1073741909.after-重启66-默认页签2-7468eadd.gil
npx tsx /tmp/ui05-smoke.ts create --type custom-button --on layout:1073741825 --gil "$GIL" \
  --output /tmp/ui05-cand.gil --format json
```

```
surface={"kind":"layout","layoutId":1073741825}
parentId=1073741825
newId=1073742155
donor=1073741909.after-重启4-默认布局自定义按钮-e645aefb.gil (1073742032->1073742155)
candidateSha256=667e2302387502be83fd29af30ebb900d4697b4bb7e5f8f0360d8d1822d18e8d
candidate=/tmp/ui05-cand.gil
editorOrGameValidation=not-performed
```

```bash
npx tsx /tmp/ui05-smoke.ts create --type custom-button --on container:1073742084 \
  --gil "$GIL" --output /tmp/ui05-cand2.gil --format json
# surface={"kind":"container","containerId":1073742084}  newId=1073742155
# donor=...after-重启26... (1073742089->1073742155)
```

候选语义回读（对 base 快照做 list，两次 create 各 +1 且路径正确）：

```
base buttons: 4 | c1: 5 | c2: 5
c1 button: {"kind":"custom-button","path":"布局:默认布局:自定义按钮#1","name":"自定义按钮"}
c2 button: {"kind":"custom-button","path":"控件组库:悬浮交互页#1:固有容器#1:自定义按钮#2","name":"自定义按钮"}
CHECK PASS
```

负例（fail-closed / 归属校验）：

```
ERROR: [error] create custom-button 本轮候选=编辑器默认形态（--text/--color/--font-size/--content
需状态素材或内容载体 donor，尚未差分闭合，见 .scratch/ui-command-layer/issues/05 open-items）...
ERROR: [error] 1073742085 不是悬浮页容器（kind=close-button 属控件/布局类）
```

## 6. 波 1 · 真实写回记录（ui学习 live，2026-09-03）

```
baseSha:   7f425bf2da5e7bf000b9fcc280c377c312d16994ef025d818a27b5f0b6d6c1a2  (live 现态)
candSha:   285a13be7f57d3413398f1c09e06b86bc85ab6e4ed7898174551dbdcdd873762   ← 当前 live（初版位置）
写入内容:  布局「游戏主菜单」1073742164（克隆默认布局 14 官方预置 2165..2178）
          + 标题文本框 2155 / 玩家名输入框 2141 / 开始游戏 2140 / 设置 2139 / 退出 2138
backup:    Beyond_Local_Save_Level/.gsts/backups/1073741909.gil.<stamp>.wave1.bak
readback:  records 108→128，layouts=4，语义路径 布局:游戏主菜单:* 全 PASS
temp sync: Temp/1073741909.gil 已同步
```

⚠️ **位置方向修正（2026-09-03 用户纠偏）**：编辑器坐标系 y 向上（0=屏幕底/900=顶，知识权威
轮18 已写明「左下角原点、x 右 y 上」）——初版按 y 向下写（230→580）导致菜单整列镜像。
修正候选已生成未写回：`/tmp/wave1-menu-fix.gil`（SHA `5be57b90…`，五个控件位置
670/570/470/395/320，语义回读 PASS）；**live 当前仍是初版倒置位置（285a13be…），
写回待用户指令**。方向约定已同步：ui/AGENTS.md 坐标速记、mappings §0、
references/ui-controls.md 轮18 CLI 含义警示、assets_ui --position 帮助、create.ts 参数注释。

验收：编辑器打开 → 界面控件组管理 → 布局「游戏主菜单」看排版（AI 默认摆位仅供细排起点，
玩家拖动后 AI 可用 diff 识别改动）。

## 7. 未验证/需用户确认（三栏中的后两栏）

- 尚未验证：真实 `--write` 写回后的编辑器可见/可细排（波1 已写回，等你编辑器验收）；
  游戏内按钮显示/位置/点击/悬浮页事件（行为层，票 08 等价验收，**用户按验收句式确认**）；
  `--text/--color/--font-size`（素材骨架 donor 未闭合）；容器面 `--position/--size` 字节级
  同参对拍（无编辑器同参样本，仅语义回读）。
- 波 2 进展：模板化 B1（按钮轮4→5）/B4（库实例轮5→6）/B2（输入框三合一轮22→23）已字节级
  重放全等（ui/tests/templateize-replay-assert.ts 5/5，提交 56d5d6f）；B3（消息队列轮63 三合一+
  样式树克隆）与样式微调仍在排期；全量 npm run build 被 football WIP 阻塞的说明见 §4。
- 本样例全部命令均为只读（候选落 /tmp）；候选文件与 80 快照逐字节对拍见 §2/§3。

## 8. 波 2 · 模板化重放样例（2026-09-03）

```bash
npx tsx ui/tests/templateize-replay-assert.ts   # 期望 PASS 5 templateize-replay assertions
```

```
ok 1 - 模板化重放: 按钮官方单条→模板（轮4→轮5；root9 全等）
ok 2 - 实例化重放: 模板→库详情实例（轮5→轮6；root9 全等）
ok 3 - 模板化重放: 图文输入框三合一含自动库实例（轮22→轮23；root9 全等）
ok 4 - fail-closed: 非官方单条不可模板化（实例/模板拒绝）
ok 5 - fail-closed: 无 subtype 变体样本的 kind 拒绝（消息队列模板化待轮63 差分）
PASS 5 templateize-replay assertions
```

命令面：`assets:ui template create <官方控件ID>`（kind=custom-button→仅模板+升格；kind=input-box→
三合一自动库实例）；legacy `template create --id --asset` 路径保留。写入规则要点：模板插模板簇末、
索引插索引头模板簇后、库实例插 1840 成员簇后（轮23 有前置 2034 时在其后）、空容器 f503 缺失时
新建字段（轮6 +8B 实证）、输入框深链 505.503.19.62.501:1 重指向、subtype 槽家族变体 v1/v2。
