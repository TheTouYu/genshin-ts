# Timers

- `setTimeout` / `setInterval` are in milliseconds.
- Compiler builds name pools to avoid collisions.
- `// @gsts:timerPool=4` overrides pool size.
- Captured timer handles can be passed to `clearTimeout/clearInterval` inside timer callbacks (including non-self handles).
- `setInterval` <= 100ms triggers a warning.
- When a project also loads `@types/node`, unannotated callback parameters still infer graph types; use `gsts.timers.setTimeout/setInterval` to avoid the same-name Node globals entirely.
