# 节点图书页式布局规范与自动布局引擎

2026-08-11 用户确认的书页式布局规范：横向长线、多线堆叠成行、超限自动拆线分叉、叉子对齐、数据源跟随；引擎 graph_layout.ts 自动布局 + lint

<!-- CLAIM:START clm_D724F6EB325FFD8A791E37502B -->

### 书页式布局规范与自动布局引擎行为（2026-08-11 用户确认）

节点图布局采用书页式规范：长线横向（从左到右，NODE_X_STEP=800），多条长线从上到下堆叠成行（ROW_Y_STEP=900），事件起点为长方形代码块（块间距 BLOCK_Y_GAP=1200）从上到下排列；一条长线 ≤10 个控制流节点（LINE_LIMIT），超限时 layout 命令自动升级为分叉线（断开超限点、新线头追加到入口 OutFlow，每条线独立成行，幂等）；分支=叉子：分支节点与上游同行（水平对齐），out[0] 同行右侧，其余出口同一 x 列垂直排列；入口分叉时 out[1..] 从行首垂直排列；数据源跟随消费者（单节点贴边间隙 400，运算链横排，>5 建议复合）；lint 10 类违规：flow-upward/flow-backward/chain-vertical/long-chain/block-order/line-align/data-detached/data-chain-long/island/overlap。引擎 src/cli/static_assembly/graph_layout.ts（autoLayout 坐标 + planFlowUpgrade 拆线 + checkLayout lint），CLI assets:node-graphs layout --check/--output/--write。

#### 适用边界

布局规范适用于节点图视觉整理与自动重排，不包含 GIL 字节编码规则（见 wire-rules）；参数值（行距/步进/上限）为当前引擎默认，变更需用户确认；不适用于 GIA 生成链路坐标（GIA 有独立随机抖动）。

<!-- CLAIM:END clm_D724F6EB325FFD8A791E37502B -->
