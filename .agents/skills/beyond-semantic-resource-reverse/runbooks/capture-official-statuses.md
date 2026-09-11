# Runbook：抓取“官方状态复制为自定义”的 type1017（票 01）

> 目标：获得官方状态 `10100002..10100017`（及 `10100101..10100116`）的内部 effectIds。
> 原理：官方状态只读时 type1017 不下发详情；复制为自定义后，系统会把完整定义实体化到自定义状态并下发。
> 本文所有依赖都在本技能目录/仓库内，**不依赖 /tmp**。

## 依赖清单（已入库）

| 依赖 | 路径 |
|---|---|
| pcap→type1017 一键解析 | `.agents/skills/beyond-semantic-resource-reverse/scripts/parse_official_copy_pcap.py` |
| HAblp 帧解码（探索用） | `.agents/skills/beyond-semantic-resource-reverse/scripts/decode_ipc.py` |
| type1017 分片解析（已有目录用） | `.agents/skills/beyond-semantic-resource-reverse/scripts/parse_type1017_catalog.py` |
| RawCap.exe（Windows 抓包） | `.agents/skills/beyond-semantic-resource-reverse/tools/RawCap.exe` |
| 结果资源 | `resources/official_status_effects.json` |
| 抓包证据规范 | `.scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/ipc/PROGRESS-IPC.md` |

无 `/tmp` 脚本依赖。

## 0. 把 RawCap 放到 Windows 可执行路径

WSL 里执行：

```bash
mkdir -p /mnt/c/beyond-ipc
cp .agents/skills/beyond-semantic-resource-reverse/tools/RawCap.exe /mnt/c/beyond-ipc/RawCap.exe
```

## 1. 启动抓包（Windows 管理员）

```bash
/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -Command \
  "Start-Process -Verb RunAs -FilePath 'C:\\beyond-ipc\\RawCap.exe' -ArgumentList '-s 600 127.0.0.1 C:\\beyond-ipc\\official_copy.pcap'"
```

验证：

```bash
/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -Command \
  "Get-Process RawCap -ErrorAction SilentlyContinue | Select-Object Id,ProcessName"
ls -l /mnt/c/beyond-ipc/official_copy.pcap
```

## 2. 用户在编辑器/游戏内操作

对每个官方状态：

1. 选中官方状态；
2. 点“复制为自定义状态”；
3. **保存前命名成 `C10100003` 这种格式**（用官方 ID）；
4. 保存；
5. **点一下刚创建的自定义状态**，让 type1017 把详情发出来。

> 一个 pcap 可以连续做多个；命名是关键，否则只能靠顺序推定。

## 3. 停止抓包

```bash
python3 .agents/skills/beyond-semantic-resource-reverse/scripts/quickstart_ipc_probe.py --finish <probe名>
```

`--finish` 会自动停止 RawCap（必要时弹 UAC），并把最终 pcap 复制到
`evidence/<date>-<probe>-probe/ipc/` + sha256。若只想停止不复制，用 `--stop`。

## 4. 一键解析

```bash
python3 .agents/skills/beyond-semantic-resource-reverse/scripts/parse_official_copy_pcap.py \
  /mnt/c/beyond-ipc/official_copy.pcap \
  --output /home/h/genshin-ts/.scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/ipc/auto_official_copy.json
```

输出：
- `availableStatusIds`：可用官方/自定义状态 ID；
- `definitions`：每个被捕获的自定义状态定义（含 names/effectIds）。

## 5. 回填资源

把确认后的 `statusId → effectIds` 合并进：

```bash
resources/official_status_effects.json
```

## 已知注意点

- type1017 不含 effect 名 / TextMapHash；名字需另走 TextMap/静态源。
- 官方状态复制出的新自定义 ID 是连续的，映射官方 ID 依赖命名或操作顺序。
- 如果抓包只出现 heartbeats 无 type1017，可能是编辑器缓存未重发；切换地图/重启编辑器再试。
