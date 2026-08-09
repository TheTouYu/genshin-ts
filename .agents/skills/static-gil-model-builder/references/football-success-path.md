# 足球棱柱壳：第一条完整成功路径

这份记录是 `static-gil-model-builder` 的真实生产样本，不是新的通用 GIL 规范。它用于快速复用流程、证据分层和故障判断；其中的地图 ID、辅助 ID、哈希和视觉补偿值都不能跨地图照抄。

## 结论摘要

- **结构生产链路已跑通**：校准 → 几何生成 → 正式 CLI 候选 → `inspect/export` 回读 → 用户授权 → hash-gated 写回 → 写后回读。
- **模型整体视觉基本满意**：空模型宿主 + 12 个五棱柱 + 120 个三棱柱的高精度足球可加载、可见，整体轮廓成立。
- **视觉几何尚未完全闭合**：用户反馈五边形区域仍有很小间隔。不能把当前的 `scale.x/z=0.3105` 称为精确五边形数据；它只是一次有效但仍有残差的视觉补偿。
- **下一轮只改一个变量**：使用精确五边形边界/局部顶点数据重新计算五边形面片，三角片保持不变，并继续三侧同步回读。

## 已验证资源事实

| 资源 | 结论 |
| ---: | --- |
| `10005018` | 空模型，可作为可见装饰物宿主 |
| `10009001` | `1×1×1` 长方体参照 |
| `10009004` | 高 1、正三角形边长 1；高度轴 Y，底面 XZ，零旋转顶点朝 `-Z` |
| `10009005` | 高 1、正五边形底面外接半径 1；高度轴 Y，底面 XZ，零旋转顶点朝 `-Z` |

校准截图：`$HOME/genshin-ts-evidence/static-assembly/football-prism-calibration-v1/game-validation/实体.png`，SHA-256 `de87e31e98bc1a3f1f8a10175af3eccc4df6aa918f401293b649d74035b7b4a7`。

截图支持朝向、相对尺寸和旋转结果，不支持从像素直接反推精确浮点尺寸。

## 几何基准与补偿值

截角二十面体半径取 `R=0.5` 时，当前 `prismPanels()` 的几何基准约为：

```text
五边形外接半径 r                 0.1716393065
五边形顶点到对边距离 h            0.3104984224
三角形共享边长 s                  0.2017741062
```

`10009005` 的 X/Z scale 语义是外接半径，不是五边形的顶点到对边距离。因此：

- `r` 是几何无缝基准的 scale 值；
- `h` 是由五边形几何推导出的面高；
- 把 `h` 直接写入 `scale.x/z` 是视觉补偿实验，不是资源尺寸规则；
- 任何补偿值都必须带实验编号、源 SHA 和游戏反馈，不能回填为普适常量。

本轮最终写回的经验参数：

```text
五边形 X/Z = 0.3105
五边形 Y   = 0.02
三角形 X/Z = 0.2380934507
三角形 Y   = 0.02
```

该参数在用户反馈中“整体还算满意”，但五边形区域仍有小缝，所以状态是 `visual-pass-with-known-gap`，不是 `geometry-closed`。

## 可复制生产顺序

### 1. 先做最小校准

用空模型放置长方体、三棱柱、五棱柱的零旋转、Y 旋转和 X 侧翻样本。先锁定尺寸、局部高度轴和 `-Z` 顶点方向，再生成完整模型。不要把颜色、物理或节点图混入校准板。

### 2. 用确定性几何生成结构

复用 `src/cli/static_assembly/football_geometry.ts` 的 `truncatedIcosahedron()`、`prismPanels()` 和 `basisToEuler()`：

```text
12 × 10009005 五棱柱 = 12 个正五边形
20 × 6 × 10009004 三棱柱 = 20 个正六边形
总装饰物 = 132
```

每个 item 使用局部面中心、面外法线和有语义的面内基；不要逐面手调欧拉角。

### 3. 正式 CLI 生成新元件

把 132 个 item 放入 `structureFile`，配置中保留地图绑定、模板、ID 和场景 Transform。执行：

```bash
node ./bin/gsts.mjs assets:static-assemblies plan \
  --asset-config <config.mjs> --map-id <mapId> \
  --output <evidence>/plan.json --format json

node ./bin/gsts.mjs assets:static-assemblies \
  --asset-config <config.mjs> --map-id <mapId> \
  --output <evidence>/candidate.gil --format json
```

继续条件：`plan.status=ready`、`errors=[]`、`conflicts=[]`、item 数量和资源分布正确，候选文件不覆盖旧文件。

### 4. 候选独立回读

至少检查：

- definition/instance 闭包为 `complete`；
- 两侧各有 132 条 aux，资源分布为 12/120；
- 位置、旋转、缩放和颜色 `export` round-trip 一致；
- root diff 只包含计划触及的 root；
- 场景实体没有被意外新增或修改，除非本轮明确要求。

### 5. 写回与游戏核验

针对锁定的候选取得明确写回授权。用户已经明确说“直接注入/写回”时，不要要求重复确认，但仍要在执行前简短列出地图、源 SHA、候选 SHA 和修改范围。

固定候选优先走：

```bash
node ./bin/gsts.mjs assets:entities apply-candidate \
  --map-id <mapId> --candidate <candidate.gil> \
  --expect-source-hash <sourceSha256>
```

写后验证目标 SHA=候选 SHA、自动备份 SHA=写前源 SHA，并通知用户重新加载地图后再保存。

## 既有复杂元件的局部调参

正式 `assets:static-assemblies` 主要是创建新闭包，不应拿一份新配置冒充“更新既有复杂元件”。已有元件只改视觉参数时，使用记录级局部 patch，并遵循以下顺序：

1. 用 `inspect` 找到目标 prefab definition/instance 的完整 closure；
2. 用 `export` 找到目标场景实体及其 aux 列表；
3. 从三份实际列表中按 `resourceId` 分类出目标记录，不按历史连续 ID 猜测；
4. 同步修改：definition-side、prefab-instance-side、scene-entity-side；
5. 每条记录只替换目标 Transform 的 scale，保留 position、rotation、Y 厚度、颜色和未知字段；
6. 生成不覆盖的候选，逐条回读，再走同一个 `apply-candidate` hash gate。

足球 v2 的真实补丁把 12 个五棱柱同步到三侧，共改 36 条记录；120 个三棱柱没有改动。这个三侧同步是必要的，否则元件定义、实例和已放置实体会出现不同步。

## 缺陷判断

看到缝隙时先分类，不要直接继续乘一个更大的系数：

- 所有面统一偏转：检查资源局部基或 YXZ 欧拉角；
- 只有五边形有缝：检查五边形目标边界、局部顶点顺序、pivot 和相邻三角片共享边；
- 所有相邻面都有缝：检查面中心、法线偏移和三角形拼法；
- 结构回读正确但游戏仍有缝：把它记为视觉层未闭合，开启下一轮单变量实验；
- 用户要求“精确五边形数据”时，转入增量 GIL/资源调查，先保存相邻快照和哈希，不要把视觉补偿值继续扩大后当作精确解。

## 证据分层

```text
几何数学通过       = 当前算法的自洽性
候选闭包通过       = GIL 结构可读、两侧 aux 完整
写回成功           = 目标/候选哈希与备份门通过
游戏可见            = 编辑器/游戏加载并显示
视觉完全通过       = 用户确认没有关键缺陷
几何规则已闭合     = 精确数据经独立实验和重放确认
```

本足球路径目前只到“写回成功 + 视觉基本满意 + 五边形小缝待修”，不能越级写成最后两项。

## 证据索引

- 地图：`1073741862` / `实体元件规则实验室`
- prefab：`1077936137` / `高精度足球v2`
- scene entity：`1077936138`
- 写回前源 SHA-256：`684fefc323c4be5a8421599640567949e9f4334e949ec2c6c0ddc1a2b807d891`
- 候选与写后地图 SHA-256：`b7bb85943a670098526ef39ea777cd124b71818de42a26903bd5ad2e6f370ce1`
- 三侧五边形 patch：definition `1073742238..1073742249`，prefab-instance `1073742370..1073742381`，scene `1073742502..1073742513`，共 36 条；三角片 360 条保持原值
- 校准：`football-prism-calibration-v1/`
- 首次完整结构候选：`football-prism-shell-v2/`
- 三侧补偿实验：`football-prism-shell-v2-gapfill/`
- 最新五边形直接补丁：`football-prism-shell-v2-pentagon-03105/`
- 最新写回备份：`$HOME/.../.gsts/backups/1073741862.gil.2026-08-08T17-59-02-444Z.bak`

以上 ID、路径和 SHA 只用于追溯，不作为下一张地图的默认值。
