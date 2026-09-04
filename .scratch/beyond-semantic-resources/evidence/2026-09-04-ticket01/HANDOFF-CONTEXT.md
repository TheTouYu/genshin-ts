# 票01 交接快照（2026-09-04，防上下文压缩）

> 阅读顺序：本文件 → `issues/01-locate-effect-catalog.md` → `blb3/PROGRESS.md`
> 恢复锚点：差分实验 manifest 在
> `/home/h/genshin-ts-evidence/editor-incremental-gia-investigator/20260904-feature-diff/ticket01-effect-catalog/manifest.md`

## 目标

票 01：建立机器可读映射 `effectID → TextMapHash → zh/en`，至少覆盖：
1720001 / 2110001 / 2010001 / 2120001 / 2130001 / 590001。

## 当前结论（最新优先）

1. **效果名在游戏主 TextMapCHS/EN**，不在编辑器本地 TextMap（7743 条）中。
2. **编辑器本地 `.mihoyobin`（4098 个）全部扫过**：XOR 0xE5 后无效果 ID/hash。
3. **BeyondEditor.dll 加密字符串全部解出（2826 条）**：
   - 文件：`decoder/DecoderOutput.txt`
   - 没有效果名、效果 ID、TextMapHash。
   - 发现服务名：`beyondEffectService`、`beyondRoleStatusService`。
4. **主游戏 Blb 解包**：
   - `25539185`（Excel）→ 2069 MiHoYoBinData
   - `24230448`（BinOutput）→ 160129 MiHoYoBinData
   - `31049740` → 类型表
   - 原始对象中可搜到部分 1720001/2010001；**搜不到 2120001/2130001/590001 及对应 TextMapHash**
5. **当前 7.0.0 不要用 XOR 0x95**（旧社区版本才用）。
6. UI 控件名“图文输入框/消息队列”在主游戏资源查不到；UI 名属编辑器本地，不是票01入口。

## 已确认样本（写入 `blb3/effect_samples.json`）

| effectID | zh | en | TextMapHash |
|---|---|---|---|
| 2010001 | 造物不可见 | Creation Invisible | 1842178763 / 1272094579 |
| 2110001 | 定时触发技能 | Trigger Skill on Timer | 3678006995 |
| 1720001 | 移动速度调整率（动态） | Movement SPD Adjustment Rate (Dynamic) | 1475323595 / 2039318347 |
| 2120001 | 调整动画速度 | Adjust Animation Speed | 1739984627 |
| 2130001 | 调整冷却时间 | Adjust Cooldown | 571354851 |
| 590001 | 禁用跳跃 | Jump Disabled | 3885732523 / 196650779 |

## 关键路径

- 差分实验 map：
  `/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741918.gil`
- 实验快照：
  `/home/h/genshin-ts-evidence/editor-incremental-gia-investigator/20260904-feature-diff/ticket01-effect-catalog/raw/`
- 当前 LOCKED_BEFORE：`ticket01-disablejump-v27.gil`
  hash `d154617bd968e6dceb62a1c1f2256b96b8f84b0863f4c4a6672a20e1edb46a63`
- 解码器：`decoder/`
  - `Program.cs`（支持批量 decode 与 `--types`）
  - `DecoderArgs.txt`（2826 个参数）
  - `DecoderOutput.txt`（Windows 解密结果）
  - `TypesOutput.txt`
- Windows 执行方式（已恢复）：
  ```bash
  /mnt/c/Windows/System32/cmd.exe /c 'cd /d C:\temp\BeyondDecoder && C:\Users\touyu\dotnet-sdk\dotnet.exe run --project BeyondDecoder.csproj -- --types TypesOutput.txt'
  ```
  SDK：`C:\Users\touyu\dotnet-sdk\dotnet.exe`

## 差分采集方法（可继续）

每次用户新增效果后：
1. 用 `gil-quick-diff.py` 对比 `LOCKED_BEFORE` 与当前 map，加 `--effect-list`
2. 快照保存到 `ticket01-effect-catalog/raw/`
3. 用户提供编辑器显示名 → 在 TextMapCHS/EN 查 hash
4. 更新 `blb3/effect_samples.json` 和 manifest 的 LOCKED_BEFORE/LOCKED_HASH

## 下一步候选

A. 继续差分采集（用户逐个加效果）
B. 深挖 `beyondRoleStatusService` / `beyondEffectService` 的 IL/运行时数据
C. 反射 dump BeyondEditor.dll 中全部 service/manager 类的方法
D. 官方/社区资料找现成效果表
E. 降级收口：以现有 samples 产出部分 JSON，另开全量票

## 陷阱

- 上下文压缩后不要重新搜索整个 `/mnt/e`；已有明确路径。
- Linux 不能直接加载 WPF；必须用 `cmd.exe` 调 Windows dotnet SDK。
- 当前主游戏 MiHoYoBinData 原始对象搜索已做，未找到目录表；不要重复全量搜索浪费时间。
