# 完整复盘：票01 静态数据/IL2CPP/.NET 深挖轮（2026-09-04）

> 范围：`.scratch/beyond-semantic-resources` 票 01（effectID→TextMapHash）在 Blb/MiHoYoBinData、
> IL2CPP、BeyondEditor .NET 三条路线上的探索轮。
> 视角：探索型逆向，尚未闭合映射表；本复盘记录“哪些路被证伪、哪些证据被修正、下次怎么少走弯路”。
> 证据：提交 `f7c5388`、`82c5dbb`；文档 `.scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/blb3/PROGRESS.md`；
> 权威 `docs/game-engine-knowledge/beyond-editor-semantics.md`；临时工具日志在
> `work/ticket01-effect-catalog-dotnet/notes/`（未提交，仅复查用）。
> 状态：历史记录/待验证；票 01 仍 OPEN。

## 一、本轮探索结论谱系

| # | 路线/动作 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 检查 `/tmp/mhybins_255/*.bin` | 发现这些文件是误用 `--xor 0x95` 导出的；CN7.0.0 原始 MiHoYoBinData 不需要 XOR | `PROGRESS.md` 更正条目；提交 `f7c5388` |
| 2 | 直接读 SerializedFile class 1208 原始字节 | pathID=1059/1735 含真实 effectID varint；但整体仍是二进制行表/未知编码 | `PROGRESS.md` |
| 3 | Il2CppDumper 静态还原 | 被加密 metadata（`MHY\0`）挡住，报 `Metadata file not found or encrypted` | 本轮笔记 |
| 4 | 社区 MetadataConverter（XylioG / Zjhyang12335） | 旧工具不兼容 7.0.0，报 `file trimmed or string literal offset/count field invalid` | 本轮笔记 |
| 5 | BeyondEditor .NET 反编译 + Windows 反射 | 追到 RoleStatus 加载三元组：Official=`(10003,50004,51000)`、Custom=`(10003,50004,51001)` | `PROGRESS.md` 新增条目；`82c5dbb` |
| 6 | IPC type1022 目录中搜三元组 | type1022 有 10003/51000/51001 等数字 ID + 中文标签，但无 1720001 等 effectID/TextMapHash | `ipc/PROGRESS-IPC.md` |

## 二、关键调查链

1. 先读取历史文件发现 `/tmp/mhybins_255` 内容与 PROGRESS 说法矛盾（文件头不是“原始”）。
2. 用 `parse_serialized` 直接对比 SerializedFile 原始对象，确认现存 mhybins 是 XOR0x95 产物。
3. 把脚本默认改为 `--xor 0`，并落盘更正。
4. 因用户选择 IL2CPP 路线，下载 Il2CppDumper 与 MetadataConverter，均因加密/版本不兼容失败。
5. 回到 .NET：用 dnlib 扫描 delegate 静态字段，再用 Windows 反射读取 delegate Target 方法名，
   最终把 `CustomRoleStatus/OfficialRoleStatus` 解开成资源分类三元组。

## 三、系统性根因（可复用规律）

1. **先核对“历史产物是否就是它声称的状态”再基于它搜索。**
   `/tmp/mhybins_255` 名义上是“原始 MiHoYoBinData”，实际是 XOR0x95 产物；
   若直接拿它搜 TextMapHash 会得到错误阴性。
2. **社区工具先验证版本/加密兼容性，再投入大文件运行。**
   MetadataConverter 多为 2022 年前工具，对 7.0.0 的 MHY metadata 直接抛异常；
   投入前应先看 README/提交日期/目标版本。
3. **本地编辑器代码能证明“映射不在这里”，但证明不了“映射在哪里”。**
   BeyondEditor 的 RoleStatus 加载链最终只到资源分类三元组，说明它不拥有
   effectID→TextMapHash；下一步应优先把三元组作为游戏侧 IPC/静态数据的检索锚点。

## 四、流程与方法论教训

- **用户纠正钩子**：用户本轮主要通过方向选择引导（先 IL2CPP、再社区 metadata、再 .NET、最后复盘），
  未出现“应该怎么查/怎么做”的方法纠偏；但“先保存进度、执行复盘和资源复用”提示了探索型任务也应按
  小结论及时落盘，而不是连续多轮不提交。
- **有效方法**：
  - 用 dnlib 直接扫 IL 字段/方法，比在 C# 反编译里肉眼找快；
  - 对混淆 delegate，用 Windows 反射读取 `Delegate.Method` 是最短路径；
  - 对“文件声称状态”的怀疑，直接回读源 SerializedFile 对比，是铁证。
- **绕路点**：
  - 在 IL2CPP 加密 metadata 上花费较多时间后才回到 .NET；若先确认 `MHY\0` 头与社区工具年代，
    可更快判断该路需运行时内存 dump。

## 五、风险探索与未闭合项

- effectID→TextMapHash 映射仍未定位。
- 游戏侧可能位置：
  - 主程序 IL2CPP（需解密 metadata 或运行时 dump）；
  - 游戏 Blb/MiHoYoBinData 内某张行表（需 schema/表名）；
  - IPC 特定 service 消息（可尝试用三元组触发/检索）。
- 未验证：`(10003,50004,51000/51001)` 三元组在游戏侧对应的资源名/文件路径。

## 六、产出清单

- 提交 `f7c5388`：修正 `extract_mihoyo_bin.py` 默认 no-XOR + PROGRESS 更正。
- 提交 `82c5dbb`：PROGRESS 记录 .NET 三元组发现。
- 更新 `docs/game-engine-knowledge/beyond-editor-semantics.md`：新增静态数据/IL2CPP/.NET 深挖结论。
- 更新 `.scratch/beyond-semantic-resources/issues/01-locate-effect-catalog.md`：追加本轮轮次记录。
- 本轮临时工具/日志：`work/ticket01-effect-catalog-dotnet/notes/`（未提交，供复查）。
