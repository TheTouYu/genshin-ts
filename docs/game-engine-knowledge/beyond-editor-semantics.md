# Beyond 编辑器语义资源（BeyondEditor semantic resources）

> 状态：部分已验证（容器格式 CONFIRMED；效果名目录源未定位）
> 来源：仓库既有脚本 `scripts/nodegraph/extract-mihoyo-editor-names.ts`（XOR_KEY=0xE5 为既有知识）
>       + 2026-09-04 本地探索（BeyondAssistEditor 实读、CHS TextMap 解码 7743 条）
> 适用范围：`BeyondAssistEditor` 编辑器本地语义资源；主游戏数据（YuanShen_Data）不在本文件范围

## 一句话架构

真实地图 `.gil` 只存资产/效果的数字 ID（为减少编码体积、便于网络传输）；**语义名称（中文名、
英文名等）不在 GIL 里**，由编辑器按语言从本地语义资源表加载并渲染。语义资源表位于
`<游戏安装>/BeyondAssets/BeyondAssistEditor/Resource/Json/` 下，以 `.mihoyobin` 二进制表存放。

## 容器格式（CONFIRMED，可复现）

`.mihoyobin` = **逐字节 XOR 0xE5 → protobuf message**。

既有解析入口（权威）：`scripts/nodegraph/extract-mihoyo-editor-names.ts`
（`XOR_KEY = 0xe5`；支持 Node/TextMap/BeyondGlobal 三类）。自写脚本也可直接按该算法解析。

已确认的结构（基于脚本 + 本次实测）：

```text
TextMap（Resource/Json/TextMap/<语言>/<hash>.mihoyobin，每语言一个文件）：
  顶层 field 2 重复 = 条目 { 2: hash(int64), 3: UTF-8 文本 }
  实测 CHS 7743 条，内容为编辑器节点名/枚举名等（如「打印字符串」「获取指定玩家所有角色实体」）
Node（Resource/Json/Beyond/Node/<hash>.mihoyobin，每节点一个文件）：
  genericId = 4.1.5（varint）；节点名 hash = field 206；pin 名 hash = pin 组字段 100~107
  的 descriptor field 7
BeyondGlobal（Resource/Json/Beyond/BeyondGlobal/<hash>.mihoyobin）：
  field 1 = 枚举容器，枚举记录 = repeated field 1
```

## 本次实证与未闭合

- CONFIRMED：CHS TextMap 全部 7743 条中**不含**状态效果名「移动速率调整率（动态）/
  定时触发技能/造物不可见/初始持续时间/层数上限」（搜 0 命中）；GIL/导出区同样搜不到这些名。
- CONFIRMED：GIL 的 root15/16 效果条目的语义 = 数字 ID（1720001/2110001/2010001，
  见 `unit-status.md`），名称需查外部目录。
- OBSERVED：`Resource/BeyondAssets/assets.bin`（230MB）是 ZIP，内层 `assets.bin`
  加密（需密码）——剩余编辑器目录很可能在其中。
- OPEN：状态效果名目录的**来源**未定位。候选：
  ① BeyondEditor.dll（混淆 .NET，反编译找加载器/密码）；
  ② 游戏主进程数据（YuanShen_Data/StreamingAssets/*.blk——沙箱效果表可能是主游戏
  新增 Excel/TextMap，编辑器经 IPC 向游戏要目录）；
  ③ assets.bin 加密内层。
- OPEN：TextMap hash 与效果 ID 之间应隔一张“效果配置表”（effect config 把 1720001 →
  TextMap hash）——表位置未定位。
- OPEN：方言/语言版本：编辑器 TextMap 实测 15 语言，但效果名若来自主游戏 TextMap，
  主游戏 TextMap 在 blk 内且为多语言。

## 2026-09-04 侦察更新（票01，A/B 路线）

- CONFIRMED：BeyondEditor 是 .NET/WPF 程序，由 YuanShen 以 `-autoConnect -sourcepid` 拉起；
  效果/单位状态列表 UI 实际显示在**原神主窗口**，BeyondEditor 的窗口是辅助/资源/日志窗口。
- CONFIRMED：YuanShen 监听 `127.0.0.1:54562`，BeyondEditor 通过 loopback TCP 连接；但**关/开效果列表时不传输效果名或效果 ID**，
  说明效果目录不是编辑器 IPC 实时下发，而是 YuanShen 本地已有/编辑器侧另有来源。
- OBSERVED：YuanShen 有反作弊/保护：Procdump、Handle、ListDLLs 均无法读取；pktmon 不抓 loopback。
- CONFIRMED：社区 `AnimeGameData/TextMapCHS.json` 含：
  - `造物不可见` → `1842178763`、`1272094579`
  - `定时触发技能` → `3678006995`
  - `移动速率调整率（动态）` 未命中（可能不是主游戏正式文案）
- CONFIRMED（排除）：编辑器 Json 树全部 4098 `.mihoyobin` 无效果 ID、无上述 TextMap 哈希；
  AnimeGameData 候选 Excel/BinOutput 未找到 `effectID→TextMapHash` 映射。
- 当前最大嫌疑：`BeyondAssistEditor/Resource/BeyondAssets/assets.bin` 加密内层，或主游戏 blk 内未公开映射表。
- 待办：在 Windows 运行 BeyondEditor 字符串解密器以解 `assets.bin` 密码（Linux 反射被 WPF 依赖阻断）。
- CONFIRMED：BeyondEditor 字符串解密器解出 `assets.bin` ZIP 密码 = `G16F153D`。
- CONFIRMED（排除）：解开 `assets.bin` 内层后是 ZIP，6453 个文件全部为 UI 图标 PNG；`beyondeditorassets.bin` 同为图标。
- CONFIRMED：当前游戏 `.blk` 使用 `Blb\x03` 容器（旧版为 `blk\0`）；AssetStudio 2.4.1 可解析旧块、无法解析当前块。
- CONFIRMED：当前 `00/25539185.blk`（Excel 块）原始扫描命中效果 ID 1720001/2010001；`00/24230448.blk`（BinOutput 块）命中 1720001/2110001。
- 结论：`effectID→TextMapHash` 映射表在当前 Blb 块内；下一步需当代 Blb 解包工具或逆向 Blb 容器格式。

## 关联

- `gil-structure-semantics.md`：为什么 GIL 只存 ID（体积/网络）。
- `unit-status.md`：效果/状态 wire 侧 ID 语义（本文件是 wire ID 的名字解析侧）。
- `assets-and-files.md`：关卡保存/导出文件体系（GIL/GIA）；本文件为编辑器侧资源文件。

## 下一步（工程化推进）

按票据推进，入口见 `.scratch/beyond-semantic-resources/BOARD.md`；首个票据 01 =
定位并解析状态效果语义目录源（候选 A 反编译 / B 运行时抓取 / C 主游戏 blk）。
