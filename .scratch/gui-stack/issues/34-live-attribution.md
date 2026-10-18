# 票 34 — live 取帧的窗口身份未验证（fail-open）

> 状态：⬜ 未开工 ｜ Blocked by：— ｜ 发现：2026-10-18 19:42（Lead 实测）
> 证据：`.scratch/gui-service/evidence/live-atop.png`

## 现象（可复现）

原神窗口声称在栈顶时执行 `ys-observe frame`，读数返回：

```json
{"kind":"frame","window":"0x01400001","atop":true,"source":"spectacle-fullscreen","fresh":true,"diffFromPrev":506272}
```

但抓到的画面**是 DSH Web GUI 的浏览器**（帧内可见 127.0.0.1:3080 页面与 19:42 时钟），
不是原神。`worldsvc look --live` 因此把浏览器当游戏分析，输出 `state=UNKNOWN`（大量像素读数 = 255,255,255）。

## 影响

- **任何 live 读数都可能来自错误的窗口**，而工具仍报 `atop:true` + 正确 window id ⇒ 静默失能（fail-open）。
- 本轮"live 路径可用"的结论因此不成立：live 取数在修好前**不可用于判据**。
- 与「0 像素差分 = 陈旧帧」同族：这次是"新帧、错对象"。

## 根因假设（待证）

1. `spectacle -f` 抓的是**当前虚拟桌面全屏**；原神可能在**另一个虚拟桌面**或被浏览器完全覆盖。
2. `ys-atop` 判"栈顶的最大窗口"用的是 KWin 的 stacking order，可能包含**非当前桌面/最小化**的窗口。
3. 全屏抓图后按目标窗口几何裁剪 ⇒ 裁剪区恰好落在别的窗口上，而代码没有做"窗口可见性/所属桌面"校验。

## 验收项

- [ ] 取帧前校验：目标窗口属于**当前桌面**且**未被完全遮挡**（KWin 脚本查 desktop + minimized + stacking）
- [ ] 校验失败 → 退出码明示 `OCCLUDED` / `OTHER_DESKTOP`，**不返回像素**
- [ ] live 读数带 `attribution: {window_id, desktop, atop_verified_by}` 字段
- [ ] 复现用例入库：浏览器全屏 + 原神在其他桌面 → 必须拒绝
- [ ] 回读：同一次会话里 live 帧与直接窗口抓图一致（像素差分 ≤ 阈值）

## 收轮三件套

- [ ] 勾票 + 看板移入划掉区 + 前沿指向下一票
- [ ] 看板 §⑤ 递归判据表更新一行
- [ ] 精确 git commit
