# Knowledge capture and memory synchronization workflow

Committed-baseline intake, bounded retrieval, serial semantic planning, exact-hash Bundle approval, apply verification, and reusable error prevention.

<!-- CLAIM:START clm_F25959994F5CD6EEE49495F001 -->

### Knowledge capture should use one serial plan and an exact-hash apply gate

For recurring project knowledge capture, start from explicitly identified committed changes, use the canonical project entry python tools/pkc.py, perform one bounded retrieval, and mutate one knowledge-plan serially for Claims, Authority Refs, and only justified stale refreshes. After all mutations run one final delta check and finalize; display the immutable Bundle ID/content hash and require human confirmation of that exact hash before approve/apply. After apply, rebuild and validate the projection, inspect the tree, run git diff --check, and keep current Memory synchronized with the canonical workflow and error notes.

#### 适用边界

This governs the Genshin-TS PKC capture workflow only. Working-tree observations remain protected and cannot become Authority; automatic PKC validation proves knowledge/projection consistency, not compiler, GIA, editor, or game behavior. It does not authorize source changes, map operations, injection, or Git publication without separate task authorization.

<!-- CLAIM:END clm_F25959994F5CD6EEE49495F001 -->
