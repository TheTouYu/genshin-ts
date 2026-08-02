# Signals

Signals are custom stage-wide events. A formal GIA can carry signal definitions, and the editor can import that GIA into another map and register a previously missing signal. Direct GIL injection keeps registration explicit: use `gsts assets:signals` first, then inject the NodeGraph. The compiler and injector use the target `.gil` registry and reject missing names or schema mismatches; cross-map injection rebinds donor send/monitor/server identities by signal name.

## Basic Usage

String-based usage is still supported. It is useful for no-parameter signals or code that does not need type hints:

```ts
import { g } from 'genshin-ts/runtime/core'

g.server({ id: 1073741825 }).on('whenEntityIsCreated', (_evt, f) => {
  f.sendSignal('ready')
})

g.server({ id: 1073741826 }).onSignal('ready', (_evt, f) => {
  f.printString('ready')
})
```

The global helper can also send a signal:

```ts
send('ready')
```

## Using Extracted Signal Definitions

When `inject` is configured, the compiler extracts signal definitions from the map into `src/resources/signals.ts`. Import `Signal` from that file to get typed parameters for both `sendSignal` and `onSignal`.

```ts
import { g } from 'genshin-ts/runtime/core'
import { Signal } from './resources/signals'

g.server({ id: 1073741825 }).on('whenEntityIsCreated', (_evt, f) => {
  f.sendSignal(Signal.signal_param_literal, 7n, 'ready', true)
})

g.server({ id: 1073741826 }).onSignal(Signal.signal_param_literal, (evt, f) => {
  const amount = evt.params.参数_1
  const label = evt.params.参数_2
  const enabled = evt.params.参数_3

  f.printString(f.dataTypeConversion(amount, 'str'))
  f.printString(label)
  f.printString(f.dataTypeConversion(enabled, 'str'))
})
```

`Signal.xxx` carries the signal name, parameter names, and parameter types. TypeScript checks the argument count and types when sending, and `evt.params.<paramName>` exposes typed parameters when listening.

## Literal and Wired Parameters

Signal parameters can mix literal values and wired node outputs:

```ts
g.server({ id: 1073741825 }).on('whenEntityIsCreated', (_evt, f) => {
  const amount = f.addition(2n, 3n)
  f.sendSignal(Signal.signal_param_literal, amount, 'ready', true)
})
```

In this example, the first parameter is a node output and the other two are literals. The compiler writes all of them to the corresponding parameter pins on the same send-signal node.

## Notes

- `Signal.xxx` comes from the extracted map data; after editing signals in the editor, save the map first, then rerun compilation to extract the updated signal information.
- The extracted registry also carries the real send/monitor/server SignalDef identity and pin layout used by GIA encoding.
- Editor GIA import and direct GIL injection are different workflows: editor import can register definitions carried by the GIA, while direct GIL injection requires `assets:signals register/update` first.
- A missing target registration or schema mismatch remains an error for direct GIL compilation/injection.
- String-based usage does not provide parameter names or parameter type hints.
