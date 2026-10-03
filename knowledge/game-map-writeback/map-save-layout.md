# Map save layout and target resolution

新版编辑器子目录式 Save_Level/<mapId>/<mapId>.gil 与旧版平铺并存的双布局解析、Temp/gip 布局事实与 gsts 定位/建图约束。

<!-- CLAIM:START clm_83B7580642D70CC2613843FC9C -->

### 千星新版存档为子目录式 Save_Level/<mapId>/<mapId>.gil，解析须双布局且子目录式优先

新版编辑器（2026-09-30 Arch+wine 实测，玩家 110170759）把地图存为子目录式 Beyond_Local_Save_Level/<mapId>/<mapId>.gil（同级常带空 external_lua_file/ 目录），而 Temp 侧仍是平铺 <mapId>.gil 且编辑器列表只读 Temp/Beyond_Local_Save_Player.gip；旧版存档为平铺 Save_Level/<mapId>.gil。gsts 全部地图解析点统一走 gilPathInSaveLevel 双布局解析，子目录式优先——它只可能出自新版编辑器，与平铺并存时总是较新写入；listMaps 识别子目录式并对平铺同名去重，否则 maps:create 的 nextId（现有最大 ID+1）会算出撞 ID 的新图。

#### 适用边界

仅 China 区 wine 存档单一地图样本（1073741825）实测；Temp 平铺为新版编辑器自身行为、无需适配；Global 区未测；旧号地图在新存档不可复活（nextId 机制）。

<!-- CLAIM:END clm_83B7580642D70CC2613843FC9C -->

<!-- CLAIM:START clm_92F5CE2AB74E6D308FDF08FA7C -->

### 写回链基准目录必须 saveLevelDirOf(gilPath)，禁止 path.dirname(gilPath) 直用

assets_* / gil_graph_mounts 等写回链的备份目录（.gsts/backups）、Temp 同步与 gip 注册的基准目录必须用 saveLevelDirOf(gilPath) 从 .gil 绝对路径反推 Save_Level 根；直接 path.dirname(gilPath) 在子目录式布局下得到 Save_Level/<mapId>，Temp/gip/备份全部算到错误位置，且 syncGilToTemp 对不存在的 Temp 目录静默返回 null——同步悄悄失效而非报错。

#### 适用边界

适用于 src/cli/assets_* 与 gil_graph_mounts 的写回路径；writeBack 的原子重命名临时文件仍须与目标 .gil 同目录（dirname 正确用法）；CLI maps:create 仍写平铺（旧版兼容），新版编辑器打开保存后自迁移子目录式，双布局解析自愈。

<!-- CLAIM:END clm_92F5CE2AB74E6D308FDF08FA7C -->
