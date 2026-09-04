# 变换探针：瀑布旋转+缩放 的 GIL / IPC 对照（2026-09-05）

## 操作

- 在编辑器修改「瀑布」的旋转和缩放，然后执行试玩。
- 地图：`1073741918.gil`

## 证据文件

- before：`.scratch/beyond-semantic-resources/evidence/2026-09-05-transform-probe/before/1073741918.gil`
  - SHA-256 `c8bb6593e8bd0743949466d5c4aedd7c94dff69df7710766529710d455ad2327`
- after：`.scratch/beyond-semantic-resources/evidence/2026-09-05-transform-probe/after/1073741918.gil`
  - SHA-256 `d74af537861b6059bf861c8008d22680eefb1fa07daec37c8b95d738d65dd4af`
- pcap：`/mnt/c/beyond-ipc/transform_probe.pcap`（10.7MB）

## GIL 差分结论（权威）

`gil-quick-diff.py` 显示变化 root：`5, 6, 10, 46`。

关键变化 = root5 场景实体记录 `f1=1077936130`（瀑布，官方源 10005103）：

```text
f6 transform 前:
  f1 - f2{} - f3{f1=1 f2=1 f3=1}（scale 1,1,1，无旋转）
f6 transform 后:
  f1 - f2{f2=f32(45.118)} - f3{f1=f32(9.24496) f2=f32(1) f3=f32(7.93269)}（旋转 + 非均匀缩放）
```

其他变化：

- root6：页签目录条目更新（瀑布条目从 400 类目变为其他，体积 -11B）
- root10：新增“复合节点”容器记录 18B（可能是试玩/保存产生的容器）
- root46：4 条 ID 登记变化（20B×2 增 / 20B×2 删）

## IPC 侧结论（type1017 不承载场景 transform）

- HAblp 类型：0/1016/1025/1017/1001/1022/1002/1014/1015
- type1017：6 帧，`1077936130 瀑布` 只出现**摘要定义**（summaryCount=3），**无 full field11**。
- 摘要里只有 `sourceEntityId=10005103`、`kindCode=1402`、名称，**没有旋转/缩放数值**。
- 小消息核查：
  - type1001 = 版本字符串 `7.0.0.47194594`
  - type1014 = `复合节点` 文本通知，非 transform
  - type1025 = 固定 8 字节疑似心跳
  - type1002/1015 = 空
- 结论：**旋转/缩放这类场景实体变换不进入 type1017 资产定义 IPC**；
  transform 的权威证据仍是 GIL 文件差分。IPC 更多用于资产目录/定义，不是地图实体变换同步。

## 对工作流的修正

- 后续若研究 transform/几何，直接走 GIL before/after 差分，不要指望 type1017 full field11。
- type1017 full field11 仍适合“官方资产结构/组件定义”的提取，但场景实体 transform 除外。
