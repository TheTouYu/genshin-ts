# Autosolve verification: layered evidence (algorithm offline, runtime log, injection read-back, user)

Verify in layers: offline algorithm simulation (verify-corner-macros.mjs, 3000-8000 samples) proving macro preservation/convergence; runtime log trajectory (dbgVal=solveMask, solve_seq, solver_cp/co/ep/eo publish, 0403 exec) with BigInt parsing for uint64 negative display; injection read-back (explain real GIL) + maps:resync + md5; user in-game retest as final authority.

<!-- CLAIM:START clm_0F2EC6DB0371AF423DB3B3B886 -->

### Rubik autosolve verification is layered: offline algorithm simulation first, then runtime log trajectory, injection read-back, then user retest

For rubik-3x3 autosolve fixes, verification is layered and each layer is independent evidence: (1) offline algorithm layer — simulate with real logic tables and macro tables (verify-corner-macros.mjs, >=3000 samples) to prove macros preserve already-solved pieces and converge, before touching runtime; (2) runtime layer — read log trajectories (dbgVal is solveMask string; solve_seq is full 100-entry solveBuf dump with only solve_len prefix valid; solver_cp/co/ep/eo publish after each turn; exec sequence 0403 curMove) and compare; parse negative integers with BigInt (Integer field shows uint64 -2=18446744073709551614, List element shows uint8 -2=254); (3) injection layer — compile --noinject, inject, explain real GIL to verify nodes/connections/pins, maps:resync, md5 Save_Level vs Temp must match; (4) user in-game retest is final authority. Compile success != injection correct != game behavior correct.

#### 适用边界

Methodology reusable for any node-graph fix in this project; BigInt/uint64-vs-uint8 note specific to gia_log.py frames output.

<!-- CLAIM:END clm_0F2EC6DB0371AF423DB3B3B886 -->
