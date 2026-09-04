# 完整复盘：Beyond 语义资源票 01 侦察轮（2026-09-04）

> 范围：票03 收口后进入票01，从静态反编译 A、运行时抓取 B、社区数据 C 到 `assets.bin` 密码破解与 `Blb` 新容器发现。
> 证据：提交 `bf66eba`→`5901644`→`538e8dd`→`adc6604`；临时资产固化见
> `.scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/handoff.md`
> 状态：进行中，未闭合；下一步方向 3（游戏首次启动文件读取跟踪）。

## 一、历程与低效点总览

| # | 日期 | 环节 | 现象/绕路 | 关键教训 | 提交/产物 |
| --- | --- | --- | --- | --- | --- |
| 1 | 09-04 | A 静态 | 直接深挖混淆 IL/反射，投入多轮 | 先枚举社区工具/数据源再深挖 | `beyond-editor-semantics.md` |
| 2 | 09-04 | B 运行时 | 先 dump BeyondEditor，但 UI 实际在 YuanShen | 先确认 UI 宿主进程再抓内存 | 票01 轮次 |
| 3 | 09-04 | B 抓包 | pktmon 不抓 loopback；未第一时间想到 RawCap | 工具选型前先查 loopback 支持 | RawCap 成功 |
| 4 | 09-04 | A 反射 | Linux 反射被 WPF 阻断后才转 Windows | 跨平台 WPF 程序在 Linux 反射不可行；应尽早准备 Windows 运行 | `decoder/` |
| 5 | 09-04 | 搜索 | 早期只搜效果 ID，未搜 TextMap hash/社区 TextMap | 用“已解析内容 ID + TextMap hash”双向锚点 | AnimeGameData 命中 |
| 6 | 09-04 | 解包 | assets.bin 密码解开后未先看类型就推测是映射表 | 解开后先看文件类型/目录再下结论 | 发现全为 PNG |
| 7 | 09-04 | 主数据 | 当前 `.blk` 是 `Blb\x03` 新格式，旧 AssetStudio 不能解 | 格式版本检查要先于工具调用 | 锁定 Blb |

## 二、最近一次“卡点”的调查链

- 现象：`00/25539185.blk` 原始扫描命中效果 ID，但 AssetStudio 解出 0 资产。
- 差分：同一 AssetStudio 能解析旧 `blk\0` 块（899 资产），不能解析当前块。
- 根因：当前块头部为 `Blb\x03`，不是旧 AssetStudio 支持的 AssetBundle 直接格式。
- 结论：`effectID→TextMapHash` 映射表在当前 Blb 块内，需当代 Blb 解包工具或逆向 Blb 容器。

## 三、系统性根因

1. **缺少“语义资源逆向”的固定工作流/checklist**：没有先枚举社区数据源、格式魔数、宿主进程、热更新清单，
   导致每一步都在现场摸索。
2. **阶段成果固化滞后**：大量证据先散落在 `/tmp`、Windows `C:\temp`、`/home` 大 dump；用户提醒后才固化。
3. **对“开发者设计思维”利用不足**：热更新/多语言意味着配置表与文案分离、大资源包可能只是素材；
   若早按此推断，能更快排除 assets.bin 并指向 Blb 块。

## 四、流程与方法论教训

- 用户纠偏原话（逐字）：
  - “如果存在资源里面，肯定会把id和对应的信息，效果名字绑定在一起的”
  - “我们可以稍微逆向一下思维：如果我们是开发者，会怎么设计？需要考虑多语言、资源，以及版本更新”
  - “别着急，我觉得你应该先停下来……临时目录下次就没有了，然后再进行一个系统性的复盘”
- 可复用方法：
  1. 逆向前先画“资源生命周期”：热更清单 → 容器格式 → 配置表 → 多语言 TextMap。
  2. 用 `beyond_pkg_version`/`res_versions_streaming` 这类版本清单做“远端 vs 本地”差异，排除隐藏文件。
  3. 搜索锚点同时用“ID 二进制编码”和“已知 TextMap hash”双向找映射表。
  4. 宿主进程不确定时，先枚举窗口/进程再抓内存或流量。
  5. 新容器/新格式先用魔数校验，再选工具。

## 五、未闭合项与下一步

- [ ] 解开当前 `Blb\x03` 容器（找当代工具或自行逆向格式）。
- [ ] 从 Blb 块内提取 Excel/BinOutput 子文件，定位含 `2010001/2110001/1720001` + TextMap hash 的配置表。
- [ ] 游戏首次启动/首次打开单位状态时 ProcMon 抓 YuanShen 读取的 Blb 块，缩小范围。
- [ ] 建立 `effectID→TextMapHash→中英文名` JSON 产物并对照编辑器/游戏显示。

## 六、产出清单

- 提交：`bf66eba`（票03收口）、`5901644`、`538e8dd`、`adc6604`
- 文档：`semantic-resource-inventory.md`、`beyond-editor-semantics.md`（侦察更新）
- 证据目录：`.scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/`
  - `handoff.md`：关键事实/命令/下一步
  - `decoder/`：BeyondEditor 字符串解密器工程
  - `scripts/`：内存/pcap/Json/AnimeGameData 搜索脚本
- 关键秘密：`assets.bin` ZIP 密码 `G16F153D`；内层全为 PNG。
