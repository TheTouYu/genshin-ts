# 票 01 侦察固化（2026-09-04）

> 目的：下次会话/复盘可无缝继续，不依赖 `/tmp` 与 Windows 临时目录。
> 状态：OPEN；已完成 A 前半（assets.bin 密码）并发现 Blb 新容器卡点。

## 相关提交
- `5901644` 票01: 落盘运行时侦察发现与TextMap哈希线索
- `538e8dd` 票01: 记录assets.bin密码破解与Blb新容器发现

## 关键事实
1. BeyondEditor = .NET/WPF，由 YuanShen 以 `-autoConnect -sourcepid` 拉起。
2. 效果/单位状态 UI 在原神主窗口；BeyondEditor 辅助窗口不含效果名明文。
3. YuanShen 监听 `127.0.0.1:54562`，BeyondEditor 经 loopback TCP 连接；关/开效果列表不传名字/ID。
4. YuanShen 受反作弊保护：Procdump/Handle/ListDLLs 读不到；pktmon 不抓 loopback。
5. 社区 AnimeGameData `TextMapCHS.json` 命中：
   - 造物不可见 = `1842178763`、`1272094579`
   - 定时触发技能 = `3678006995`
   - 移动速率调整率（动态）未命中。
6. 编辑器 Json 树 4098 `.mihoyobin` 无效果 ID、无上述 TextMap 哈希。
7. `assets.bin` ZIP 密码 = `G16F153D`（由 BeyondEditor 字符串解密器在 Windows 运行解出）。
8. 解开 `assets.bin` 内层后是 ZIP，6453 个文件全部是 UI 图标 PNG；`beyondeditorassets.bin` 同。
9. 当前游戏 `.blk` 使用 `Blb\x03` 容器（旧版 `blk\0`）；AssetStudio 2.4.1 可解析旧块、不能解析当前块。
10. 当前块原始扫描命中：
    - `00/25539185.blk`（Excel 块）：1720001(varint)、2010001(u32le/varint)
    - `00/24230448.blk`（BinOutput 块）：1720001(u32le/varint)、2110001(u32le)
    - 未在 25539185/24230448/31049740 中找到 TextMap 哈希（哈希可能在子文件内压缩/加密）。
11. 结论：`effectID → TextMapHash` 映射表在当前 Blb 块内；需 Blb 解包或逆向。

## 持久化资产
- `decoder/`：Windows 控制台工程，运行 BeyondEditor 字符串解密器（输出 assets.bin 路径/密码）。
- `scripts/`：本轮回溯/搜索脚本（内存、Json、pcap、AnimeGameData）。
- 临时大文件可删除：
  - `/home/h/beyond_9980.dmp`（5.1G）
  - `/home/h/beyond_33256.dmp`（214M）
  - `/home/h/loop.pcap`（1.2M，可留可删）
  - `/home/h/assets.bin.outer`（221M）与 `/home/h/assets.bin.unlocked`（221M）可留可删
  - Windows `C:\temp\pktmon.etl` 等可清理。

## 下一步（用户已选方向 3）
在游戏**首次启动/首次打开单位状态面板**时，用 ProcMon 抓 YuanShen 实际读取了哪些 Blb 块/文件；
配合 `beyond_pkg_version` 与 `res_versions_streaming` 可把块 hash 映射到逻辑名。
若需要先做 Blb 逆向，参考 `handoff.md` 与上表。
