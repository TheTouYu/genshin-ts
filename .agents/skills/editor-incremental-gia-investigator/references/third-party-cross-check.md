# 第三方仓库交叉核对模块

只在任务需要“用第三方仓库信息确认游戏引擎编码/语义，并与自有实验互证”时加载。
典型场景：wire 类型码/枚举、组件语义、节点参数类型、变量类型等，用户不提供内部
命名（游戏编程方不暴露），必须从第三方资料独立确认。

## 最小恢复字段

```text
要确认的对象（组件/变量/参数/枚举）及其 wire 观察（类型码、字段号、字节样本）
自有实验已确认的同类结论（信号 InParam type、关卡变量 discriminator、相邻快照路径）
目标第三方仓库（千星沙箱知识库 / 本地 thirdparty 代码包）
```

## 第三方仓库入口（按效率排序）

### 1. 本地 thirdparty 代码包（最快，离线）

`src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/` 是已 vendor
的第三方仓库代码，直接 grep 即可，无需网络：

```bash
# 变量类型枚举（VarType 数字 → 类型名）
grep -n "VarType = " src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.ts
# 变量条目结构（GraphVariable 接口：name/type/values/exposed/structId）
grep -n "interface GraphVariable" src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.ts
# 类型列表（TypeEntry：ID/ClientID/BaseType/DSLName）
sed -n '1,80p' src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/types_list.ts
# 自定义变量 IR 类型 offset（bool:int:float:...:prefab_id:15）
cat src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_variable_specialization.ts
```

关键经验：**wire 观察到的类型码就是 proto `VarType` 枚举值**（关卡变量 discriminator
bool=4/int=3、信号 InParam type、元件变量类型码 6/15 全部对齐）。proto 里的
`GraphVariable` 接口字段序号（name=2/type=3/values=4/exposed=5/structId=6）与 GIL wire
字段号逐一对齐，是解码变量条目的权威参考。

### 2. 千星沙箱知识库（在线，官方文档）

miliastra-knowledge skill（API 端点 `https://ugc.070077.xyz/`，**必须用 https**，
http 会 301）：

```bash
# 语义检索（找相关文档）
curl -s -X POST "https://ugc.070077.xyz/api/v1/skills/miliastra-knowledge/tools/rag_search" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'EOF' | jq -r '.data.result[].results[] | [.title, .similarity, .text_snippet] | @tsv'
{"queries": ["自定义变量 组件 类型列表"], "top_k": 5}
EOF

# 取文档全文（确认组件语义、类型说明）
curl -s -X POST "https://ugc.070077.xyz/api/v1/skills/miliastra-knowledge/tools/get_document" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'EOF'
{"titles": ["自定义变量"]}
EOF
```

已确认的官方文档锚点（2026-08-04）：
- `自定义变量`：自定义变量组件是所有单位默认挂载组件；支持类型表（整数/浮点数/字符串/
  布尔值/三维向量/实体/GUID/元件ID/配置ID/结构体 + 列表 + 字典）
- `基础概念`：节点图中的基础数据类型表 + 转换规则

## 核对流程（自有实验 ↔ 第三方）

```text
1. 从 wire 观察提取类型码（如元件变量 f3=6/15）
2. 从自有实验取已确认映射（信号 InParam type、关卡变量 discriminator，见
   docs/game-engine-knowledge/parameter-types.md）
3. 从本地 proto 取 VarType 枚举（步骤 1 的入口）
4. 三方对齐 → 类型语义 CONFIRMED；不一致时以 proto 枚举为权威、报告差异
5. 用千星官方文档确认组件/概念语义（非编码数字）
6. 把结论回填 docs/game-engine-knowledge/（components.md / parameter-types.md）
```

判定标准：wire 类型码 == proto VarType == 自有实验 discriminator 时，类型语义确认；
只靠文档文字不确认数字编码（文档不暴露内部枚举）。

## 已闭合案例（勿重做）

- 元件自定义变量组件（typeID=1，配置字段 11）：f2=名称、f3=类型码(VarType)、
  f4=默认值容器{1:类型码, 2:{1:类型码,2:0}, 10+类型码:分支}、f5=1、f6=类型引用
  {1:类型码, 2:0}；新增变量=追加同构 field-1 条目，definition f8/instance f7 双写。
  证据：component-investigation exp1/exp2 相邻快照 + proto GraphVariable。
- 类型码 6=String、15=VectorList（元件变量样本）；通用 VarType 枚举全表见
  docs/game-engine-knowledge/parameter-types.md。
- 铭牌组件（typeID=27，配置字段 38）编码见 docs/game-engine-knowledge/components.md。
