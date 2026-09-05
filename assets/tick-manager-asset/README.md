# TickManager 可复用资产（多档频率信号版）

> status: draft · 2026-09-05
> 目标：低负载服务端 TickManager 资产，其他项目可复用。

## 为什么是“多档频率信号”

旧 TickManager 只发一个高频 `TickUpdate`，低频消费方也会被高频信号反复唤醒。
本资产改为按档位发 `TickUpdate_60 / _200 / _1000`：

- 60ms 消费方监听 `TickUpdate_60`
- 200ms 消费方监听 `TickUpdate_200`
- 1000ms 消费方监听 `TickUpdate_1000`

低频消费方不会收到高频广播，无效门卫执行大幅减少。

## 资产内容

```text
src/signals.ts       三档信号 schema
src/tick-manager.ts  主图：单个基础心跳定时器 + tick 计数 + 分档发信号
gsts.config.ts       编译配置（donor 地图信号注册表）
.donor/              仅用于编译的 donor .gil 副本（不入库/不入游戏）
tick-manager.gia     编译产物快照（单主图 23 节点，可直接复制到目标项目）
dist/src/tick-manager.gia  本地编译输出（dist 不入库）
```

## 使用方式（DSL 项目）

1. 把 `assets/tick-manager-asset/src/signals.ts` 复制进目标项目 `resources/` 或 `src/`；
2. 在目标地图注册三档信号：
   `TickUpdate_60/_200/_1000`，参数均为 `manager:entity, now_ms:int, interval_s:float`；
3. 建一个专用空模型实体/定义作为 TickManager；
4. 在该实体注册自定义变量 `tm_beat_interval_s`（float，秒，默认建议 `0.06`）——
   主图在实体创建时直接读这个变量启动心跳，用法与足球现有 TickManager 一致；
5. 挂载编译出的 `tick-manager.gia` 主图到该实体；
6. 建议在 TickManager 实体上配置全局计时器组件 `GlobalTick`；
7. 消费方图里监听自己需要的档位：
   ```ts
   .onSignal(TickManagerSignal.tick200, (evt, f) => {
     // evt.params.manager / evt.params.now_ms / evt.params.interval_s
   })
   ```

> 说明：消费方目前推荐直接使用 Genshin-TS 的 `.onSignal`；本资产暂不提供编辑器拖拽式
> “Update 监听复合”，因为那需要独立的监听器 GraphUnit/复合导出形态，后续可按需补充。

## 编译

先准备 donor（复制足球.gil 并注册三档信号，只写本资产 `.donor/`）：

```bash
bash assets/tick-manager-asset/scripts/make-donor.sh
```

然后编译：

```bash
cd assets/tick-manager-asset
GSTS_BEYOND_LOCAL_ROOT="$(pwd)/.donor/BeyondLocal" node ../../bin/gsts.mjs -c gsts.config.ts --noinject
```

## 测试

- 结构层：用扩展后的 GIA 读图命令：
  ```bash
  npx tsx tools/list-gil-node-graphs.ts assets/tick-manager-asset/dist/src/tick-manager.gia
  npx tsx tools/parse-gil-node-graph.ts assets/tick-manager-asset/dist/src/tick-manager.gia --list
  npx tsx tools/explain-gil-node-graph.ts assets/tick-manager-asset/dist/src/tick-manager.gia --graph _GSTS_TickManagerAsset
  ```
- 行为层（后续）：在真实地图副本挂载后，用 Beyond_Debug_Log 对比低频消费方每秒唤醒次数与负载。
