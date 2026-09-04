# 01 — 定位并解析状态效果语义目录源

**What to build:** 找到「状态效果名目录」的真正来源，并打通 **效果配置 ID（1720001/2110001/2010001）→ TextMap hash → 中英文名** 的机器可读映射。
背景：GIL 只存效果 ID；编辑器本地 `Resource/Json/TextMap/CHS` 已确认为节点/枚举名（7743 条），**不含**状态效果名；
`assets.bin` 内层加密；主游戏数据在 blk。目标 = 不再靠用户口述逐个采集效果名，改为从文件一次性解析。

**候选路线（按成本，开工先做 A）：**
- A. 反编译 `BeyondEditor.dll`（混淆 .NET）→ 找效果目录加载器 / zip 密码 / 内嵌表；
- B. 运行时抓取：打开效果下拉时抓编辑器↔游戏 IPC 或进程内存明文目录；
- C. 主游戏数据：`YuanShen_Data/StreamingAssets/*.blk`（可结合社区工具 paimooon-YSRes / Ayaya_Miliastra_Editor）。

**Blocked by:** None — can start immediately。

**Status:** ⏳ open

**验收 checkbox：**
- [ ] 定位效果名目录来源（A/B/C 任一成功即算；记录证据路径）
- [ ] 建立 `effectID → TextMap hash → 中文名/英文名` 映射，至少覆盖已知三样本：
  1720001=移动速率调整率（动态）、2110001=定时触发技能、2010001=造物不可见
- [ ] 机器可读产物落盘（如 `resources/status_effect_names.json`），与编辑器/游戏显示对照 3/3 通过
- [ ] 回填 `docs/game-engine-knowledge/beyond-editor-semantics.md`（闭合 OPEN 项）
- [ ] 收轮三件套（勾票 + BOARD 前沿/划掉 + 精确 commit）

## 轮次记录（执行中追加）

- （票 00 知识落盘 2026-09-04：.mihoyobin 格式破解 + CHS TextMap 无效果名实证 + assets.bin 加密 + 三候选路线，
  详见 beyond-editor-semantics.md 与会话记录；差分实验快照 v21 保持不变，本票不碰 GIL）
