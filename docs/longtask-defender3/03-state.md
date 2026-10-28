# 共享现状：机器、工具链、原作资产（L1 · 每轮收尾必改）

> 状态：当前实现（读数以本文件为准；过期读数比没有更危险）
> 来源：2026-10-27/28 只读实测（命令与输出见各条）
> 最近校验：2026-10-28

> 读法：§一 找本线读数归属 → §二 工具链 → §三 原作资产 → §四 我方千星能力边界。

---

## 一、分线读数的归属

| 线 id | 断点与现状读数在哪 | 本文件里属于它的分节 |
|---|---|---|
| `defender3` | [`dossiers/defender3.md`](dossiers/defender3.md) §三/§五 | §二、§三、§四全部 |

## 二、工具链（本机，2026-10-27 实测）

| 工具 | 版本/位置 | 用途 | 校验命令 |
|---|---|---|---|
| REA（逆向框架） | `~/tools/rea` v6.8.0，启动器 `~/.local/bin/rea` | 统一逆向入口（`rea --help`） | `rea --version` |
| Node（REA 用） | **24.22.1** `~/tools/runtime/node-v24.22.1-linux-x64` | REA 必须 24（26 会崩） | `~/.local/bin/rea --version` |
| JRE | Temurin **21.0.12.1** `~/.local/jvm` | jadx/apktool 运行 | `~/.local/jvm/bin/java -version` |
| jadx | **1.5.6** `~/tools/jadx`，包装器 `~/.local/bin/jadx` | dex 反编译 | `jadx --version` |
| apktool | **3.0.3** `~/tools/apktool_3.0.3.jar`，包装器 `~/.local/bin/apktool` | 资源解包/回打包 | `apktool --version` |
| jadx-headless-mcp | **0.7.1** `~/.local/share/rea/android/jadx-headless-mcp-0.7.1-all.jar` | REA 的 Android provider（sha256 `6e5eacf5…` 已校验） | `sha256sum` |
| Ghidra | **未安装**（`rea doctor` 报 `GHIDRA_INSTALL_DIR` 缺） | 原生 .so 反编译 | `rea doctor` |
| 手机 | HONOR FNE-AN00（`AVKY022518006799`），Android 14，arm64-v8a | 无线 adb `192.168.5.139:38707`（重启后需重新配对） | `adb devices` |

> 注：USB 直连在本机反复重新枚举（006→011→013），**无线 adb 是稳定通道**（2026-10-27 实测）。

## 三、原作资产（`~/re-targets/defender3/`，2026-10-27 实测）

| 项 | 读数 |
|---|---|
| APK | `apk/defender3-2.7.1-base.apk`，55,005,460 B，sha256 `a958332c3bbaea9b…` |
| 版本 | `com.droidhen.defender3` 2.7.1 / versionCode 146 / arm64-v8a / 单 base.apk 无 split |
| 引擎 | **Cocos2d-x C++**（`lib/arm64-v8a/libcocos2dcpp.so` 20,613,280 B，符号未剥离，39,675 个动态符号） |
| 数值表 | `out/tables/`：**67 表 / 5802 行**，`_index.tsv` 可直接看表清单 |
| 中文文案 | `out/tables/*.tsv` 已 join `data_ch.json`（monster 表尾列 `name` 即中文名） |
| 美术 | `out/images/` 1160 张干净 PNG（其中 141 张是 zcim 包装已剥） |
| 图集 | `out/atlas/` 65 个图集拆出 **1010 帧** |
| 动画 | `out/animations/` DragonBones 2.2 骨架 XML + 贴图 **82 文件** |
| 音效 | `out/sounds/` 58 个 mp3 |

**生成脚本**（幂等，可重跑）：
```bash
python3 ~/re-targets/defender3/tools/extract_assets.py   # 表 + 图 + 图集 + 动画 + 音效
python3 ~/re-targets/defender3/tools/data_digest.py      # 表结构摘要
```

## 四、我方千星能力边界（判断"能不能做"用）

| 能力 | 结论 | 出处/判据 |
|---|---|---|
| 3D 场景 + 实体/模型/写回 | ✅ 成熟 | 足球/花间茶会等地图已落地 |
| 纯 2D（UI 层 + Lua） | ✅ 成熟 | tetris v2 42 用例全绿 |
| 服务端节点图 | ✅ 但 **单图 ≤2000 节点**、单 tick <3000 帧 | 项目硬限制 |
| 客户端 Lua | ✅ 键事件 / 2D UI / 信号 | tetris、花间茶会 |
| 射线检测（瞄准） | ⚠️ 服务端有射线节点；**客户端准星→射线**待验证 | `05-open.md` O-2026-10-28-2 |
| 实时 PvP | ❌ | 千星无此能力 |
| 内购 | ❌ | 改游戏内货币 |
| 自动对局回归 | ✅ 模拟器 runCase | tetris 用例体系 |

## 五、门禁与体检

| 套件 | 读数 | 时间 |
|---|---|---|
| `longtask_check.py --dir docs/longtask-defender3` | 见本轮收尾输出 | 2026-10-28 |
| `longtask_check.py --selftest` | 见本轮收尾输出 | 2026-10-28 |
