# 静态资产拼装与几何族（static asset assembly & geometry family）

静态资产 wire 编码与几何推导：模板 ID 全审计、三级写回链、精确值断言、def/inst 挂载语义、场弧切线公式与端点约束、UI wire 子类。

<!-- CLAIM:START clm_A559EA2D19E431BB3ADB702DDE -->

### 静态拼装族：模板法 ID 全审计/三级写回链/几何推导/UI wire 子类（08-20~08-27 实证）

静态资产（元件/实体/装饰物/场地几何/UI 页面）wire 编码与几何推导规则：①模板复用必须逐字节审计所有内部 ID 引用并参数化（08-20 aux f4 槽40.f50.f502 藏模板旧宿主 ID 1077936161→游戏不显示；TEMPLATE_HOST_DEF_ID/INST_ID 占位替换）；②wire 修改走字段→section→root 三级写回链（漏一级='改了没生效'，convert root8/aux host 两次踩坑）；③字节断言用样本精确值（7 位小数，4 位显示误导：5.1272 vs 5.1272316）；④挂载按宿主类型 def/inst（定义宿主挂 def aux）；⑤场弧几何从局部轴→世界方向推导（中圈切线 rotY=atan2(-cosθ,-sinθ)），弧端点由约束线决定（罚球弧 θ_max=arccos(5.5/9.15)≈53.06°，端点 x=±36.0000），写回前本地几何断言拦截符号错（acos 负值 126.94°→端点 45.9 越界）；⑥UI wire 子类（用户 08-29 裁决归入）：packed varint 流重映射、max-uint64 等宽 5B 字节替换、f503 嵌套在 f501 内部等真实层级、引用完整性（只建 16 条漏 18 条子记录→悬空引用加载死循环）。

#### 适用边界

与 clm_5CA329CC（静态拼装颜色配置）、clm_6C67D5B4（装饰物薄片偏移）、clm_01KYGSK9（静态拼装 CLI 边界）互补；本 claim 聚焦模板复用审计、写回链与几何推导。

<!-- CLAIM:END clm_A559EA2D19E431BB3ADB702DDE -->
