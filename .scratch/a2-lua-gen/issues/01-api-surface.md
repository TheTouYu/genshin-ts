# 01 API 面盘点 — 收轮

## 结果

- `research/a2-lua-gen/api面清单.md` 落盘（14 节）：生命周期 7 函数 / 全局 API 5 / Color 4 / Script 5字段+7方法 / game 26 / Tween 11 / TweenSequence 15 / ServerSignal 20 / EnumItem 3字段 / 枚举 25 / 控件继承树（基类 36 方法 + 11 派生类）/ 裁剪面 / miliastra-lua-types 对照 / TS 类型面设计输入
- 对照结论：类型库与官方文档零名称冲突（1425 行/161 函数，同源 mhtakr07vej4，修订 09-24）；TS .d.ts 自行从镜像生成、以类型库做回归对照
- 提取方法：折叠空行+签名模式脚本（拍扁 innerText 无结构），首轮截断遗漏由对照发现并回原文验证补全（ServerSignal 20/CursorEventData 3/SetLoops 负数=无限循环）

## 验收项完成度

- [x] 三分法全表（§五/§十一，带镜像行号）
- [x] 生命周期清单（§一，OnUpdate vs OnLevelUpdate 时停区别）
- [x] Tween/TweenSequence 与控件类归属（§六/§七/§十一）
- [x] miliastra-lua-types 差异对照（§十二，未发现差异；签名级未逐参比——登记为 02 票输入而非缺口）
- [x] 裁剪面备注（§十三）

## 下一步

**02 TS→Lua 映射设计**（issues/02-mapping-design.md）——输入：api面清单.md §十四设计输入 + 现有 DSL 约束（CLAUDE.md）+ 模拟器契约
