# g.server Options and Entry

Common options:
- `id` / `name` / `prefix` / `type` / `mode`
- `variables`
- `lang`

## `mode` (graph mode)

- Default is Beyond Mode: omitting `mode` is equivalent to `mode: 'beyond'`.
- You can explicitly use Classic Mode: `g.server({ id: 1073741825, mode: 'classic' })`.
- Classic Mode does not allow `type: 'class'` and throws an error.
- Node availability is mode-aware; calling a mode-specific node in the wrong mode throws (for example `... is classic mode only` / `... is beyond mode only`).

## `type` (server graph subtype)

- Allowed values: `'entity' | 'status' | 'class' | 'item'`.
- Default value: `'entity'`.
- When `mode: 'classic'`, `type` must be `'entity' | 'status' | 'item'`.

## `variables` (graph variable definitions)

- Each field in `variables` becomes a graph variable and gets typed `f.get('name')` / `f.set('name', value)`.
- Supports primitives, lists, and dictionaries.
- For complex dictionary key/value shapes, prefer explicit `dict(...)` declarations.
- Common dictionary key types: `str` / `int` / `entity` / `guid` / `faction` / `config_id` / `prefab_id`.
- Dictionary value types support scalar values and list values; complex shapes such as `int -> config_id_list` and `int -> float_list_list` are supported.

Example (excerpt):

```ts
g.server({
  id: 1073741867,
  variables: {
    d_str_entity_list: dict([{ k: 'elist', v: list('entity', new Array(3)) }]),
    d_int_config_list: dict([
      { k: 123, v: [configId(1), configId(2)] },
      { k: 345, v: [configId(3), configId(4)] }
    ]),
    d_int_float_2d: dict([
      {
        k: 123,
        v: [
          [1, 2, 3],
          [4, 5, 6]
        ]
      },
      {
        k: 345,
        v: [
          [7, 8, 9],
          [10, 11, 12]
        ]
      }
    ])
  }
})
```

For the full runnable cases:
- https://github.com/josStorer/genshin-ts/blob/master/tests/variables_definition_test.ts

## Component-owner events

Some component events are sent to the graph associated with the **component owner**, not to the
graph that initiated an operation. For example, `whenBasicMotionDeviceStops` is sent to the owner
of the Basic Motion Device component when a motion completes or is disabled.

Starting a motion device for entity B from graph A therefore does not make the stop event return to
graph A. If graph A must continue a state machine, use one of these explicit structures:

1. attach the listener graph to entity B and handle the event there;
2. listen in entity B's graph and forward the required data to graph A with a
   [signal](./signals.md);
3. when the gameplay contract allows it, use an explicit timeout or another synchronization
   condition and handle late events.

In the handler, `evt.eventSourceEntity` identifies the component owner and
`evt.motionDeviceName` can distinguish motion devices. Name filtering does not change event
ownership and does not by itself handle duplicate names, restarts, disables, or late events.

The compiler currently does not prove that the controlled entity is the current graph's component
owner, and it does not generate cross-entity signal forwarding automatically. A successful build
only proves that a graph can be generated, not that the completion event returns to the caller.

Injection requirements:
- Target graph must exist and be empty or start with `_GSTS`.
- New graphs must be saved before injection can detect them.
