# 票 04 CLI 命令输出样例（真实快照）

> 生成：2026-09-03（加严全量核验后捕获）· 命令全部只读，源 .gil 未修改。
> 样例快照：`.gsts/diff-exp/ui学习/1073741909.after-重启66-默认页签2-7468eadd.gil`（重启轮66 终态）。
> 其余完整输出可在本机按「复现命令」重新生成；`/tmp/ui-list-flat-json.json`（6820行）/`/tmp/ui-list-tree-json.json`（9254行）为当次全量捕获。

## 1. `assets:ui list --flat --format text`

```
$ node bin/gsts.mjs assets:ui list --flat --gil "<round66.gil>" --format text
[layout] 默认布局 id=1073741825 path=布局:默认布局
[official] 小地图 id=1073741826 path=布局:默认布局:官方预制#1
[official] 技能区 id=1073741827 path=布局:默认布局:官方预制#2
...
[message-queue] 消息队列 id=1073742132 path=布局:默认布局:消息队列#1 pos=791.0,574.5 size=369.0x429.0 align=center maxItems=4
[material-group] 默认状态素材组 id=1073742151 path=布局:默认布局:消息队列#1:素材组#1 pos=undefined,undefined size=48.0x48.0
[material-member] 图片 id=1073742152 path=布局:默认布局:消息队列#1:素材组#1:素材成员#1 pos=undefined,undefined size=80.0x80.0
...
[library] 控件组库 id=1073741840 path=控件组库
  [custom-button] 自定义按钮 id=1073742034 path=控件组库:自定义按钮#1 pos=1505.8,33.0 size=180.0x52.0 states=常态/悬停/按下/禁用
...
```

要点：每行 = `[kind] name id=ID path=路径 [pos/size/text/color/…]`；`undefined` 表示该控件没有位置对（默认中心/未移动），JSON 中对应字段不存在。

## 2. `assets:ui list --tree --format text`

```
$ node bin/gsts.mjs assets:ui list --tree --gil "<round66.gil>" --format text
[layout] 默认布局 id=1073741825 path=布局:默认布局
  [official] 小地图 id=1073741826 path=布局:默认布局:官方预制#1
  ...
  [message-queue] 消息队列 id=1073742132 path=布局:默认布局:消息队列#1 pos=791.0,574.5 size=369.0x429.0 align=center maxItems=4
    [material-group] 默认状态素材组 id=1073742151 path=布局:默认布局:消息队列#1:素材组#1
      [material-member] 图片 id=1073742152 path=布局:默认布局:消息队列#1:素材组#1:素材成员#1
    [material-group] 默认状态素材组 id=1073742153 path=布局:默认布局:消息队列#1:素材组#2
      [material-member] 文本框 id=1073742154 path=布局:默认布局:消息队列#1:素材组#2:素材成员#1 ...
[layout] 自定义布局 id=1073741989 path=布局:自定义布局
  ...
[library] 控件组库 id=1073741840 path=控件组库
  [custom-button] 自定义按钮 id=1073742034 path=控件组库:自定义按钮#1 ...
    [material-group] 默认状态素材组 id=1073742035 path=控件组库:自定义按钮#1:素材组#1
      [material-member] 文本框 id=1073742036 path=控件组库:自定义按钮#1:素材组#1:素材成员#1 text=大力射门! ...
```

要点：缩进反映 Surface 树（布局面 / 控件组库→悬浮页→容器→控件→素材组→素材成员）；页签页面项为字符串 id 虚拟子节点（如 `2097:page#1`）。

## 3. `assets:ui list --flat --format json`（消息队列节点节选）

```json
{
  "flat": [
    {
      "geometry": { "deviceSlots": 4, "position": [791.0000219345093, 574.4999847412109],
                    "size": [369, 429], "slotsConsistent": true },
      "id": 1073742132,
      "kind": "message-queue",
      "name": "消息队列",
      "path": "布局:默认布局:消息队列#1",
      "props": {
        "align": "center", "hasFlag509": true, "insertAt": "head", "maxItems": 4,
        "messages": [
          { "index": 1, "name": "消息项_2", "styleIndex": 2 },
          { "index": 2, "name": "消息项_1", "styleIndex": 1 }
        ],
        "styles": [
          { "groupId": 1073742151, "index": 1, "name": "样式_1", "styleIndex": 1 },
          { "groupId": 1073742153, "index": 2, "name": "样式_2", "styleIndex": 2 }
        ],
        "timedShow": true, "timedShowSeconds": 5
      },
      "refs": { "styleGroups": [1073742151, 1073742153] },
      "role": "instance",
      "unknown": ["queue.type78.undecoded(只读透传)"]
    }
  ]
}
```

顶部还有 `schemaVersion / kind:"ui-semantic-view" / sourceSha256 / recordSetHash / tree` 字段（prettyStableJson 按键名排序后 `flat` 排在前面）。

## 4. `assets:ui anchor save`

```
$ node bin/gsts.mjs assets:ui anchor save --label smoke-r12 --gil "<round12.gil>"
anchor saved: smoke-r12 (1073741909) hash=8974dfcedba833fd0ba701a4486733fd677b63624a6e02d706e179425d164dc0
file=/home/h/genshin-ts/.gsts/ui-anchors/1073741909.json
```

## 5. `assets:ui anchor list`

```
$ node bin/gsts.mjs assets:ui anchor list
smoke-r12    1073741909    2026-09-02T15:04:36.736Z    8974dfcedba833fd0ba701a4486733fd677b63624a6e02d706e179425d164dc0
```

## 6. `assets:ui diff --anchor`

```
$ node bin/gsts.mjs assets:ui diff --anchor smoke-r12 --gil "<round13.gil>"
diff vs anchor "smoke-r12"
# 记录集已变：added=0 removed=0 changed=1 reanchored=0
PLAYER [custom-button] 布局:默认布局:自定义按钮#1 (1073742032) fields=geometry
  提示: 玩家/创作者改动（布局实例或悬浮页实例侧）
  提示: 实例侧已改未同步; 提示 sync 广播
```

## 复现命令

```bash
GIL66=".gsts/diff-exp/ui学习/1073741909.after-重启66-默认页签2-7468eadd.gil"
GIL12=".gsts/diff-exp/ui学习/1073741909.after-重启12-同步位置广播-93472167.gil"
GIL13=".gsts/diff-exp/ui学习/1073741909.after-重启13-玩家细排位置-2f8f0205.gil"
node bin/gsts.mjs assets:ui list --flat --gil "$GIL66" --format text
node bin/gsts.mjs assets:ui list --tree --gil "$GIL66" --format text
node bin/gsts.mjs assets:ui list --flat --gil "$GIL66" --format json
node bin/gsts.mjs assets:ui anchor save --label smoke-r12 --gil "$GIL12"
node bin/gsts.mjs assets:ui anchor list
node bin/gsts.mjs assets:ui diff --anchor smoke-r12 --gil "$GIL13"
```
