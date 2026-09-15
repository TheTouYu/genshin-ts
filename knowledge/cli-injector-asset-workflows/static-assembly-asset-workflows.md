# Static assembly and prefab-update asset workflows

staticAssemblies/staticPrefabUpdates 组件槽读写契约、CLI 行为与真实写回

<!-- CLAIM:START clm_2A0776BD30AF4352927C2268E7 -->

### staticPrefabUpdates.removeComponents 组件移除契约

GstsStaticPrefabUpdate.removeComponents 以组件类型码列表从元件定义（root4 记录槽 8）与场景实例（root8 记录槽 7）双写移除组件槽；识别方式与 setStaticAssemblyComponents 同源（子字段 1 varint 类型码）；记录中不存在的类型码静默跳过并在结果中回报实际移除清单 removedComponents；与 components 对同一类型码互斥（fail closed）。提交 1ff4d6a；自动回归 tests/gil_static_prefab_updates.ts 与 static_assembly_public_config.ts 全绿。

#### 适用边界

只描述 CLI 契约与自动回归证据；不覆盖未验证的组件内部字段语义；真实地图写回与游戏行为不在本 claim 范围。

<!-- CLAIM:END clm_2A0776BD30AF4352927C2268E7 -->

<!-- CLAIM:START clm_4E6B4004C26AA352234B6DFD1F -->

### 实体导入的输入颜色必须是 #RRGGBB 字符串，导出读到的却是整数

assets:entities 导入的输入 JSON 中 color 字段必须是 '#RRGGBB' 形式的字符串；写成整数（即使语义等价于 0xAARRGGBB）会被直接拒绝并报 entities[0].color must be '#RRGGBB'。而导出实体时 color 呈现为整数 rgb（例如 4288323750 即 0xAARRGGBB）。因此导入与导出的颜色表示不同构，拿导出样本直接当导入模板必然失败。CLI 会把 '#RRGGBB' 解析为 0xFFRRGGBB（alpha 固定为 FF）。

#### 适用边界

仅描述颜色字段的输入输出表示差异，不含其它字段。导入实体时 id 可省略（由 CLI 自动分配下一个空闲 GUID），这一点与颜色字段不同——id 缺失是允许的，颜色格式错误是硬拒绝。

<!-- CLAIM:END clm_4E6B4004C26AA352234B6DFD1F -->
