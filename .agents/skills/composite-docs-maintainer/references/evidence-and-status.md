# Evidence and status maintenance

Use the project governance labels exactly. Every new or high-risk edited document should identify:

```text
状态
来源
最近校验
适用范围
```

## Source wording

- Current code: “当前代码实现……” and cite function/file.
- Real GIA: include file path, command, observation, conclusion, and scope.
- Automatic test: say what it verifies; do not call it game verification.
- Injection: report target/output; do not call it behavioral success.
- Game verification: use only with explicit user/game evidence.
- Historical: preserve as history and link to current authority.
- Speculation: label `待验证` or `推测`.

## Protocol-specific rule

When a protobuf or GIA field is involved, semantic decoded JSON is not enough. Preserve field-presence, raw wire, or round-trip evidence when relevant, and state whether the claim applies to a specific CompositeDef type, general GIA encoding, or game behavior.

## Scope check

Before finalizing a paragraph, ask:

1. Is this a code fact, real-file observation, automatic result, injection result, or game result?
2. Does the source support the scope claimed?
3. Is the statement current, historical, or pending?
4. Would a future vendor/game update invalidate it?
