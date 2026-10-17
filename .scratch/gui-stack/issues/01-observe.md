# 票 01 — ys-observe 观测层

> 状态：⬜ 未开工 ｜ Blocked by：— ｜ 设计依据：[`../DESIGN.md`](../DESIGN.md) §三 L0

## What to build（用户视角端到端）

一条命令就能拿到"**可信**的屏幕读数"：可信=自带新鲜度证明（这次真的看到了新东西，不是缓存）。
今天所有"没变化 ⇒ 没生效"的错误推断都源于这里没有证明。

```
$ ys-observe px 300 300
{"kind":"px","probe":"300,300","value":"70,94,62","fresh":true,
 "frame":{"id":"f-0007","diffFromPrev":3849,"window":"0x01400001","atop":true},
 "source":"peek","at":"2026-10-17T08:12:03Z"}
```

## 验收项

- [ ] `ys-observe px X Y` 输出上述结构（JSON，可被 `jq` 解析）
- [ ] **陈旧帧场景**（窗口被别的应用盖住 / 画面确实静止）→ 输出 `fresh:false`、`error:STALE`，**退出码非 0**，
      且**绝不返回上一帧的值**（这是本票的核心：宁可报错不给假数据）
- [ ] `frame.diffFromPrev` 是**与上一帧的实际像素差**，不是自报常数
- [ ] `frame.atop` 来自 KWin 堆叠序（M1），不是猜的
- [ ] 连续两次调用，`frame.id` 递增；`--reuse` 显式复用上一帧时必须写明 `reused:true`
- [ ] 模板路径一律绝对化（今天的 cwd 陷阱）
- [ ] 端点测试：不存在的窗口 id → 明确报错并退 3

## 收轮三件套

- [ ] 勾票 + 看板移入划掉区 + 前沿指向下一票
- [ ] 看板 §⑤ 递归判据表更新一行
- [ ] 精确 git commit
