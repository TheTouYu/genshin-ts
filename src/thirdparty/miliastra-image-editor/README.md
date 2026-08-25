# miliastra-image-editor (third-party data)

图像编辑器（image mode GIA）相关第三方数据，来源与同步方式见下。

## 内容

- `template/image_template.gia` — 千星图片编辑器 `image mode`（kind=8, class=15）
  导出基底模板。导出流程以它为主资源骨架：移除全部 class=15 依赖、生成新 UI image
  节点条目、打补丁主资源 `ui.content` 的 children / mask / 组名后重建 GIA。

## 来源与许可

- 来源仓库：https://github.com/1475505/Miliastra-image-editor-webui （GPL-3.0）
  的 `backend/vendor/gia/image_template.gai`（`image_template.gia`）。
- 该文件是用户在游戏图片编辑器中导出的资产数据（400 个"圆"图元的测试模板），
  本身是游戏导出格式的编码数据，非创造性代码；移植仅做格式兼容。
- 同步：直接从上游仓库复制同名文件即可，无需转换。
- 用户也可以自行在游戏图片编辑器里新建"图像"并导出 GIA 作为模板
  （`gsts image:export --template <自备模板>`），结构兼容即可。

> 注意：上游仓库整体为 GPL-3.0。本目录只收录游戏导出格式数据（模板字节），
> 不包含上游的 Python/TS/React 代码；TS 移植为本仓库独立实现。
