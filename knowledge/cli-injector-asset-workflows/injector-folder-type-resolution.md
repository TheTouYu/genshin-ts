# collectFolderIndexes category resolver

Exact category seams: collectFolderIndexes, findFolderEntryField, resolveGraphTypeForTypeValue.

No claims are created by this structure Bundle.

<!-- CLAIM:START clm_0B1B304C292DBF00D1A82805F5 -->

### 注入器文件夹类型解析（collectFolderIndexes/resolveGraphTypeForTypeValue）

### 注入器文件夹类型解析（collectFolderIndexes/resolveGraphTypeForTypeValue）

src/injector/folder.ts:collectFolderIndexes 单次遍历 len-fields 收集文件夹条目（6.1）、内容字段（6.1.3）、元数据字段（6.1.2.4），按 dataStart 排序后为每个文件夹条目定位其内容字段与 parseFolderContent；DEFAULT_GRAPH_TYPE_VALUES 定义默认图类型值映射（type→value），resolveGraphTypeForTypeValue 反查（value→type）；findFolderEntryField 定位文件夹条目字段；parseFolderEntry 解析单条目。

#### 适用边界

来自 src/injector/folder.ts 当前实现；CLI/injector 内部 wire 分类逻辑；以 committed 源码为准。

#### 适用边界

来自 src/injector/folder.ts 当前实现；CLI/injector 内部 wire 分类逻辑；以 committed 源码为准。

<!-- CLAIM:END clm_0B1B304C292DBF00D1A82805F5 -->
