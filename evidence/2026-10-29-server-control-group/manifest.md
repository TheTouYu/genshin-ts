# 实验：服务端控件模板「客户端控件容器」wire 规律（2026-10-29 起）

> 目标（用户 2026-10-29 定义）：①先学「客户端容器的规律」②再学它和 GIA 导入的客户端控件的关系
> ③最后补齐 CLI（`assets:ui container` 一条龙）与技能。
> 缺口背景：`gsts sim:import` 报 `服务端控件组「客户端控件容器」 which=21 status=UNSUPPORTED`；
> 现有 CLI 只造客户端半边（root9），编辑器保存后模板/挂载一起消失。

## 锁定的实验对象

```text
地图：1073741846 · 容器规律-差分基线（CLI 新建，2026-10-29 09:53）
Save_Level：…/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741846.gil   （平铺布局）
Temp      ：…/BeyondLocal/110170759/Temp/1073741846.gil                     （双址同源）
size      ：21,268 B
LOCKED_BEFORE：evidence/2026-10-29-server-control-group/before/1073741846.gil
LOCKED_HASH  ：69a0a41047218af1947a35e7e9b2b4b1fe3a3e62504d659d9b7a1cc5b06959a0
```

建图链（可复现，A0 短路）：

```bash
export GSTS_LOCALLOW_DIR="$HOME/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow"
unset LOCALAPPDATA
node dist/src/cli/gsts.js maps:create --name '容器规律-差分基线'
node dist/src/cli/gsts.js maps:init --map-id 1073741846 --write     # root3-49 引擎骨架
node dist/src/cli/gsts.js maps:resync --map-id 1073741846           # gip 注册（编辑器列表可见）
```

## 基线读数（建立时实测，非推测）

`assets:ui list`：

```text
[layout] 默认布局 1073741825 + 官方预制 ×14（1826–1839）
[library] 控件组库 1073741840（空）
[unknown] 未归属 官方预制 ×2（1841/1842）
```

`assets:ui container discover`：`templates=0 instances=0` —— **无任何客户端控件模板、无容器**。
root 清单 43 条，关键：root9=2,738 B、root6=1,216 B、**无 root50**（未导入脚本资产）。
（形状与 2026-10-29 上一张干净基线 1073741843 导入前完全一致：1,216 / 2,738。）

## 已知噪声（差分时先扣掉，不归因给用户操作）

1. root46 = 每次保存追加的编辑器审计记录（22 B 起）。
2. **族 87/88 ClientUI 层级根**：本基线没有，编辑器首次打开会自建（D695 跨 6 图对照已证）。
   → 故 Round 0 先「只打开+保存」固化这两条，之后每轮才唯一归因。

## 轮次计划

| 轮 | 用户的唯一变化 | 要闭合的字段 |
|---|---|---|
| R0 | 打开地图 → 保存 → 关（不做任何操作） | 编辑器自建的两条层级根落点与 ID |
| R1 | 在**服务端**控件模板页创建/出现「客户端控件容器」 | 它落在哪个 root / record ID / 父子引用 |
| R2 | 把客户端控件模板放进去 | 组与客户端模板的引用方向（含 vs 指向） |
| R3 | 从布局引用它 | 布局 `f503` 与模板的关系、脚本挂载槽 |

## 续作入口

每轮取证：

```bash
python .agents/skills/editor-incremental-gia-investigator/scripts/gil-quick-diff.py \
  evidence/2026-10-29-server-control-group/before/1073741846.gil <当前地图.gil> \
  --capture-dir evidence/2026-10-29-server-control-group/raw --snap <语义名-vN>
```

收尾把新的 `LOCKED_BEFORE/LOCKED_HASH` 写回本文件并 `sha256sum` 复核。
