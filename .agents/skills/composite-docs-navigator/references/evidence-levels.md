# Evidence levels for composite/GIA work

Use these labels explicitly. Similar-looking facts from different layers must not be collapsed.

| Label | Meaning | Safe claim |
|---|---|---|
| `当前代码实现` | Behavior in the current repository source | “当前 gsts 会……” |
| `真实 GIA 观察` | A field/topology/value observed in a real `.gia` | “样本文件中观察到……” |
| `真实地图扫描` | A map or `.gil` target found by an actual command/scan | “扫描发现……” |
| `自动回归` | A reproducible script/build/test result | “自动测试验证……” |
| `注入成功` | Injector replaced the selected target | “已注入到……” |
| `游戏内验证` | User or recorded game evidence confirms behavior | “用户确认游戏内……” |
| `历史记录` | Handover or prior investigation | “历史上曾……” |
| `待验证` | Hypothesis, TODO, or incomplete evidence | “尚待验证……” |

## Mandatory separations

- A decoded JSON value does not prove protobuf field presence.
- A recent `[recent]` map is a candidate, not proof of the intended user map.
- `mapId` identifies the `.gil` map file; `nodeGraphId` identifies a graph inside it.
- `nodeGraphId = 1073741825` is an observed new-map convention, not a universal guarantee.
- Successful injection does not prove correct game behavior.
- A trace tool showing `Bol` does not prove the editor control works.
- One game-tested type does not prove a whole type family.

## Reporting evidence

For real-file or map claims, record:

```text
file/path:
command:
observation:
conclusion:
scope:
```

For implementation claims, record:

```text
source file/function:
test or build command:
result:
game verification: yes / no / pending
```
