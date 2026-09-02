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
- [ ] signals inspect 核对 rbx_echo 三元组布局
- [ ] 技能配置清单可见 28 模板+瞬发+绑 435
- [ ] 干跑候选与回读一致；Temp 同步核查
- [ ] 精确 commit
