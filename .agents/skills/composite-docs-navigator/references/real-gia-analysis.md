# Real GIA analysis route

Use this module when editor behavior, `.gia` differences, protobuf fields, wire bytes, or reverse-engineering conclusions are involved.

## Evidence-first sequence

1. Identify the exact real sample and its provenance.
2. Preserve a usable A/B pair: known-good, known-bad, or reference vs gsts output.
3. Inspect file size and payload hash.
4. Decode semantic structure for orientation.
5. Scan raw protobuf fields and field presence.
6. Perform decode/encode round-trip and compare bytes or hash.
7. Compare only the smallest relevant path.
8. Confirm the schema meaning with field number, wire type, and child payload.
9. Implement the smallest generic fix.
10. Add positive, raw-presence, and negative regressions.
11. Separate automatic results from game verification.

## Important limitation

`decode_gia_file()` uses protobuf defaults. Defaults can make a missing field look equal to a present field, and re-encoding can silently discard unknown fields. For protocol problems, semantic JSON is necessary but insufficient.

When JSON looks identical but the game differs, prioritize:

```text
field presence → oneof branch → type metadata → literal value
→ pin index → IDs/relatedIds/topology → layout
```

## Useful commands

Use the project’s current tools where available:

```bash
npx tsx tests/composite/trace-exec-flow.ts <file.gia> --io
npx tsx tests/composite/trace-dataflow.ts <file.gia> --list-nodes
npx tsx tools/decode-gia.ts <file.gia>
```

For a new unknown-field problem, create a focused temporary scanner or test, then preserve the final regression in `tests/` or the appropriate vendor test rather than relying on `/tmp` history.

## Claim boundary

- A wire match proves encoding evidence, not by itself game behavior.
- A focused regression proves reproducibility, not by itself editor acceptance.
- Only user/game evidence supports a “游戏内验证” claim.
