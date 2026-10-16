# ys-editor — 千星编辑器（Wine）故障排查与解卡工具箱

> 沉淀自 2026-10-16「试玩归来再试玩」双病排查。复盘全文见
> `docs/bug-reports/retrospective-2026-10-16-editor-trial-relaunch.md`。
> **排查顺序铁律：先做「版本 + 运行配置」与上游 bug 库比对，再做白盒取证**（本轮为此多花约 3 小时）。

## 两个已定性的病（别再重新发明）

| 病 | 症状 | 根因 | 处置 |
|---|---|---|---|
| **真死** | 试玩归来再点试玩 → 「编辑器没有启动」 | 编辑器风暴式重连撞上 Linux TCP **自连接**（源端口==目标端口 → 内核直接判 ESTAB，双方空转） | `ys-selfconnect-vaccine`（把用过的端口并入 `ip_local_reserved_ports`）——已常驻 |
| **假死** | 沙箱窗/资源管理器/日志**全部点不动**，但渲染正常、可移动、可获焦 | kwin **6.7.5** 焦点回归（焦点窃取防护拒绝 Wine 窗口激活 → Wine 内部捕获 desync）；另有 Wine Bug 59965 同族 | 升级 kwin ≥6.7.6 / `FocusStealingPreventionLevel=0`（规避） |

## 工具

| 文件 | 用途 |
|---|---|
| `ys-selfconnect-vaccine` | 自环疫苗（show/once/daemon）。`ip_local_reserved_ports` 维护 + 日志 |
| `accept-meter.py` | **构建无关验收器**：试玩循环 PASS/FAIL。`PASS`=重连成功且 30s 内有 `level state changed`；`FAIL(zombie)`=连上后 30s 零推进（故障代签名）；`FAIL(storm)`=90s 没连上 |
| `ys-stuck-report` | 一键取证：进程/活动窗/指针窗/连接/自环/保留表/NLog 尾部 |
| `ys-unstick` / `ys-unstick2` | 两条解卡尝试（程序化激活+移动 / 最小化→恢复）——**本机实测均无效**，保留为反例；有效的是用户手动的 **Win+右键拖动** |
| `ys-editor-guard` | 风暴/断连判僵尸 → 杀编辑器双进程的自愈守护。**未启用**（用户否决「强杀+重启」治标路线） |
| `ys-orphans` / `ys-editor-rescue.sh` | 清 CEF 孤儿进程 / 窗口解卡（旧工具） |
| `ys-grabq.c` → `ys-grabq` | 查 X 指针/键盘抓取是否被占（`gcc -O2 -o ys-grabq ys-grabq.c -lX11`）；0=没人抓 |
| `ys-shape.c` → `ys-shape` | 查窗口的外形/可点区域（SHAPE 扩展，`-lX11 -lXext`） |
| `ys-selfconnect-vaccine.service` | 疫苗的 system 单元（enabled，开机自启） |
| （无文件）观测单元 | 均为 `systemd-run --user` 起的**瞬态**单元，无单元文件。重建示例：`systemd-run --user --unit=ys-accept --collect python3 <此目录>/accept-meter.py watch`；`ys-grabwatch`/`ys-sockwatch`/`ys-watch`/`ys-winwatch` 同法指向对应采样脚本 |

## 本机环境硬坑（踩过的）

- **`xwininfo` / `xwd` 没装** —— 用 `xdotool getwindowgeometry` + `xprop` + `import -window <id>` 代替。
- **`import -window root` 必失败**（整屏抓取用 `spectacle -b -n -f -o <file>` 或 `grim`）。
- **XTEST 指针注入在 Xwayland 下无效**（指针纹丝不动）；键盘注入未验证送达 ⇒ 输入类实验只能由用户真人做。
- **`/proc/<pid>/fd` 的 mtime ≠ socket 存活证据**（本轮据此下过错误结论，被抓包推翻）——用包/事件行为读数。
- **取证脚本必须自证拿到读数**：工具存在 + 退出码 + 产物非空；吞 stderr = 盲脚本（本轮因此跑出三次空实验）。
