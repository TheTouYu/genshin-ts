# 实验：服务端控件模板「客户端控件容器」wire 规律（2026-10-29 起）

> 目标（用户 2026-10-29 定义）：①先学「客户端容器的规律」②再学它和 GIA 导入的客户端控件的关系
> ③最后补齐 CLI（`assets:ui container` 一条龙）与技能。
> 缺口背景：`gsts sim:import` 报 `服务端控件组「客户端控件容器」 which=21 status=UNSUPPORTED`；
> 现有 CLI 只造客户端半边（root9），编辑器保存后模板/挂载一起消失。

## 锁定的实验对象

```text
地图：1073741846 · 容器规律-差分基线（CLI 新建，2026-10-29 09:53）
当前路径（编辑器首存后已换布局，子目录优先）：
  …/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741846/1073741846.gil
旧平铺件被编辑器挪至 …/Beyond_Local_Save_Level/UpgradeBackup/1073741846.gil（= v0 副本）
Temp：…/BeyondLocal/110170759/Temp/1073741846.gil（与 Save_Level 同步，21,940 B）

LOCKED_BEFORE：evidence/2026-10-29-server-control-group/raw/r0-open-save.gil
LOCKED_HASH  ：14083a726316f4b84727a24a8583ad2c6d75ac2263e0c6359c9fcff3d4b553ba
（v0 基线：before/1073741846.gil，21,268 B，sha 69a0a410…59a0）
```

建图链（可复现，A0 短路）：

```bash
export GSTS_LOCALLOW_DIR="$HOME/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow"
unset LOCALAPPDATA
node dist/src/cli/gsts.js maps:create --name '容器规律-差分基线'
node dist/src/cli/gsts.js maps:init --map-id 1073741846 --write     # root3-49 引擎骨架
node dist/src/cli/gsts.js maps:resync --map-id 1073741846           # gip 注册（编辑器列表可见）
```

## v0 基线读数（建立时实测）

`assets:ui container discover`：`templates=0 instances=0`。
`assets:ui list`：默认布局 1073741825 + 官方预制 1826–1839 + 控件组库 1073741840 + 未归属 1841/1842。
root 指纹：**root6=1,216 B / root9=2,738 B / 无 root50**（与 2026-10-29 上一张干净图 1073741843 导入前同尺寸）。
→ 这两个数字就是"图是干净的"的机械判据，不必逐条清点 UI。

## ✅ R0（打开+保存，无操作）— 已闭合

快照 `raw/r0-open-save.gil`，21,940 B（Δ+672 B），root 变化 6/9/15/29/34/35/43/46/50。

### R0-1 族 87/88 ClientUI 层级根（**本轮主产出，可直接进 CLI**）

编辑器首次打开**自动新建**两条 root9 根记录（无 f504），ID = **本图已用最大 ID + 1 / +2**
（本图 maxUsed=1073741842 → 1843 / 1844）：

```text
f501=1073741843
  f502{f20{}} f501=10 f502=87          ← 族描述符：类20 序号87
  f502{f11{f501=1073741843}} f501=1 f502=5      ← 实例族声明（f501=自身ID）
  f505{f12{f501="ClientUIRootHierarchyRoot"} f501=2 f502=15}   ← 名字
  f505{f11{f11{}} f501=1 f502=11 f503{f13{f11{}} f501=4 f502=11 f503=1
       f504{f2=1 f3=8 f4=1073741843}}}      ← owner 自引用（f504.f4=自身ID）

f501=1073741844
  f502{f21{}} f501=11 f502=88          ← 族描述符：类21 序号88
  f502{f11{f501=1073741844}} f501=1 f502=5
  f505{f12{f501="ClientUIPrototypeHierarchyRoot"} f501=2 f502=15}
  f505{f11{f11{}} f501=1 f502=11 f503{f13{f11{}} f501=4 f502=11 f503=1
       f504{f2=1 f3=8 f4=1073741844}}}
```

- 族 **87** = `ClientUIRootHierarchyRoot`（UI 层级根），族 **88** = `ClientUIPrototypeHierarchyRoot`（模板层级根）。
- 解释 D695 的 ID 碰撞：CLI 把 maxUsed 推到 2503，编辑器建根就落在 2504/2505，随后与 CLI 分配撞车。
  ⇒ **CLI 造 UI 前置条件：先自建这两条根（克隆真实字节，改 ID/名字/owner 自引用）或至少预留 maxUsed+1/+2。**
- 待第二样本确认「maxUsed+1/+2」还是一般计数器（跨图核对：地图 1840 → 2002/2003，若该图 maxUsed=2001 则成立）。

### R0-2 root9 顶层结构（顺带闭合）

`root9.f501` = **packed varint 的顶层对象 ID 索引**（不是 message，旧工具会崩）：
`[1073741825, 1073741840, 1073741841, 1073741842]` → `[…, 1073741843, 1073741844]`。
`f502` × N = 全部对象记录（含子级）平铺；`f503=1` 固定。
⇒ 造新控件时必须**同时**追加 f502 记录 + 往 f501 索引里插 ID。

### R0-3 噪声清单（后续轮次先扣掉，不归因给用户操作）

| root | 变化 | 判读 |
|---|---|---|
| 43 | `"7.0.0"` → `"7.1.0"` | 客户端版本串 |
| 29 | `CNRELWin7.0.0`→`7.1.0` + 4 个 8 位数字串变 | 版本/资源号记录 |
| 46 | 22B→44B（+1 条） | 保存审计，每次保存追加 |
| 34 | occurrence 1→0 | 编辑器清掉的 flag |
| 35 | 6B→10B（`f2.f2=2` 补上） | 编辑器补默认值 |
| 15 | 记录 1090519041 +2B：`f4[5].f34.f1.f12 = 空 bytes` | 编辑器补空字段（**每次保存是否续增待观察**） |
| 6 | 33→43 条：9 个空 folder 壳 + folderId=114(typeValue 3000, ids 1/6/9/12/15) + folderId=4 的 `f5{800→1073741825}` 被清空 | folder 注册表归一化；布局登记去向待查（**不影响本实验**） |
| 50 | 从无到有，2B `f2=1` | 空壳根，待观察 |

## 轮次计划

| 轮 | 用户的唯一变化 | 要闭合的字段 |
|---|---|---|
| ~~R0~~ | ~~打开→保存→关~~ | ✅ 族 87/88 层级根 |
| **R1** | 在**服务端**控件模板页创建一个「客户端控件容器」 | 服务端 UIControlGroup(which=21) 落哪个 root / 记录 ID / 族描述符 |
| R2 | 把客户端控件模板放进去 | 服务端组 ↔ 客户端模板（root9）的引用方向与字段 |
| R3 | 从布局引用它 | 布局 `f503` 关系 + 脚本挂载槽 f74 |

## 续作入口（每轮一条命令）

```bash
SL="$GSTS_LOCALLOW_DIR/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741846/1073741846.gil"
python .agents/skills/editor-incremental-gia-investigator/scripts/gil-quick-diff.py \
  evidence/2026-10-29-server-control-group/raw/r0-open-save.gil "$SL" \
  --capture-dir evidence/2026-10-29-server-control-group/raw --snap r1-server-group --pair
```

已知客户端半边（D690，勿重学）：模板组 = root9 根记录 `f502{f14{f501{f134217734{}}}}`+`f505{f12{名字}}`；
布局实例组 = `f502{f13{f501=模板组}} f501=3 f502=3` + `f504=布局ID`；脚本挂载槽 f74 在
`f505{f73{} f501=63 f502=83 f503{f74{f501=1 f502{f1{f1=脚本GUID}}}}}`，克隆即继承。
**R1 要找的是「服务端」那一半——不在这批 root9 记录里。**
