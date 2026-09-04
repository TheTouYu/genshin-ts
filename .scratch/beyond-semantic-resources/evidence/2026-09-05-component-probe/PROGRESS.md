# 元件+组件探针：自定义元件（长方体）创建/组件编辑 的 GIL/IPC 对照（2026-09-05）

## 操作

- 在编辑器基于官方基础元件创建/编辑一个自定义元件，并涉及组件槽。
- 地图：`1073741918.gil`

## 证据文件

- before：`.scratch/beyond-semantic-resources/evidence/2026-09-05-component-probe/before/1073741918.gil`
  - SHA-256 `d74af537861b6059bf861c8008d22680eefb1fa07daec37c8b95d738d65dd4af`
- after：`.scratch/beyond-semantic-resources/evidence/2026-09-05-component-probe/after/1073741918.gil`
  - SHA-256 `cb8fc7fc8eeecf9b8d9a51cbb626756e55e2e8e09370d06d9a27b2ef108d9933`
- pcap：`/mnt/c/beyond-ipc/component_probe.pcap`（1.16MB）
- IPC 产物：`ipc/component_probe.generic.json` / `ipc/component_probe.hablp-summary.json`

## GIL 差分

- root4：3→4，新增自定义元件定义：
  - `f1=1077936129`
  - `f2=10009001`（官方长方体）
  - 记录 1239B，含 f6/f7 组件槽
- root8：0→1，新增实例：
  - `f1=1077936147`
  - `f2={f1=1077936129}`（引用新定义）
- root6：新增页签条目 `100 -> 1077936129`，并更新“未分类页签”
- root46：ID 登记变化

GIL 大小：`97245B → 99781B`（Δ+2536B）。

## IPC 差分（type1017 全定义）

- HAblp 类型：`0 / 1016 / 1017 / 1011`
- type1017：35 帧，available IDs 2564，definitions 12
- **关键：捕获到完整 field11**
  - assetId `1077936129`
  - sourceEntityId `10009001`（长方体）
  - 2 个 30708B 的全定义帧（`frame_032/frame_033`）
- 实例 `1077936147` 为摘要定义（summaryCount=31，kindCode=1402）

### 完整 field11 结构（1077936129）

```text
entry0：
  field1 = assetId 1077936129
  field2 = sourceEntityId 10009001
  field6 = 8 条（type: 1,13,14,38,40,111,61,62）
  field7 = 15 条（type: 1..8,11,12,16,17,19,20,22）
  field8 = 26 条（type: 18,1,3,19,6,14,4,17,5,15,16,8,21,23,29,
                   27,28,33,37,35,39,32,38,41,13,45）
entry1：
  assetId + kind/组件描述 msg
entry2：
  assetId + 资源路径片段（"ART/UI/" 等）+ kindCode=1402
```

## 结论

1. **元件/组件编辑会触发完整 type1017 field11**：这次终于抓到完整定义。
2. IPC field11 自带：
   - assetId
   - sourceEntityId（官方基础元件 ID）
   - kindCode（1402 = Gadget）
   - 组件/节点/能力槽序列化（field6/7/8）
3. 这比“场景实体的旋转/缩放”实验更有价值：**type1017 完整定义适合研究元件/组件结构**。
4. 仍需下一步：逐槽对照 IPC field6/7/8 与 GIL root4/root8 的 f5/f6/f7，
   确认两者是否同一套组件序列化并闭合 componentTypeId 含义。
