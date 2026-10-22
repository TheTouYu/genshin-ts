# .04 — 原神「资料 / 语音」条目采集（旅行者 · 透雨）

198 条语音条目，按游戏列表顺序，逐条采集正文并对齐到结构化文档。

- 数据：`data/voices.json`（机器可读，含行级 bbox 与段落）
- 阅读：`voices/ALL.md`（全部条目一页读完）、`voices/NNN-<标题>.md`（每条一页）
- 证据：`frames/*.jpg`（每条一张 860×1180 裁块，含标题 + 整段正文，51MB，未入 git）
- 校验：`data/verify.json`（顺序/重复/覆盖）、`data/stats.json`、`data/xcheck-2x.json`（2× 复 OCR 一致率）

## 方法（以及为什么这么做）

| 环节 | 做法 | 实测数字 |
|---|---|---|
| 进入页面 | 世界态按 **C** 直接回到「资料/语音」（游戏记住上次页签） | — |
| 逐条导航 | 列表左侧游戏**自带 W/S 键提示** ⇒ 按 S 逐条下移选中项（**不用鼠标**） | 按键 <30ms |
| 抓帧 | `ys-capture latest --format bmp`（daemon 预编码，XShm 直读窗口） | 14ms / 帧（11MB） |
| 等待 | 按 S 后**必须等 ~2.2s**：标题/正文区域在 +0.24s 变一次（旧字淡出）、**+2.06s 才落定** | 2.2s/条 |
| 读标题 | `ys-text` 只读标题条 780×75 | 0.33s |
| 落盘 | 只存 860×1180 裁块（jpg q92） | ~160KB/条 |
| 节奏 | p3 82 条/240s（2.93s/条）、p4 92 条/241s（2.62s/条）、p5 26 条/79s | 合计**占屏约 9.3 分钟** |

**为什么不用"逐个点击条目"**：本机游戏里指针有 ~2.7× 加速（送 +400,+200 实测位移 +1105,+552），
且游戏抓走指针时 `xdotool getmouselocation` 回读不可信（一次 `move(300,503)` 前后回读都是 (900,1438)）
⇒ 坐标闭环不可靠；键盘导航既快又准。

## 验证（三层，分开说）

**1. 结构层（已验，机检）**
- 起点 = `关于风车…`：从任意位置连按 W 100+ 次后标题不再变化 ⇒ 确为列表首条；
- 终点 = `关于至冬的妖精·`：连按 3 次 S 无变化 ⇒ 列表到底；
- **端到端对账**：采集结束时界面的可见末 10 行（`关于列车的动静…` … `关于至冬的妖精`）
  与本文档序列末 10 条**逐条一致**；起点 10 条与首屏列表 OCR 亦逐条一致；
- 三趟各自序列**零重复**；跨趟仅 2 处边界重叠（每趟会记录自己的起点）；
- 对照趟 p1（有 13 次跳条，脚本 `collect04c.py` 保留）其 82 条标题**全部**被本序列覆盖
  （唯一例外是 p1 自身的 OCR 乱码「关于」）。

**2. 文字层（已抽样，非全量）**
- 视觉抽查 `p3-0003`（关于果酒湖…）：逐字一致，唯一差异是「透雨：」被识别成半角冒号；
- **2× 复 OCR 抽样 40 条**：行级一致率 **97.2%**、字符多重集吻合 **99.7%**（`data/xcheck-2x.json`）。
  注意这是**同引擎不同分辨率**的代理通道，不是独立引擎。

**3. 用户层（未验，需要你在游戏里扫一眼）**
- 建议核对含破折号的行：RapidOCR 有吞/并破折号（`——` → `一`/丢失）的已知缺陷。

## 已知偏差（都有实测依据）

1. **标题按游戏显示原样保留**——游戏自身截断，末尾是 `…` / `·` / `⋯`，不是采集丢失；
2. 行宽换行会把一句话拆成两行：行级原文照录，段落按**说话人前缀**（`派蒙：` / `透雨：`）合并；
3. 冒号半角/全角混用（`透雨：` → `透雨:`）；
4. 个别汉字仍可能错（2× 对照里见到 `乌聘/身鹃`、`无锋剑/天锋剑` 这类单字混淆）；
5. `data/stats.json` 里 8 条标了 `edge-截断嫌疑`：核实为 OCR 框左缘外扩 3px 的**误报**
   （视觉核对 p3-0003 无截断）。

## 复现命令

```bash
cd /home/h/genshin-ts && . tools/ys-editor/ys-env.sh
WIN=$(tools/ys-editor/ys-win-id)                       # 不要写死窗口 id
YS_ALLOW_DESKTOP_SWITCH=1 tools/ys-editor/ys-follow-win yuanshen.exe   # 原神在别的虚拟桌面时必须（需用户批准）
tools/ys-editor/ys-screen-grant grant --task voice04 --eta 290 --reason '语音条目采集' --user-said '<用户原话>'
tools/ys-editor/ys-gui-slot "$WIN" 260 bash -c '. tools/ys-editor/ys-env.sh; python3 gui-test/.04/collect04d.py top p3 200 240'
tools/ys-editor/ys-gui-slot "$WIN" 260 bash -c '. tools/ys-editor/ys-env.sh; python3 gui-test/.04/collect04d.py cont p4 200 240'
python3 gui-test/.04/verify.py p3 p4 p5 top      # 顺序/重复/覆盖对账
python3 gui-test/.04/assemble.py p3 p4 p5        # 裁块 → 行/段落 → data/ + voices/
python3 gui-test/.04/rebuild.py                  # 按说话人前缀重建段落（秒级，不重跑 OCR）
python3 /tmp/xcheck2.py                          # 2× 复 OCR 一致率（可选）
```

脚本分工：`collect04c.py`（v3：自适应等待——**有跳条缺陷**，保留作对照）、
`collect04d.py`（v4：固定 2.2s + 读早复核，本批实际使用）、`assemble.py`、`rebuild.py`、`verify.py`、
`collect04.py`/`collect04b.py`（更早的点击/像素差版本，保留作教训）。

## 悬而未决

- 云端 VL 三通道裁定未做（成本 ~20-60s/条）；当前用 2× 复 OCR 作替代读数；
- `关于` 类乱码标题只在对照趟 p1 出现过，正式序列里已由后两趟补全（`suspicious_titles: 0`）。
