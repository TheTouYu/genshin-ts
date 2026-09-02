# 02 通道资产：信号注册 + 技能配置 + 图位确认

## What to build
1914 上建算力通道 CLI 资产（先干跑 --output 再 --write，编辑器/游戏零重叠）：
- 回传信号：rbx_echo(tag:str, e:int)（(str,int) 布局免 donor）；角块单元票 #05 再注册 rbk_echo
- 28+瞬发技能配置 ×1（十字单元；CLI assets:skill-config create，root20 联动自动）
- 图位：确认复用用户预建 435(20008)/438(20009)/439(20007)，注入前 patch graph-clear（编辑器默认名）
- 信号必须 --write 真实写回后才能编译信号类客户端图（技能铁律）

## Blocked by
- 01

## 验收项
- [x] signals inspect 核对 rbx_echo 三元组布局（send=1610612765/monitor=66/server=67，[tag:str val:int]）
- [x] 技能配置：**复用已存在 1191182338「测试-CLI造物-瞬发」**（28+instant+body-78-f4+model 10005001，与足球 1908 游戏实证 GSTS-fb-calc 逐字段同构，已绑 435）——零新建
- [x] 写入后主图 SHA=干跑候选 081ffc9a ✓；Temp 副本手动同步复验一致（坑③流程）
- [x] 图位确认：435(20008)/438(20009)/439(20007) 用户预建空图在位；遗留=435 另被旧 28+normal 配置 1191182337 重复绑定（#04 编辑器引用瞬发版即可，不删）
- [x] 精确 commit（本票仅改看板/票文件；地图资产无仓库文件）
