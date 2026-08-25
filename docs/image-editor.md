# 图片编辑器能力（image-editor）

> 状态：核心能力已落地（自动回归通过；真实游戏核验待用户）
> 来源：Miliastra-image-editor-webui（https://github.com/1475505/Miliastra-image-editor-webui）格式逆向 + 字节级对照
> 适用范围：gsts 库 API 与 `gsts image:*` CLI

## 目标

让 genshin-ts 具备**游戏图像编辑器（图片/UI 素材）的生产能力**：

- 统一场景模型 `SceneDocument`（画布 + 基础形状图元 + 图库）
- 多格式导入：CSS（Primitive Shaper 风格）/ JSON / SVG
- 多格式导出：JSON / CSS / SVG / **GIA image 模式**（kind=8, class=15，游戏 UI image 节点）
- 纯 TypeScript，无 Python 依赖；CLI 与库 API 双入口

这补上了主项目能力边界表里缺失的一环（"arbitrary color encoding is not exposed" 的图像侧）。

## 概念模型

```
SceneDocument
├── canvas { width, height, background }
├── elements[]            # 图元：x/y 为中心点，rotation CCW 正，zIndex 分层
│     type: ellipse | rectangle | triangle | four_point_star | five_point_star | ring
│     color / opacity / isBackground（满画布背景矩形）
├── meta { sourceType, sourceName, warnings }
└── library { categories, baseShapePresets, savedItems }
```

游戏素材引用（`image_asset_ref`）：

| 形状 | 素材 ID |
| --- | --- |
| rectangle | 100001 |
| ellipse | 100002 |
| triangle | 100003 |
| four_point_star | 100004 |
| five_point_star | 100005 |
| ring | 100006 |

## 模块结构

```
src/image-editor/
├── types.ts        # 场景模型类型
├── constants.ts    # 形状/素材/默认值/图库
├── color.ts        # 颜色规范化、ARGB 打包
├── geometry.ts     # 边界盒、三角/星形/椭圆顶点
├── normalize.ts    # 场景规范化、画布自动拟合、图库规范化
├── importers.ts    # parseJsonScene / parseCssScene / parseSvgScene
├── exporters.ts    # sceneToJson / sceneToCss / sceneToSvg / sceneToGiaDocument
├── index.ts        # 公共 API（含 convertSceneToImageGia 一键导出）
└── gia/
    ├── wire.ts         # protobuf wire 读写（image 模式专用）
    ├── image_mode.ts   # GIA image 模式转换（json_to_gia.py 移植）
    └── template.ts     # 模板定位/加载
```

第三方数据：`src/thirdparty/miliastra-image-editor/template/image_template.gia`
（来自上游仓库的 image 模式导出模板，经 `src/compiler/gia_vendor.ts` 出口访问，
postbuild 复制到 dist）。

## 用法

### 库 API

```ts
import {
  parseCssScene,
  sceneToGiaDocument,
  convertSceneToImageGia
} from 'genshin-ts'

const scene = parseCssScene(cssText)                 // CSS → SceneDocument
const giaBytes = convertSceneToImageGia(scene, {     // SceneDocument → image GIA
  groupName: '20260821'
})
```

### CLI

```bash
# CSS → SceneDocument JSON
gsts image:import scene.css --source-type css --output scene.json

# SceneDocument JSON → GIA（image 模式，游戏图片素材）
gsts image:export scene.json --format gia --output out.gia --group-name 素材组

# SceneDocument JSON → SVG / CSS / JSON
gsts image:export scene.json --format svg

# 启动本地 Web 编辑器（预览 + 编辑 + 资产库 + 导出 GIA + 注入游戏）
gsts image:serve --port 8511 --assets-dir <资产库目录>
# 资产库目录缺省为 <cwd>/assets/images，服务自动创建
```

GIA 产物可直接放入 `Beyond_Local_Export/`（与 `环型箭头.gia` 同族资产）。

### Web 资产库（AI 生成 → 网页自动预览 → 人工审美 → 注入）

`image:serve` 会把 `--assets-dir` 目录作为**资产库**自动扫描：

- 支持 `*.css / *.svg / *.json`，服务解析为 SceneDocument 并生成 SVG 预览；
- 网页每 2s 轮询 `GET /api/assets`，文件变化（mtime/size）时**列表自动刷新**，
  无需手动刷新页面；AI 把新 CSS 写入目录，用户打开网页即可看到；
- 每个资产卡片提供「载入 / 存回 / 删除」：
  - 载入：把资产载入画布继续微调；
  - 存回：用当前画布覆盖该资产文件（CSS 源写回 CSS；SVG 源升级为 JSON 保旋转/圆环）；
  - 删除：移除该资产文件；
- 画布自动跟随：画布内容来自某资产且未被手动修改时，该资产被外部更新会**自动载入新版**；
  已手动修改则提示「有新版本，点载入查看」，不打断编辑。

实现：`src/image-editor/server.ts`（`GET /api/assets`、`POST /api/assets/save`、
`DELETE /api/assets?name=`，防路径穿越：name 只取 basename）、
`src/cli/image_editor.ts`（`--assets-dir`）、`src/image-editor/web/index.html`（资产库面板）。

### 改 Web UI 后必须同步 dist（2026-08-22 实证）

`image:serve` 的 `serveIndex` 读的是 **`dist/src/image-editor/web/index.html`**（`__dirname`
指向 dist），不是 `src/` 下的源文件。改 `src/image-editor/web/index.html` 后：

- 只需 `cp src/image-editor/web/index.html dist/src/image-editor/web/index.html`
  （纯静态 HTML，无编译），或跑 `npm run build`（postbuild 会自动复制）；
- 改完先 `stat -c '%y'` 对比 src/dist 时间戳确认已同步，再刷新页面验证；
- 否则会出现"改了代码但页面无变化"的假象（本轮 UI 美化踩过）。

### 用 browser-harness 验证网页（截图函数名）

用 browser-harness 打开 `image:serve` 页面做视觉验证时，截图函数是
**`capture_screenshot(path=...)`**，不是 `screenshot`（后者会报 `NameError: name 'screenshot'
is not defined`）。布局尺寸用 `js(...)` 提取 `offsetWidth/offsetHeight/scrollHeight` 判断
"是否拥挤/溢出"，比截图更可量化（本轮 UI 美化用 DOM 尺寸诊断出"资产列表 171px 塞 1165px 内容"）。

### 批量导入与命名规范

资产库资产导出 GIA 时，**文件名用资产文件 stem**（`guide-tap.css` → `guide-tap.gia`），
组名也用 stem（`guide-tap`），避免多个资产导入时都叫 `image.gia` 互相覆盖。

**API**：`POST /api/assets/inject-batch { names: string[] }`

- 接收资产文件名列表（如 `["guide-tap.css", "guide-arrow-right.css"]`）；
- 逐个解析、转 GIA，写入 `Beyond_Local_Export`；
- 返回每个资产的结果：`{ name, groupName, fileName, path, resources: [{guid, name}] }`；
- `resources[i].guid` 是游戏内该图片素材的资源 ID，AI 写节点图交互逻辑时直接引用。

**网页操作**：
1. 资产卡片前勾选多个资产；
2. 点「📦 批量导入」按钮 → 确认弹窗 → 一次性写入所有 GIA；
3. 成功弹窗显示每个 GIA 的文件名和资源 ID 清单。

### 已导入资产扫描（AI 获取资源 ID/名字）

AI 写节点图交互逻辑时需要知道游戏里已导入的图片素材资源 ID。
`GET /api/assets/imported` 扫描 `Beyond_Local_Export` 目录下所有 `.gia` 文件，
解析每个文件的素材组名和资源条目（`{guid, name}`），返回完整清单。

网页左侧底部「🔍 已导入」按钮调用此 API，展示每个 GIA 文件的文件名、组名、资源 ID 列表。

**AI 使用场景**：批量导入后，API 返回的 resources 已含 guid；后续随时可重新扫描，
获取当前游戏地图里所有已添加的图片资源 ID 以编写节点图交互逻辑。

### 写入地图（素材库注入，2026-08-22 新增）

把资产**直接写进地图 .gil 素材库**（root9 素材段），区别于「批量导入」写 `Beyond_Local_Export`：

| 路径 | 目标 | 游戏内如何生效 | 引用方式 |
| --- | --- | --- | --- |
| 写入地图（本功能） | 地图 `.gil` 素材库（root9 素材段） | 重载地图即可见 | 容器 ID = **素材索引 ID**（0x40000000+ 段），可被游戏 API / 节点图直接引用 |
| 批量导入 | `Beyond_Local_Export/*.gia` | 资产导入导出工具 → 加载外部资产 | GIA 资源 guid（class=15, kind=8） |

**API**：

- `GET /api/maps`：扫描本机 `Beyond_Local_Save_Level/*.gil`，返回 `{mapId, name, size, modifiedAtMs}` 列表。
- `POST /api/maps/inject-library`：入参 `{ mapId, names[] }`（资产库 CSS 文件名）或 `{ mapId, scene, name }`（画布直接写）。
  内部复用 `extractTemplate` + `parseCssAsset` + `injectLibraryGil` + `verifyLibraryInjection`，
  走安全写回（SHA 锁定 → 内存验证 → 备份 `.gsts/backups/` → 写回 → 回读 → Temp 同步）。
  返回每个资产的 `{ name, containerId, copyId, groupIds }`，`containerId` 即素材索引 ID。

**网页操作**：资产库工具栏「🗺️ 写入地图」→ 选目标地图 → 勾选资产 → 确认 → 写入。
结果弹窗展示每个资产的素材索引 ID；「写入地图 vs 批量导入」知识说明见左侧面板。

**注意**：素材库注入只支持 **CSS 资产**（`parseCssAsset` 走 `.shaper-container`/`.shaper-element` 图元语法）；
SVG/JSON 资产需先「载入画布」再「存回」为 CSS，或直接用画布 scene 写入。

## GIA 文件命名规范（2026-08-21 确立）

| 场景 | 组名 | 文件名 | 说明 |
| --- | --- | --- | --- |
| 资产库批量导入 | 资产 stem（`guide-tap`） | `资产stem.gia`（`guide-tap.gia`） | 自动按文件名去扩展名 |
| 画布手动导出/注入 | 用户填写的 groupName | `groupName.gia` | 默认日期（YYYYMMDD） |
| 画布手动导出（无组名） | 默认日期（`20260821`） | `日期.gia` | 不再用 `image.gia` 冲突 |

## 资源 ID 解析

每个 GIA 中的图片资源条目（class=15, kind=8）包含：
- `guid`：游戏内唯一资源 ID（`>= 1073743366`）
- `name`：图元名字（从 `ui.content` 的 `505→502=15→12→501` 提取；元素无 name 时 empty）

`parseImageGiaInventory(bytes)`（`server.ts`）解析 GIA 字节 → `{ groupName, resources: [{guid, name}] }`，
供前端展示和 AI 后续使用。

## AI 生成工作流

可让 AI（模型）按标准格式契约生成图片资源，全链路已打通：

1. 加载 `image-css-builder` 或 `image-svg-builder` 技能。
2. AI 按技能里的格式契约（调色板、图层规划、预算分配、输出样板）生成 CSS/SVG。
3. 本地自校验：`gsts image:import <file> --source-type css|svg --output scene.json --verbose`。
4. 导出 GIA 素材：`gsts image:export scene.json --format gia --output素材.gia --group-name <名>`。

两个技能均包含完整的输出前检查清单与沉默失败模式表，确保 AI 生成质量可控。

### 实操闭环（当前推荐路线）

```
AI 写 CSS → 放入资产库目录（image:serve --assets-dir）
         → 网页每 2s 自动刷新列表（用户无需刷新页面）
         → 用户人工审美（网页上直接看预览）
         → 反馈"哪里没改好" → AI 改 CSS → 资产目录 → 网页自动更新
         → 用户满意 → 网页勾选多个资产 → 批量导入（自动命名 资产名.gia）
         → 游戏内加载外部资产 → AI 扫描已导入资源 ID（/api/assets/imported）
         → AI 拿 ID 写节点图交互逻辑
```

- 好的资产留在目录里可复用；不需要的在网页上点「删除」。
- 网页上可微调画布并「存回」覆盖资产文件，形成人工修正。
- 示例资产：`assets/images/guide-*.css`（引导箭头/点击/高亮框/按钮，AI 生成）。

## 与游戏内交互引导结合

图片素材 + genshin-ts 已有能力可组合出"AI 生成引导 → 节点图驱动"的交互引导：

| 环节 | 使用的能力 | 工具/命令 |
|---|---|---|
| AI 生成引导图片（箭头/按钮/图标/装饰） | `image-css-builder` / `image-svg-builder` | 模型按契约生成 CSS/SVG |
| 写入地图素材库（容器 ID = 素材索引 ID） | `assets:library-inject` | `gsts assets:library-inject --gil <map> --write` |
| 图片控件引用素材（官方预制，单条记录） | `assets:ui`（root9） | `gsts assets:ui create --type image --asset <素材索引ID> --write` |
| 屏幕 UI 控件（文本框/按钮） | `assets:ui`（root9） | `gsts assets:ui create --type textbox|interactive-button` |
| 选项卡输入（最多 10 项） | `assets:static-assemblies tab-options` | `gsts assets:static-assemblies tab-options` |
| 节点图事件驱动（显示/隐藏/切步骤） | NodeGraph 事件（whenTabIsSelected 等） | 编译注入 → `verify-injection` |
| 游戏日志验证 | `debug-log-investigator` | 日志帧值分析 |

> 图片控件引用素材的 wire 已闭合（2026-08-22 差分）：`f505[f502=38].f503.f31.f6.f4` = 素材索引 ID。
> 完整链路「AI 生成素材 → 写入素材库 → 图片控件引用 → 布局显示」已打通，待游戏内核验显示效果。

## 导入规则要点

- **CSS**：读 `.shaper-container` 宽高；图元须带 `left/top/width/height`；
  形状判定顺序：border 三角 → `clip-path` 三角 → radial-gradient 圆环 → `border-radius:50%` 椭圆 → 矩形；
  旋转取 `transform: rotate(...)` 并**取反**（屏幕顺时针 → 场景 CCW）；容器背景被忽略并告警；
  越界自动扩展画布。
- **SVG**：支持 `rect / circle / ellipse / 三顶点 polygon`；`transform` 不支持；
  不支持节点收集为 warning；圆环 SVG 导出时忽略（导入器无 `<path>`，无法无损往返）。
- **JSON**：完整 SceneDocument / `{elements}` / 裸数组三种结构；缺画布时按图元外接范围自动拟合。

## GIA image 模式格式（逆向结论）

- 文件结构：20B 头（`[0:4]=20+contentLen`，`[16:20]=contentLen`）+ content + 4B tail。
- 主资源（Root field 1）：identity + reference_list(field 2) + internal_name(field 3) + ui(field 19 → content field 1)。
- UI image 依赖条目（field 2，class=15，kind=8）：identity + `resource_class=15`(field 5) +
  `ui.content`(field 19→1)，content 含 guid(501)、info(502，guid/index 包装)、parent(504)、
  data(505：name / field14 / transform / image_settings)。
- children 语义：ui.content 里 field 503 varint 列表；模板里额外有一块 packed(wire 2) 503，
  **补丁只替换 varint 条目、保留 packed 块**（上游模板实证）。
- 图层顺序：GIA children 与编辑器 z 序相反，转换时整体 reverse。
- 组名写主资源 internal_name(field 3)；mask 设置替换 505 数据里 subfield502=56 的条目。

## 验证状态（分层）

| 层 | 状态 |
| --- | --- |
| 自动回归（导入/导出往返） | ✅ `npm run test:image-editor` |
| 字节级对照（TS vs Python 参考实现） | ✅ `tests/image-editor/fixtures/golden-image-mode.gia` 逐字节相等 |
| 结构回读（class=15 条目/children/组名/mask） | ✅ 自动断言 |
| 真实游戏加载核验 | ⏳ 待用户：把 `out.gia` 放入游戏图片素材目录验证显示 |

模板来源：上游仓库为 GPL-3.0，本仓库只收录游戏导出格式数据（模板字节）并注明来源；
TS 移植为本仓库独立实现。用户也可用游戏内新建图像导出的 GIA 作为模板
（`image:export --template <自备模板>`）。
