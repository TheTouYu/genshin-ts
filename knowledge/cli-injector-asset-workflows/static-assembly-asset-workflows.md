# Static assembly and prefab-update asset workflows

staticAssemblies/staticPrefabUpdates 组件槽读写契约、CLI 行为与真实写回

<!-- CLAIM:START clm_2A0776BD30AF4352927C2268E7 -->

### staticPrefabUpdates.removeComponents 组件移除契约

GstsStaticPrefabUpdate.removeComponents 以组件类型码列表从元件定义（root4 记录槽 8）与场景实例（root8 记录槽 7）双写移除组件槽；识别方式与 setStaticAssemblyComponents 同源（子字段 1 varint 类型码）；记录中不存在的类型码静默跳过并在结果中回报实际移除清单 removedComponents；与 components 对同一类型码互斥（fail closed）。提交 1ff4d6a；自动回归 tests/gil_static_prefab_updates.ts 与 static_assembly_public_config.ts 全绿。

#### 适用边界

只描述 CLI 契约与自动回归证据；不覆盖未验证的组件内部字段语义；真实地图写回与游戏行为不在本 claim 范围。

<!-- CLAIM:END clm_2A0776BD30AF4352927C2268E7 -->
