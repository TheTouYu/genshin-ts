# 完整复盘：票01 IPC 抓包/解包阶段（2026-09-04）

> 范围：从 RawCap 重录 → HAblp/XOR 0xEA/protobuf 解包 → 多次抓包确认 IPC 不含 TextMapHash。
> 证据：`ef3d039`、`0b2af7f`、`c5a0d74`、`46fd45c`；证据目录 `.scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/ipc/`。
> 状态：阶段收口，转向静态数据。

## 一、成果与弯路总览

| # | 动作 | 结果 | 价值 |
|---|---|---|---|
| 1 | RawCap 重录重连 IPC | 拿到 1.7MB server→client | 高 |
| 2 | 反编译网络类 + 子代理 | 确认 wire=HAblp + XOR 0xEA + protobuf | 高 |
| 3 | 首次 type1022 解包 | 资源/图标/路径目录 | 中（排除） |
| 4 | 完整目录重抓 | type1017 只给 effectID 列表，无 hash | 中（排除） |
| 5 | 地图切换重抓 | type1022 资源目录 | 中（排除） |
| 6 | 在 IPC 中反复找 TextMapHash | 0 命中 | 低（绕路） |

## 二、系统性根因

1. **把“效果目录”默认当成 IPC 可下发的数据**，但实际 IPC 只传 effectID/参数，不传显示名 hash。
2. **验证“抓包是否有价值”太晚**：应先从反编译/服务名判断“哪个 HAblp type 承载显示名”，再投入多次抓包。
3. **资源/状态未及时收敛**：中途产生大量 pcap/flow/decoded 临时文件，复盘前才做 gitignore 与清点。

## 三、方法论教训

- 自定义协议逆向顺序：**先反编译 framing/序列化 → 再决定抓什么动作**，不要先盲抓。
- “某个通道没有目标字段”也是结论，应尽早记录并切换，不要重复同类抓包。
- 大规模二进制产物要尽早 `gitignore`，避免污染 git status 与上下文。
- 用户纠偏原话（逐字）：
  - “分析的时候结合Beyondxxx进一步过滤数据”
  - “这是原神本体打开的子程序，和游戏的编译器功能息息相关”
  - “先复盘更新文档和进度并清点资源”

## 四、未闭合项与下一步

- [ ] IPC 通道已排除；不再继续重复抓同类动作。
- [ ] 导出 type1017 effectID 全清单，做“ID 全集”资产。
- [ ] 主攻游戏静态 Blb/MiHoYoBinData，解析含 effectID 的对象。
- [ ] 或降级收口：以现有 6 样本 + effectID 全集先出部分 JSON，另开全量票。

## 五、产出清单

- 提交：`ef3d039`、`0b2af7f`、`c5a0d74`、`46fd45c`
- 文档：`ipc/PROGRESS-IPC.md`、`INVENTORY.md`
- 脚本：`ipc/decode_ipc.py`
- 结论：IPC 不含 effectID→TextMapHash 映射。
